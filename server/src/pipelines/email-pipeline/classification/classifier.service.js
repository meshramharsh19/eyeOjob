// ──────────────────────────────────────────────────
// RULE-BASED EMAIL CLASSIFIER (Stage 1)
// Cheap, zero-cost pre-filter. Only hard-rejects intents that are reliably
// keyword-identifiable across *any* platform (OTP, security alerts, obvious
// newsletters) — these don't vary by template the way job-recommendation
// wording does, so pattern matching is safe here.
//
// Job recommendation / digest detection is kept as a fast-path optimization
// (skips an AI call for the common, already-seen phrasings), but it is NOT
// the safety net — semantic intent classification in ai.extractor.js is. New
// platforms with unseen wording get caught there via `intent`, not by
// adding more phrases here. See intentTypes.js for the full taxonomy.
// ──────────────────────────────────────────────────

const { INTENTS } = require('./intentTypes');

// Known job platform domains
const JOB_DOMAINS = [
  'naukri.com', 'linkedin.com', 'internshala.com',
  'unstop.com', 'wellfound.com', 'greenhouse.io',
  'lever.co', 'workday.com', 'icims.com',
  'myworkdayjobs.com', 'smartrecruiters.com',
  'jobvite.com', 'ashbyhq.com', 'rippling.com',
  'angellist.com', 'indeed.com', 'monster.com',
  'monsterindia.com', 'foundit.in', 'foundit.com',
  'shine.com', 'timesjobs.com', 'hirist.com',
  'freshteam.com', 'zohorecruit.com', 'cutshort.io',
  'taleo.net', 'successfactors.com', 'oraclecloud.com',
  'bamboohr.com', 'workable.com', 'teamtailor.com',
  'jazzhr.com', 'breezy.hr', 'recruitee.com',
  'avature.net', 'brassring.com', 'kenexa.com',
  'eightfold.ai', 'phenompeople.com', 'pageuppeople.com',
  'ukg.com', 'dayforce.com', 'personio.com',
  'clearcompany.com', 'hireology.com', 'manatal.com',
  'bullhorn.com', 'pinpointhq.com', 'recruitcrm.io',
  'apna.co', 'instahyre.com', 'hasjob.co',
];

// Keywords for each classification type
const KEYWORDS = {
  confirmation: [
    'successfully applied', 'application received',
    'thank you for applying', 'we received your application',
    'application confirmation', 'applied for the position',
    'your application has been submitted', 'application sent',
    'you applied for', 'application acknowledged',
    "you've applied to", 'you applied to', 'application successful',
    'interest in the', 'your interest in',
  ],
  oa: [
    'online assessment', 'coding challenge', 'hackerrank',
    'hackerearth', 'codility', 'take-home assignment',
    'technical assessment', 'aptitude test', 'complete the assessment',
    'skill assessment', 'test link', 'coding test',
  ],
  interview: [
    'interview invitation', 'schedule an interview',
    'interview scheduled', 'we would like to interview',
    'interview request', 'calendar invite', 'zoom meeting',
    'google meet', 'teams meeting', 'phone screen',
    'video interview', 'technical interview', 'round 1',
    'shortlisted', 'next round', 'interview slot',
  ],
  offer: [
    'offer letter', 'job offer', 'pleased to offer',
    'congratulations', 'welcome aboard', 'offer of employment',
    'compensation package', 'joining date', 'we are happy to extend',
    'formal offer', 'accepted your application',
  ],
  rejection: [
    'unfortunately', 'regret to inform', 'not moving forward',
    'we will not be', 'other candidates', 'not selected',
    'position has been filled', 'decided to pursue other',
    'not a match', 'we won\'t be proceeding', 'keep your profile',
    'future opportunities', 'not shortlisted',
  ],
};

// ── Check if domain is a known job platform ───
const isJobPlatformDomain = (sender) => {
  const domain = sender?.split('@')[1]?.toLowerCase();
  return JOB_DOMAINS.some(d => domain?.includes(d));
};

