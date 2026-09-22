const logger = require('../../config/logger');
const { AppError, ConflictError } = require('../../errors');
const syncStatusConfig = require('../../config/syncStatus');
const { mapSyncError } = require('./sync-error.mapper');
const { getGmailClient, extractEmailParts } = require('./ingestion/gmailClient');
const { fetchMessageIdsFull, fetchMessageIdsIncremental } = require('./ingestion/historyFetcher');
const { classifyEmail, isJobPlatformDomain } = require('./classification/classifier.service');
const { isLifecycleIntent } = require('./classification/intentTypes');
const aiGateway = require('../../modules/ai-providers/ai-providers.gateway');
const { QuotaExceededError } = require('../../modules/ai-providers/errors/ai.errors');
const { getVendor } = require('./extraction/ats.registry');
const { parseWithVendorRules, passesSanityCheck } = require('./extraction/ats.parsers');
const { calculateConfidence } = require('./scoring/confidence.service');
const { verificationStatus } = require('./verification/verification.service');
const { matchApplication } = require('./matching/applicationMatcher');
const { DECISION } = require('./matching/scoring.service');
const { normalizeCompany, normalizeRole } = require('./matching/normalization.service');
const { createSyncStats, timeIt, recordDrop, summarizeStats } = require('./pipeline.stats');
const repository = require('./pipeline.repository');
const notificationsService = require('../../modules/notifications/notifications.service');
const { mapStatusStringToEventType, mapEventTypeToStatus } = require('./eventTaxonomy');

// ── Regex fallback: pull role from common phrasing when the AI misses it ──
const ROLE_PATTERNS = [
  /interest in the ([A-Za-z0-9()/&+.,\- ]{2,60}?) role/i,
  /applying for (?:the )?([A-Za-z0-9()/&+.,\- ]{2,60}?) (?:position|role)/i,
  /application for (?:the )?([A-Za-z0-9()/&+.,\- ]{2,60}?) (?:position|role)/i,
  /position of ([A-Za-z0-9()/&+.,\- ]{2,60}?)(?:\.|,|\n|$)/i,
  /role of ([A-Za-z0-9()/&+.,\- ]{2,60}?)(?:\.|,|\n|$)/i,
];

