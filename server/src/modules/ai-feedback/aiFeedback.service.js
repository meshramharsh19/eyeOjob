const logger = require('../../config/logger');
const repository = require('./aiFeedback.repository');
const { upsertCompanyAlias, upsertRoleAlias } = require('../../pipelines/email-pipeline/matching/normalization.service');

// AI Correction Feedback Loop — Project DOCs/ai-feedback-loop.md.
// The trigger decision ("is this actually a correction", §2) is made by the
// caller (applications.service.js) BEFORE any of these are invoked — these
// functions assume that decision has already been made and only handle
// attribution + recording + the alias side-effect.

// §4 — status correction. Resolves the exact culprit event via
// timeline_events.applied_status (never a timestamp guess — see
// aiFeedback.repository.js's comment on findStatusCorrectionCulprit). If no
// row matches (legacy data predating the applied_status column, or some
// other edge case), this skips silently rather than recording a guessed
// pairing — a missing training signal is strictly better than a wrong one.
const recordStatusCorrection = async ({ userId, applicationId, existingStatus, newStatus }) => {
  const culprit = await repository.findStatusCorrectionCulprit(applicationId, userId, existingStatus);
  if (!culprit) {
    logger.debug(`[aiFeedback] no applied_status match for application ${applicationId} status="${existingStatus}" — skipping correction record (legacy data or already-locked edit)`);
    return false;
  }

  await repository.insertFeedback({
    userId,
    applicationId,
    processedEmailId: culprit.processed_email_id,
    fieldCorrected: 'status',
    aiPredictedValue: existingStatus,
    userCorrectedValue: newStatus,
    senderDomain: culprit.sender_domain,
    emailSubject: culprit.subject,
    aiClassification: culprit.classification,
    aiConfidence: culprit.confidence,
  });
  return true;
};

// §4 — company/role correction. Attributes to the application's creation
// email (the wrong entity value originated there), and — Consumer 1, §5.1 —
// immediately writes a personal alias so this user's future emails
// normalize correctly without waiting on anything else. The alias is keyed
// on the OLD (AI-derived) value as raw_name/raw_title, mapping to the NEW
// value's normalized form as canonical — so the next time this exact raw
// string is seen again, it resolves straight to what the user said was
// actually correct.
const recordEntityCorrection = async ({ userId, applicationId, field, oldValue, newValue, newNormalizedValue }) => {
  if (!oldValue || oldValue === newValue) return false; // nothing to attribute/alias

  const culprit = await repository.findCreationEmail(applicationId, userId);

  if (culprit) {
    await repository.insertFeedback({
      userId,
      applicationId,
      processedEmailId: culprit.processed_email_id,
      fieldCorrected: field, // 'company' | 'role'
      aiPredictedValue: oldValue,
      userCorrectedValue: newValue,
      senderDomain: culprit.sender_domain,
      emailSubject: culprit.subject,
      aiClassification: culprit.classification,
      aiConfidence: culprit.confidence,
    });
  } else {
    logger.debug(`[aiFeedback] no creation email found for application ${applicationId} — recording correction without email attribution skipped, alias write still proceeds`);
  }

  // Consumer 1 proceeds even without a culprit email — the alias itself is
  // useful independent of whether we could attribute a training pair.
  if (newNormalizedValue) {
    if (field === 'company') await upsertCompanyAlias(userId, oldValue, newNormalizedValue);
    else if (field === 'role') await upsertRoleAlias(userId, oldValue, newNormalizedValue);
  }

  return true;
};

// §4 — deletion with reason='not_a_job'. Classifier-level false positive:
// the email should never have produced an application at all. Attributed to
// the seed/creation email, same resolution as an entity correction.
const recordFalsePositive = async ({ userId, applicationId, company, role }) => {
  const culprit = await repository.findCreationEmail(applicationId, userId);
  if (!culprit) {
    logger.debug(`[aiFeedback] no creation email found for deleted application ${applicationId} — skipping false_positive record`);
    return false;
  }

  await repository.insertFeedback({
    userId,
    applicationId,
    processedEmailId: culprit.processed_email_id,
    fieldCorrected: 'false_positive',
    aiPredictedValue: culprit.classification,
    userCorrectedValue: 'not_a_job',
    senderDomain: culprit.sender_domain,
    emailSubject: culprit.subject,
    aiClassification: culprit.classification,
    aiConfidence: culprit.confidence,
  });
  return true;
};

// Consumer 2, §5.2 — bounded, structured few-shot examples for the prompt.
// Returns plain data (never a formatted string) so prompt.builder.js stays
// the single place responsible for actual prompt text/formatting rules.
// Capped at 2 by the repository query default; never freeform notes, never
// phrased as a sender-domain-wide rule — see prompt.builder.js for how
// these get rendered.
const getFewShotExamples = async (userId, senderDomain) => {
  if (!senderDomain) return [];
  const rows = await repository.findFewShotCorrections(userId, senderDomain, 2);
  return rows.map((row) => ({
    inputSnippet: row.email_snippet || row.email_subject || '',
    fieldCorrected: row.field_corrected,
    aiPredictedValue: row.ai_predicted_value,
    correctValue: row.user_corrected_value,
  }));
};

// Consumer 3, §5.3 — offline mining, not on any hot path.
const getCorrectionClusters = async (minFrequency = 3) => repository.findCorrectionClusters(minFrequency);

module.exports = {
  recordStatusCorrection,
  recordEntityCorrection,
  recordFalsePositive,
  getFewShotExamples,
  getCorrectionClusters,
};