// ── Hard-reject rules ───────────────────────────
// Each rule matches on sender / subject / body patterns that are safe to hardcode
// because they don't meaningfully vary by platform or template.
const HARD_REJECT_RULES = [
  {
    intent: INTENTS.OTP,
    subjectPatterns: [/\botp\b/i, /verification code/i, /one[- ]time password/i],
    bodyPatterns: [/\botp\b/i, /verification code/i, /one[- ]time password/i, /security code/i],
  },
  {
    intent: INTENTS.SECURITY,
    subjectPatterns: [/sign-?in attempt/i, /new device/i, /suspicious activity/i, /password (?:reset|changed)/i, /account verification/i],
    bodyPatterns: [/sign-?in attempt/i, /new device (?:login|sign-?in)/i, /suspicious (?:login|activity)/i, /unusual activity/i, /reset your password/i],
  },
  {
    // Fast path only — a new platform with unseen phrasing is still caught by
    // semantic `intent` classification in ai.extractor.js, not by adding more
    // patterns here. See file header.
    //
    // NOTE: no senderLocalPatterns here. LinkedIn (and others) send both job-alert
    // digests AND real "your application was sent to X" confirmations from the
    // same address (jobs-noreply@linkedin.com) — matching on sender alone silently
    // discarded legitimate application confirmations before body content was ever
    // checked. Subject/body patterns below are specific enough to catch digests
    // without that false-positive risk.
    intent: INTENTS.JOB_RECOMMENDATION,
    senderPatterns: [/@match\.indeed\.com/i],
    subjectPatterns: [
      /^your job alert for/i, /\bjob alerts?\b/i, /\bnew jobs\b/i,
      /\bjobs (?:in|at|near|matching)\b/i, /^apply to jobs at/i,
      /\d+\s+new\s+.*\bjobs?\b/i, /recommended jobs?/i, /jobs you may be interested/i,
    ],
    bodyPatterns: [
      /match(?:es)? your (?:preferences|saved job alert|job alert)/i,
      /new jobs? in .{0,40} match/i, /based on your (?:job )?preferences/i,
      /could be a good match/i, /this is a bad match/i,
      /based on your (?:profile|resume|background)/i, /recommended (?:job|position)s? for you/i,
    ],
  },
  {
    intent: INTENTS.NEWSLETTER,
    subjectPatterns: [/\bdaily digest\b/i, /\bweekly digest\b/i, /\bnewsletter\b/i, /weekly roundup/i],
    senderLocalPatterns: [/newsletters-noreply$/i],
  },
  {
    // LinkedIn's own fixed system notification channels — structural, not wording.
    // These local-parts are used consistently for social/networking notifications
    // (profile views, invitations accepted, "X shares their thoughts", editorial
    // digests) regardless of what the notification text says, so matching on the
    // sender address is durable in a way phrase-matching on the body isn't.
    intent: INTENTS.OTHER,
    senderLocalPatterns: [/messages-noreply$/i, /updates-noreply$/i, /editors-noreply$/i, /invitations$/i],
  },
  {
    // Naukri Campus's recommendation feed — same structural logic as above.
    intent: INTENTS.JOB_RECOMMENDATION,
    senderLocalPatterns: [/recommendationnc$/i],
  },
];

// ATS/applicant-portal boilerplate ("reset your password to check your
// application status", "verify your account to continue") reuses the exact
// phrasing real account-security alerts use. A genuine security/OTP email
// never also says the application was received — so when that boilerplate
// shows up alongside clear application language, it's a false positive for
// OTP/SECURITY, not a real account alert. Gate those two rule types on the
// absence of job-application language rather than hardcoding the specific
// ATS footer text (which will just vary by vendor next time).
const JOB_APPLICATION_CONTEXT_PATTERN =
  /thank you for (?:your interest|applying)|application (?:received|submitted|confirmation)|we received your application|your application (?:status|has been)/i;