const extractRoleFromText = (text) => {
  for (const pattern of ROLE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
};

// ── Per-thread mutex ────────────────────────────
// Two concurrent workers processing different messages from the SAME Gmail
// thread could both fail to see each other's not-yet-committed application
// row and each create a duplicate. Different threads still run fully in
// parallel; only messages sharing a threadId are serialized against each other.
const withThreadLock = async (threadLocks, threadId, fn) => {
  const prior = threadLocks.get(threadId) || Promise.resolve();
  let release;
  const myTurn = new Promise((resolve) => { release = resolve; });
  threadLocks.set(threadId, prior.then(() => myTurn));
  await prior;
  try {
    return await fn();
  } finally {
    release();
  }
};

// ── Process single email ──────────────────────
// Classifications written when an email was genuinely, correctly decided to be
// a non-lifecycle email (rule-gate hard-reject, or the AI's own semantic
// rejection) — these are final and should never be retried.
const TERMINAL_REJECT_CLASSIFICATIONS = new Set([
  'not_job', 'job_recommendation', 'newsletter', 'marketing',
  'security', 'otp', 'other',
]);

const processEmail = async (gmail, userId, messageId, stats, threadLocks, isInitialSync) => {
  stats.messageCount++;

  // Already processed? Only skip if that outcome was actually final. A row
  // with is_job_related=1 and no application_id means classification/
  // extraction succeeded but something crashed before an application was
  // created (e.g. the company_aliases/role_aliases table-missing bug this
  // was written to catch) — that's not "processed", it's a stuck half-write,
  // and re-running it costs one AI call, not the alternative of losing the
  // application forever. Genuinely-resolved rows (linked to an application,
  // or a real terminal-reject classification) are skipped as before.
  const existing = await timeIt(stats, 'dbLookupMs', () =>
    repository.findExistingProcessedEmail(messageId, userId)
  );
  const stuck = existing.find(row =>
    !row.application_id &&
    row.is_job_related &&
    !TERMINAL_REJECT_CLASSIFICATIONS.has(row.classification)
  );
  if (stuck) {
    logger.warn(`[pipeline.orchestrator] retrying stuck processed_emails row ${stuck.id} (classification=${stuck.classification}, no application_id) for message ${messageId}`);
    await timeIt(stats, 'dbWriteMs', () => repository.deleteProcessedEmail(stuck.id));
  } else if (existing.length > 0) {
    recordDrop(stats, 'already_processed');
    return null;
  }

  // Fetch full email
  const msgRes = await timeIt(stats, 'gmailFetchMs', () => gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  }));

  const msg = msgRes.data;
  const { body, html, headers } = extractEmailParts(msg.payload);

  const subject = headers['subject'] || '';
  const sender = headers['from'] || '';
  const messageIdHeader = headers['message-id'] || '';
  const inReplyTo = headers['in-reply-to'] || '';
  const references = headers['references'] || '';
  const replyTo = headers['reply-to'] || '';
  const senderDomain = sender.split('@')[1]?.replace('>', '').trim() || '';
  const replyToDomain = replyTo.match(/@([a-z0-9.\-]+)/i)?.[1]?.toLowerCase();
  const receivedAt = new Date(parseInt(msg.internalDate));

  // Everything from here on touches shared state (processed_emails, applications)
  // keyed by thread — serialize per-thread, parallel across threads.
  return withThreadLock(threadLocks, msg.threadId, async () => {

  // Step 1: Rule-based classification
  const ruleResult = await timeIt(stats, 'ruleClassifyMs', () =>
    classifyEmail({ subject, body, sender, senderDomain })
  );

  // Save to processed_emails regardless (even if not job related)
  const processedEmailId = await timeIt(stats, 'dbWriteMs', () => repository.insertProcessedEmail({
    userId, messageId, threadId: msg.threadId, messageIdHeader, references, inReplyTo,
    subject, sender, senderDomain, receivedAt,
    isJobRelated: ruleResult.isJobRelated,
    classification: ruleResult.classification,
    confidence: ruleResult.confidence,
    snippet: body.substring(0, 500),
    plainText: body,
    html,
  }));

  // Not job related? Stop here
  if (!ruleResult.isJobRelated) {
    recordDrop(stats, 'rule_gate');
    logger.debug(`[pipeline.orchestrator] dropped at rule_gate — subject: "${subject}", sender: "${sender}", score: ${ruleResult.confidence}, flags: ${JSON.stringify(ruleResult.flags)}`);
    return null;
  }

  // Step 2: ATS registry lookup — is the sender a known vendor with a parser?
  const vendor = getVendor(senderDomain);
  let extraction = null;
  let finalConfidence;

  if (vendor) {
    stats.vendorKnownCount++;
    const label = `${vendor.name} (${vendor.hasParser ? 'parser' : 'no parser'})`;
    stats.vendorBreakdown[label] = (stats.vendorBreakdown[label] || 0) + 1;
  } else {
    stats.vendorBreakdown[`unknown (${senderDomain})`] = (stats.vendorBreakdown[`unknown (${senderDomain})`] || 0) + 1;
  }

  if (vendor?.hasParser) {
    stats.vendorHasParserCount++;
    stats.parserAttemptedCount++;
    // Step 3a: deterministic parser — zero tokens, near-instant
    const parsed = await timeIt(stats, 'atsParseMs', () =>
      parseWithVendorRules({ subject, plainText: body, html })
    );
    if (passesSanityCheck(parsed)) {
      extraction = {
        company: parsed.company,
        role: parsed.role,
        platform: vendor.name.toLowerCase(),
        status: parsed.status,
        applied_date: null,
        job_id: parsed.jobId || null,
        location: parsed.location || null,
        is_job_email: true,
      };
      finalConfidence = calculateConfidence({
        source: 'deterministic_parser',
        company: extraction.company,
        role: extraction.role,
        status: extraction.status,
      });
      // Phase 3: deterministic parser has no notion of a granular event_type
      // of its own — derive the closest one from the coarse status it
      // parsed. event_date stays null (falls back to the email's own
      // received date; the parser doesn't extract relative dates).
      extraction.event_type = mapStatusStringToEventType(extraction.status);
      extraction.event_date = null;
      extraction.source = 'deterministic_parser';
      stats.parserHitCount++;
    } else {
      stats.parserSanityFailCount++;
      logger.debug(`[ats.parsers] parser ran but failed sanity check — subject: "${subject}", sender: "${sender}", parsed:`, JSON.stringify(parsed));
    }
  }

  // Step 3b: AI extraction — vendor unknown, no parser yet, or the parser's result failed sanity check
  if (!extraction) {
    stats.aiCallCount++;
    let aiData;
    try {
      aiData = await timeIt(stats, 'aiExtractMs', () =>
        aiGateway.extract(userId, subject, body, sender, stats, receivedAt)
      );
    } catch (err) {
      // BYOK hybrid AI (Project DOCs/BYOK.md, Section 3.4/5.4) — thrown by
      // aiGateway.resolveChain() *before* any provider call, distinct from a
      // provider actually failing. This email specifically needs AI (no ATS
      // parser matched), so it's tagged 'needs_quota' rather than
      // 'extraction_failed' — it must only be retried once the monthly quota
      // resets or a BYOK key is connected, never retried pointlessly on the
      // next sync. The sync itself keeps processing remaining messages
      // (ATS-parser hits, non-job emails still cost 0 AI calls); the flag
      // set here tells syncUserEmails to conclude as needs_upgrade_or_key
      // instead of success once the whole batch is done.
      if (err instanceof QuotaExceededError) {
        await timeIt(stats, 'dbWriteMs', () => repository.updateProcessedEmailClassification(
          processedEmailId, 'needs_quota', ruleResult.confidence
        ));
        stats.quotaExceeded = true;
        recordDrop(stats, 'needs_quota');
        return null;
      }
      throw err;
    }

    // AI sometimes misses role even when it's clearly stated in prose — try a regex fallback
    if (isLifecycleIntent(aiData.intent) && !aiData.role) {
      aiData.role = extractRoleFromText(`${subject} ${body}`);
    }
    if (aiData.role === 'Unknown Role') aiData.role = null;

    // AI outage (every provider failed/timed out) is NOT the same as the AI
    // confidently ruling this out — but it's also not something worth creating
    // a company-less, role-less "Not specified" application row for. That's
    // noise, not review-worthy data. Instead: leave it in processed_emails
    // tagged 'extraction_failed' (application_id stays NULL) so a future sync
    // or retry pass can re-attempt extraction once providers recover.
    if (aiData.extractionFailed) {
      logger.warn(`[ai.extractor] all providers failed for "${subject}" — leaving unprocessed for retry`);
      await timeIt(stats, 'dbWriteMs', () => repository.updateProcessedEmailClassification(
        processedEmailId, 'extraction_failed', ruleResult.confidence
      ));
      stats.extractionFailedCount = (stats.extractionFailedCount || 0) + 1;
      recordDrop(stats, 'extraction_failed');
      return null;
    }

    if (!isLifecycleIntent(aiData.intent)) {
      // Intent is authoritative: a lifecycle intent (application_confirmation, interview, etc.)
      // means this IS a real application email, even if extraction came back incomplete.
      // Missing company/role/status just means lower confidence and needs_review — it never
      // discards the record. Only non-lifecycle intents (job_recommendation, newsletter,
      // marketing, security, otp, other) are rejected outright.
      logger.debug(`[ai.extractor] rejected "${subject}" —`, JSON.stringify(aiData));
      await timeIt(stats, 'dbWriteMs', () => repository.updateProcessedEmailClassification(
        processedEmailId, aiData.intent || ruleResult.classification, aiData.confidence || 0
      ));
      recordDrop(stats, 'ai_reject');
      return null;
    } else {
      extraction = aiData;
      extraction.source = 'ai';
      // Fall back to a status-derived event type if the AI didn't return a
      // granular event_type directly (older provider response shape, or it
      // simply left the field null while still populating status).
      extraction.event_type = extraction.event_type || mapStatusStringToEventType(extraction.status);
      finalConfidence = calculateConfidence({
        source: 'ai',
        ruleConfidence: ruleResult.confidence,
        aiConfidence: aiData.confidence,
      });
    }
  }

  // Update processed email with extraction result
  await timeIt(stats, 'dbWriteMs', () => repository.updateProcessedEmailClassification(
    processedEmailId, extraction.status?.toLowerCase() || ruleResult.classification, finalConfidence
  ));

  // Normalize company/role so matching never operates on raw, inconsistent strings
  const rawCompany = extraction.company || (isJobPlatformDomain(sender) ? null : resolveFallbackCompany(senderDomain, replyToDomain));
  const rawRole = extraction.role;
  const normalizedCompany = await timeIt(stats, 'normalizeMs', () => normalizeCompany(rawCompany));
  const normalizedRole = await timeIt(stats, 'normalizeMs', () => normalizeRole(rawRole));

  // Step 3: Application matching — hard rules first, then weighted scoring
  // over candidates. eventType 'applied' signals a fresh application start,
  // which the scorer uses to guard against merging into an already-closed one.
  const eventType = (!extraction.status || mapStatusToEnum(extraction.status) === 'Applied')
    ? 'applied'
    : extraction.status.toLowerCase();

  const emailData = {
    gmailThreadId: msg.threadId,
    messageIdHeader,
    inReplyTo,
    references,
    normalizedCompany,
    normalizedRole,
    location: extraction.location || null,
    jobId: extraction.job_id || null,
    eventType,
    receivedAt,
  };

  const matchResult = await timeIt(stats, 'matchMs', () =>
    matchApplication(userId, emailData)
  );

  // Phase 3/4: granular event identity — resolved once, shared by every
  // branch below. event_date defaults to the email's own received date when
  // extraction didn't resolve a specific event date (interview date, etc).
  const granularEventType = extraction.event_type || 'correspondence';
  const resolvedEventDate = extraction.event_date ? new Date(extraction.event_date) : receivedAt;
  const eventMetadata = {
    source: extraction.source || 'ai',
    ...(extraction.round ? { round: extraction.round } : {}),
  };

  let applicationId;

  if (matchResult.decision === DECISION.AUTO_MERGE) {
    // Existing application matched
    applicationId = matchResult.application.id;

    const isLocked = Boolean(matchResult.application.is_locked_by_user);
    const newStatus = mapStatusToEnum(extraction.status) || mapEventTypeToStatus(granularEventType);

    // Phase 4 (CRITICAL FIX): timeline writing is now fully decoupled from
    // the status-progression guard below. EVERY valid lifecycle event gets
    // written to timeline_events — including when the mapped coarse status
    // is identical to the application's current status (e.g. a second
    // "still under review" email, or an INTERVIEW_SCHEDULED reschedule that
    // doesn't change the coarse "Interview" stage). Idempotency is handled
    // inside insertTimelineEvent() (INSERT IGNORE on the email+event+date
    // unique key), so reprocessing the same message is still a no-op.
    const { wasInserted } = await timeIt(stats, 'dbWriteMs', () => repository.insertTimelineEvent({
      applicationId,
      eventType: granularEventType,
      eventDate: resolvedEventDate,
      description: `${subject}`,
      emailMsgId: messageId,
      matchStrategy: matchResult.strategy,
      matchConfidence: matchResult.score,
      emailReceivedAt: receivedAt,
      confidence: finalConfidence,
      metadata: eventMetadata,
    }));

    if (isLocked) {
      // Application status is locked by the user (manual edit or override).
      // Do not mutate status, company, or role — the event above is still
      // recorded so the email correspondence remains visible.
      logger.debug(`[pipeline.orchestrator] application ${applicationId} locked by user — event recorded, status left at "${matchResult.application.status}"`);
    } else if (shouldApplyStatus(matchResult.application.status, newStatus)) {
      await timeIt(stats, 'dbWriteMs', () => repository.updateApplicationStatus(applicationId, newStatus, finalConfidence));

      // Pipeline-detected status change on an existing application — notify
      // (manual edits go through applications.service.js#updateManualApplication
      // instead, which never calls this, since the user already knows).
      // Skipped when the event itself was a duplicate (wasInserted false) —
      // a reprocessed message must never fire a second notification even if
      // (in some edge case) the status guard would otherwise have re-applied.
      if (wasInserted) {
        await notificationsService.notifyStatusEvent({
          applicationId,
          userId,
          status: newStatus,
          eventType: granularEventType,
          company: matchResult.application.company || extraction.company,
          role: matchResult.application.role || extraction.role,
          emailMsgId: messageId,
          isInitialSync,
        });
      }
    } else if (wasInserted) {
      // Either the coarse status didn't change at all (e.g. a second
      // "still under review" email, or an event like INTERVIEW_COMPLETED
      // that doesn't move the coarse "Interview" stage), or newStatus was
      // blocked by the terminal/regression guard above (out-of-order
      // email). The timeline event above already makes the correspondence
      // visible either way; some granular events (ASSESSMENT_PASSED/FAILED,
      // INTERVIEW_COMPLETED/PASSED/FAILED, etc.) are still worth a
      // dedicated notification even without a coarse status change.
      await notificationsService.notifyEventType({
        applicationId,
        userId,
        eventType: granularEventType,
        company: matchResult.application.company || extraction.company,
        role: matchResult.application.role || extraction.role,
        emailMsgId: messageId,
        isInitialSync,
      });
    }
  } else {
    // No confident match (auto_new), or the best candidate was too ambiguous
    // to trust (needs_review) — either way, create a new application rather
    // than risk a wrong merge. needs_review cases are flagged for a human to
    // reconcile later instead of guessing.
    const isAmbiguous = matchResult.decision === DECISION.NEEDS_REVIEW;

    const newApplicationCompany = extraction.company || (isJobPlatformDomain(sender) ? 'Not specified' : resolveFallbackCompany(senderDomain, replyToDomain));
    const newApplicationRole = extraction.role || 'Not specified';
    const newApplicationStatus = mapStatusToEnum(extraction.status) || 'Applied';

    applicationId = await timeIt(stats, 'dbWriteMs', () => repository.insertApplication({
      userId,
      company: newApplicationCompany,
      role: newApplicationRole,
      appliedDate: extraction.applied_date || receivedAt,
      platform: extraction.platform || detectPlatform(senderDomain),
      threadId: msg.threadId,
      status: newApplicationStatus,
      confidence: finalConfidence,
      verificationStatus: isAmbiguous ? 'needs_review' : verificationStatus(extraction, finalConfidence),
      normalizedCompany,
      normalizedRole,
      jobId: emailData.jobId,
      location: emailData.location,
    }));

    // First timeline event — event type reflects the application's actual
    // starting event (a "new" application can start life already Rejected,
    // e.g. an auto-reject email with no prior confirmation ever received),
    // not always APPLIED.
    const newAppEventType = granularEventType !== 'correspondence'
      ? granularEventType
      : (mapStatusStringToEventType(newApplicationStatus) || 'APPLIED');

    const { wasInserted: newAppEventInserted } = await timeIt(stats, 'dbWriteMs', () => repository.insertTimelineEvent({
      applicationId,
      eventType: newAppEventType,
      eventDate: resolvedEventDate,
      description: isAmbiguous
        ? `Application detected via email: ${subject} (possible duplicate of application #${matchResult.application?.id}, score ${matchResult.score} — needs manual review)`
        : `Application detected via email: ${subject}`,
      matchStrategy: matchResult.strategy,
      matchConfidence: matchResult.score,
      emailMsgId: messageId,
      emailReceivedAt: receivedAt,
      confidence: finalConfidence,
      metadata: eventMetadata,
    }));

    // Scenario B: a new application can be created directly at an already-
    // important status (e.g. the first email ever seen from a company is
    // already an interview invite) — oldStatus !== newStatus doesn't apply
    // here since there was no prior status, so this can't reuse the branch
    // above and needs its own notify call.
    if (newAppEventInserted) {
      await notificationsService.notifyStatusEvent({
        applicationId,
        userId,
        status: newApplicationStatus,
        eventType: newAppEventType,
        company: newApplicationCompany,
        role: newApplicationRole,
        emailMsgId: messageId,
        isInitialSync,
      });
    }
  }

  // Link email to application
  await timeIt(stats, 'dbWriteMs', () => repository.linkEmailToApplication(processedEmailId, applicationId));

  return applicationId;
  });
};

// ── Helper functions ──────────────────────────
const mapStatusToEnum = (status) => {
  const map = {
    'Applied': 'Applied', 'Assessment': 'OA', 'OA': 'OA',
    'Interview': 'Interview', 'HR Round': 'HR Round',
    'Technical Round': 'Interview', 'Managerial Round': 'Interview',
    'Final Round': 'Final Round', 'Offer': 'Offer',
    'Rejected': 'Rejected', 'Withdrawn': 'Withdrawn',
  };
  return map[status] || null;
};

// Rejected/Withdrawn/Offer are terminal — once an application lands there,
// no later-processed email should be able to bump it back to an earlier
// stage. This matters because emails are not always processed in send
// order (retries, backfills, out-of-order provider responses all reorder
// them), so "the email that happened to run last" is not a safe way to
// decide the current status. Non-terminal stages rank by how far along the
// lifecycle they represent; a same-or-higher stage may still overwrite.
const STATUS_RANK = {
  'Applied': 0, 'OA': 1, 'Interview': 2, 'HR Round': 2,
  'Final Round': 3, 'Offer': 4, 'Rejected': 4, 'Withdrawn': 4,
};
const TERMINAL_STATUSES = new Set(['Rejected', 'Withdrawn', 'Offer']);

// Decide whether a newly-matched email's status should actually overwrite
// the application's current one.
const shouldApplyStatus = (currentStatus, newStatus) => {
  if (!newStatus || newStatus === currentStatus) return false;
  if (TERMINAL_STATUSES.has(currentStatus)) return false; // terminal is final, full stop
  if (TERMINAL_STATUSES.has(newStatus)) return true; // reaching a terminal state always counts
  return (STATUS_RANK[newStatus] ?? 0) >= (STATUS_RANK[currentStatus] ?? 0);
};