const detectHardRejectIntent = ({ subject = '', body = '', sender = '' }) => {
  const senderLocalPart = sender.split('@')[0] || '';
  const bodyPreview = body.substring(0, 1000);
  const hasJobApplicationContext = JOB_APPLICATION_CONTEXT_PATTERN.test(`${subject} ${bodyPreview}`);

  for (const rule of HARD_REJECT_RULES) {
    if (hasJobApplicationContext && (rule.intent === INTENTS.OTP || rule.intent === INTENTS.SECURITY)) continue;
    const matched =
      rule.senderLocalPatterns?.some(p => p.test(senderLocalPart)) ||
      rule.senderPatterns?.some(p => p.test(sender)) ||
      rule.subjectPatterns?.some(p => p.test(subject)) ||
      rule.bodyPatterns?.some(p => p.test(bodyPreview));
    if (matched) return rule.intent;
  }
  return null;
};

// ── Rule-based classification ─────────────────
const classifyByRules = (subject = '', body = '') => {
  const text = `${subject} ${body}`.toLowerCase();

  const scores = {};
  for (const [type, keywords] of Object.entries(KEYWORDS)) {
    scores[type] = keywords.filter(k => text.includes(k)).length;
  }

  // Find best match
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  if (best[1] === 0) return { type: 'unknown', confidence: 0, matchedKeywords: 0 };

  return {
    type: best[0],
    confidence: Math.min(best[1] * 20, 85), // max 85% from rules alone
    matchedKeywords: best[1],
  };
};

// ── Main classifier function ──────────────────
const classifyEmail = (email) => {
  const { subject, body, sender, senderDomain } = email;

  // Reliably keyword-identifiable non-lifecycle intents — reject up front, never reach the AI.
  const hardRejectIntent = detectHardRejectIntent({ subject, body, sender });
  if (hardRejectIntent) {
    return {
      isJobRelated: false,
      classification: hardRejectIntent,
      confidence: 0,
      needsAiReview: false,
      flags: [hardRejectIntent],
    };
  }

  let score = 0;
  const flags = [];

  // Flag 1: Known job platform domain
  const isJobPlatform = isJobPlatformDomain(sender);
  if (isJobPlatform) { score += 40; flags.push('job_platform_domain'); }

  // Flag 2: Rule-based keyword match
  const ruleResult = classifyByRules(subject, body);
  score += ruleResult.confidence * 0.6;
  if (ruleResult.type !== 'unknown') flags.push(`keyword_match_${ruleResult.type}`);

  // Flag 3: Subject line patterns
  const subjectLower = subject?.toLowerCase() || '';
  if (/re:|fwd:/i.test(subject)) score += 5; // reply thread
  if (/application|position|role|job|opportunity/i.test(subjectLower)) {
    score += 15;
    flags.push('subject_job_keyword');
  }

  // Confidence-bucket gate, not a hard cutoff. `score >= 40` used to be a hard
  // reject/accept line — anything below it never reached AI extraction at all,
  // which was the main cause of legitimate emails going undetected (new ATS
  // wording, direct-company senders not in JOB_DOMAINS, non-English phrasing).
  // Only a *zero* score (no platform match, no keyword match, no subject
  // signal at all) is treated as noise and skipped before AI — every email
  // with any signal, however weak, is still routed to extraction, where the
  // AI's semantic `intent` classification is the actual (and more reliable)
  // safety net. See ai.extractor.js buildPrompt / isLifecycleIntent.
  const isJobRelated = score > 0;
  const finalConfidence = Math.min(score, 100);

  return {
    isJobRelated,
    classification: isJobRelated ? (ruleResult.type !== 'unknown' ? ruleResult.type : 'unclassified') : 'not_job',
    confidence: finalConfidence,
    needsAiReview: isJobRelated && finalConfidence < 70,
    flags,
  };
};

module.exports = { classifyEmail, isJobPlatformDomain, detectHardRejectIntent };