const extractCompanyFromDomain = (domain) => {
  if (!domain) return 'Unknown Company';
  return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
};

// Hosted-ATS domains that send on behalf of many different employers — the sender
// domain itself is never the company (e.g. every Workday-hosted rejection comes from
// *@myworkday.com regardless of employer). When extraction misses the company, the
// reply-to address is a much better signal, since it's usually the employer's own
// domain (ind.recruiter@qualys.com, noreply@rockwellautomation.com, etc).
const GENERIC_ATS_SENDER_DOMAINS = [
  'myworkday.com', 'myworkdayjobs.com', 'successfactors.com', 'avature.net',
  'icims.com', 'smartrecruiters.com', 'workable.com', 'jobvite.com',
];

const isGenericAtsDomain = (domain) =>
  !!domain && GENERIC_ATS_SENDER_DOMAINS.some((d) => domain.includes(d));

const resolveFallbackCompany = (senderDomain, replyToDomain) => {
  if (isGenericAtsDomain(senderDomain) && replyToDomain && !isGenericAtsDomain(replyToDomain)) {
    return extractCompanyFromDomain(replyToDomain);
  }
  return extractCompanyFromDomain(senderDomain);
};

const detectPlatform = (domain) => {
  const platforms = {
    'naukri.com': 'Naukri', 'linkedin.com': 'LinkedIn',
    'internshala.com': 'Internshala', 'unstop.com': 'Unstop',
    'wellfound.com': 'Wellfound', 'greenhouse.io': 'Greenhouse',
    'lever.co': 'Lever', 'workday.com': 'Workday',
  };
  return platforms[domain] || 'Direct';
};

// ── Cancellation ────────────────────────────────
// In-memory only, same lifetime/scope tradeoff as the OTP stores (Reaad.md
// §4) — a stop request only reaches a sync running on this process. Fine
// for a single-instance deployment; would need a shared store (Redis pub/sub
// or a DB "stop_requested" flag polled per-worker) to cancel a sync running
// on a different instance.
const activeSyncs = new Map(); // userId -> { cancelled: boolean }

const requestStop = (userId) => {
  const handle = activeSyncs.get(userId);
  if (!handle) return false; // nothing running (or already finished) for this user
  handle.cancelled = true;
  return true;
};

// ── Main sync function ────────────────────────
const syncUserEmails = async (userId) => {
  // Atomic claim — also doubles as the concurrency guard (section 8) and the
  // stuck-sync reclaim (section 10): see startSync() for how both are one
  // statement. If another request already legitimately owns an in-progress
  // sync, this is a 409, not a retry-worthy failure.
  const claimed = await repository.startSync(userId, syncStatusConfig.staleSyncTimeoutMinutes);
  if (!claimed) {
    throw new ConflictError('A sync is already in progress. Please wait for it to finish.');
  }

  const syncStart = Date.now();
  const cancelHandle = { cancelled: false };
  activeSyncs.set(userId, cancelHandle);
  try {
    const creds = await repository.getGmailCredentials(userId);
    if (!creds?.gmail_token) {
      throw new Error('Gmail not connected');
    }

    const gmail = getGmailClient(creds.gmail_token, creds.refresh_token);

    const lastHistoryId = await repository.getLastHistoryId(userId);

    let messageIds = null;
    if (lastHistoryId) {
      messageIds = await fetchMessageIdsIncremental(gmail, lastHistoryId);
    }
    // No stored historyId yet, or it expired — do a full re-list. This is
    // also the exact signal for "first/backfill sync": whatever this pass
    // finds could be weeks-old correspondence, so notifications must be
    // suppressed for it (Reaad.md §2) even though applications/timeline
    // still get built normally. A history-expired re-list isn't strictly a
    // first-ever sync, but there's no cheap way to tell that apart from one
    // here, and treating it the same (suppressed) errs toward too-quiet
    // rather than risking a notification storm.
    const isInitialSync = messageIds === null;
    if (messageIds === null) {
      messageIds = await fetchMessageIdsFull(gmail);
    }

    let processed = 0;
    let jobsFound = 0;

    const stats = createSyncStats();
    const threadLocks = new Map(); // shared across workers — see withThreadLock

    // Limited concurrency: AI/Gmail calls are network-bound, so running several
    // in flight at once cuts wall time roughly proportionally. Per-thread locking
    // (inside processEmail) keeps DB writes safe even when workers overlap.
    // This used to be capped at 2 to protect Groq's free-tier rate limit, but
    // that throttled the *entire* pipeline — including emails that never touch
    // AI at all (deterministic-parser hits, rule-gate rejects). Groq's own
    // concurrency is now bounded separately inside ai.extractor.js, so this
    // number is free to reflect real I/O parallelism instead of the slowest
    // downstream provider.
    const CONCURRENCY = 6;
    let nextIndex = 0;

    const worker = async () => {
      // Checked at the top of each iteration, not mid-email — an email
      // already being extracted/matched is left to finish so its DB write
      // stays atomic; only messages not yet started are left unprocessed,
      // which is exactly what "stop where it stopped" means here.
      while (nextIndex < messageIds.length && !cancelHandle.cancelled) {
        const messageId = messageIds[nextIndex++];
        try {
          const result = await processEmail(gmail, userId, messageId, stats, threadLocks, isInitialSync);
          if (result) jobsFound++;
        } catch (err) {
          recordDrop(stats, 'error');
          logger.error(`[pipeline.orchestrator] failed on message ${messageId}:`, err.message);
        }
        processed++;
        // Light stagger — just enough to avoid a synchronized burst; real
        // rate-limiting now happens at the provider call site.
        await new Promise(r => setTimeout(r, 50));
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    stats.totalMs = Date.now() - syncStart;
    const timings = summarizeStats(stats);
    logger.info(`[pipeline.orchestrator] sync stats for user ${userId}:`, JSON.stringify(timings, null, 2));

    if (cancelHandle.cancelled) {
      // Deliberately do NOT advance last_history_id — the messages after
      // nextIndex were never attempted, so the next sync must still see them.
      // Already-processed ones get skipped cheaply via the DB check at the
      // top of processEmail(), so re-listing them next time is not wasted work.
      await repository.completeSyncStopped(userId, processed);
      return { processed, jobsFound, stopped: true, timings };
    }

    // Current historyId — every future sync starts from here
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const newHistoryId = profile.data.historyId;

    if (stats.quotaExceeded) {
      // At least one email needed AI extraction and hit the monthly free
      // quota with no BYOK key connected (Section 3.4/6.4, BYOK.md).
      // last_history_id still advances — the messages that WERE processed
      // (including any resolved deterministically with 0 AI calls) are
      // genuinely done; only the quota-blocked ones are tagged for retry.
      await repository.completeSyncSuccess(userId, newHistoryId, processed);
      await repository.completeSyncNeedsUpgradeOrKey(userId, 0);
      await aiGateway.notifyQuotaOnce(userId, aiGateway.currentUtcYearMonth());
      return { processed, jobsFound, needsUpgradeOrKey: true, timings };
    }

    await repository.completeSyncSuccess(userId, newHistoryId, processed);

    return { processed, jobsFound, timings };
  } catch (err) {
    const { code, message, statusCode } = mapSyncError(err);

    // Full detail stays server-side only — provider error, stack, timing —
    // never sent to the client and never written to sync_status. What gets
    // persisted/returned is only the sanitized {code, message} above.
    logger.error(
      `[pipeline.orchestrator] sync failed for user ${userId} — code=${code} durationMs=${Date.now() - syncStart} provider_error=${err.message}`,
      err.stack
    );

    // GMAIL_AUTH_EXPIRED (revoked/expired refresh token, or never connected)
    // is not a transient failure — no automatic retry can succeed until the
    // user reconnects Gmail. Every other mapped code (rate limit, network,
    // generic Gmail API error, AI/provider issues, unknown) stays 'failed'
    // and remains eligible for the scheduler's next attempt.
    if (code === 'GMAIL_AUTH_EXPIRED') {
      await repository.completeSyncNeedsReconnect(userId, code, message);
    } else {
      await repository.completeSyncFailure(userId, code, message);
    }

    // AppError (not a plain Error) so errorHandler.middleware.js actually
    // honors statusCode instead of defaulting to 500 — see its
    // `err instanceof AppError` check.
    throw new AppError(message, statusCode);
  } finally {
    activeSyncs.delete(userId);
  }
};

module.exports = { syncUserEmails, processEmail, requestStop };
