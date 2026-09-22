// Shared job-email extraction prompt + JSON response parser — used by both
// the server-managed fallback chain (ai.extractor.js) and every BYOK
// provider adapter (server/src/modules/ai-providers/adapters/), so the
// extraction behavior is identical regardless of whose API key runs it.

// AI Correction Feedback Loop (Project DOCs/ai-feedback-loop.md §5.2) —
// Consumer 2. `examples` are pre-fetched, already-bounded (max 2, see
// aiFeedback.service.js's getFewShotExamples) structured records — never
// freeform text a user typed. Rendered strictly as "here is one specific
// past email and what it actually was", NEVER as a rule about the sender in
// general: the same sender domain legitimately sends confirmations,
// interviews, offers, AND rejections, so a blanket "emails from X mean Y"
// instruction would misclassify the next real email of a different kind
// from that same sender. This is the exact mistake flagged in review before
// implementation — the wording below is deliberately per-example, not
// per-sender.
const formatFewShotSection = (examples) => {
  if (!examples?.length) return '';

  const blocks = examples.slice(0, 2).map((ex, i) => {
    const snippet = (ex.inputSnippet || '').substring(0, 300).replace(/\s+/g, ' ').trim();
    const correction = ex.fieldCorrected === 'false_positive'
      ? `{"was_actually_a_job_email": false}`
      : `{"${ex.fieldCorrected}": ${JSON.stringify(ex.correctValue)}}`;
    return `Example ${i + 1} (one specific past email from this sender, NOT a rule about this sender in general):
Input snippet: "${snippet}"
This exact email was confirmed by the user to actually be: ${correction}`;
  }).join('\n\n');

  return `
------------------------------------------------------------
PAST CORRECTIONS FOR THIS SENDER (reference only — judge THIS email on its own content)
------------------------------------------------------------

The examples below are specific past emails this same sender previously sent, and what a human confirmed they actually were. They do NOT mean every email from this sender is the same thing — this sender may send confirmations, interviews, offers, and rejections. Use them only to calibrate wording/tone this sender uses, never to assume this new email's outcome.

${blocks}
`;
};

const buildPrompt = (subject, body, sender, emailReceivedAt = null, fewShotExamples = []) => `
You are an expert AI email classifier and parser for a Job Application Tracker.

Your job has two steps, in this order:

STEP 1 — Classify the email's INTENT. This is the most important decision you make. Choose exactly ONE intent, based on what the email MEANS, not what specific words it uses. New job boards and ATS platforms constantly invent new wording for the same underlying intent — judge the meaning, not the phrasing.

STEP 2 — Only if the intent is one of the six "lifecycle" intents below, extract structured fields (company, role, status, etc). For every other intent, extraction fields are irrelevant — leave them null.

Be EXTREMELY conservative.

Never guess.

If you are not confident about the intent, classify it as "other".

------------------------------------------------------------
EMAIL
------------------------------------------------------------

Subject:
${subject}

Sender:
${sender}

Email received at (anchor date — resolve ALL relative dates in the body against THIS date, not today):
${emailReceivedAt ? new Date(emailReceivedAt).toISOString() : 'unknown'}

Body:
${body?.substring(0, 5000)}
${formatFewShotSection(fewShotExamples)}
------------------------------------------------------------
OUTPUT
------------------------------------------------------------

Return ONLY a valid JSON object.

Do NOT include markdown.

Do NOT explain anything.

Return exactly this schema:

{
  "intent": null,
  "company": null,
  "role": null,
  "platform": null,
  "status": null,
  "event_type": null,
  "event_date": null,
  "applied_date": null,
  "job_id": null,
  "location": null,
  "confidence": 0,
  "is_job_email": false
}

------------------------------------------------------------
event_type / event_date (granular lifecycle event)
------------------------------------------------------------

In addition to "status" (the coarse stage, kept for backward compatibility),
report the GRANULAR lifecycle event this email represents. Choose exactly
ONE of these values for "event_type" (or null if intent is not lifecycle):

APPLIED, APPLICATION_RECEIVED, APPLICATION_UNDER_REVIEW, SHORTLISTED,
ASSESSMENT_INVITED, ASSESSMENT_COMPLETED, ASSESSMENT_PASSED, ASSESSMENT_FAILED,
INTERVIEW_INVITED, INTERVIEW_SCHEDULED, INTERVIEW_COMPLETED, INTERVIEW_PASSED,
INTERVIEW_FAILED, OFFER_RECEIVED, OFFER_ACCEPTED, OFFER_DECLINED, REJECTED,
WITHDRAWN

"event_date" is the date the EVENT ITSELF happens/happened (e.g. the
scheduled interview date, the date an assessment is due), NOT necessarily
the date the email was sent. If the email says something relative ("in 3
days", "this Friday", "next week"), resolve it against the anchor date
given above ("Email received at") and return an absolute ISO date
(YYYY-MM-DD). If no specific event date is stated, return null (the caller
falls back to the email's own received date).

------------------------------------------------------------
FIELD DEFINITIONS
------------------------------------------------------------

intent

Choose exactly ONE of these 12 values (as a lowercase string):

"application_confirmation" — user applied / application was received or submitted

"application_update" — a general status update on an existing application that isn't specifically an interview/assessment/offer/rejection

"interview" — interview invitation, scheduling, confirmation, or reminder

"assessment" — online assessment, coding challenge, technical test invitation

"offer" — job offer, offer letter

"rejection" — application rejected, not moving forward, not selected

"job_recommendation" — suggested/recommended job, "you might like this role", job-matching emails (NOT an application the user made)

"newsletter" — digest, roundup, general platform newsletter

"marketing" — promotional content, upsells, ads, subscription offers

"security" — sign-in alerts, new device login, suspicious activity, password reset

"otp" — one-time passwords, verification codes

"other" — anything that doesn't fit the above (personal email, unrelated notification, etc.)

The first six values above are LIFECYCLE intents — only for these should you populate company/role/platform/status/applied_date. For every other intent, set company, role, platform, status, and applied_date to null, and set is_job_email to false.

Judge by meaning: a "job_recommendation" email can use phrases that superficially resemble a confirmation (e.g. mentions a specific company and role), but if the email is suggesting a job rather than confirming the user applied to one, the intent is still "job_recommendation", not "application_confirmation".

company

The ACTUAL employer.

Examples

Google
Microsoft
Amazon
Oracle
Adobe
Accenture
TCS
Infosys

NOT

LinkedIn
Naukri
Indeed
Internshala
Unstop
Wellfound

These are job platforms, NOT employers.

Example

LinkedIn email

"Amazon has received your application."

Correct

company = "Amazon"
platform = "linkedin"

Wrong

company = "LinkedIn"

------------------------------------------------------------

role

Extract the actual job title.

The role is often embedded inside a sentence, not written as a standalone heading. Extract it from phrasing like:

"your interest in the X role" → role = X

"application for the X position" → role = X

"applying for X" → role = X

"regarding your X application" → role = X

Read the full sentence before deciding the role is missing.

Examples

Software Engineer

Frontend Developer

Backend Developer

Full Stack Developer

React Developer

Node.js Developer

SDE

SDE-1

SDE-2

Software Engineer Intern

Data Analyst

QA Engineer

Machine Learning Engineer

Cloud Engineer

DevOps Engineer

If the role cannot be confidently identified

return null.

Never return

Unknown
Unknown Role
N/A
Not Mentioned

------------------------------------------------------------

platform

Only choose one of

linkedin
naukri
indeed
internshala
unstop
wellfound
direct
other
null

------------------------------------------------------------

status

Only choose one of

Applied

Assessment

OA

Interview

HR Round

Technical Round

Managerial Round

Final Round

Offer

Rejected

Withdrawn

null

Status mapping

Application received

Thank you for applying

Your application has been submitted

Application confirmation

→ Applied

Assessment

Coding Challenge

Online Assessment

Hackerrank

Codility

Test Invitation

→ Assessment

Interview Invitation

Interview Scheduled

Interview Confirmation

→ Interview

HR Interview

Recruiter Call

HR Discussion

→ HR Round

Technical Interview

Tech Round

Pair Programming

→ Technical Round

Final Interview

Panel Interview

Leadership Round

→ Final Round

Congratulations

Offer Letter

Offer Released

→ Offer

Unfortunately

Regret to inform

Not moving forward

Application rejected

We have decided to move forward with a candidate whose experience better meets our needs

Have not been shortlisted / has not been shortlisted for the next stage

Will not be pursuing your candidacy

Received an exceptionally high volume of applications and was filled very quickly

Application has expired

→ Rejected

Application withdrawn

→ Withdrawn

------------------------------------------------------------

job_id

The employer's internal identifier for this specific opening, if explicitly stated — e.g. "Job ID: JR-10231", "Requisition #4471", "Reference Number: 88213".

Only extract it if it is labeled as an ID/requisition/reference number. Never invent one. Return null if absent.

------------------------------------------------------------

location

The job's work location (city, or city + state/country) if explicitly stated — e.g. "Bangalore", "Hyderabad, Telangana", "Remote".

Extract only what is stated for THIS specific role. Return null if absent or ambiguous.

------------------------------------------------------------
JOB EMAILS
------------------------------------------------------------

These ARE job emails

Application received

Application confirmation

Application update

Recruiter communication

Assessment invitation

Coding challenge

Interview scheduling

Interview reminder

HR email

Offer letter

Rejection email

Referral update

Candidate portal update

------------------------------------------------------------
NOT JOB EMAILS
------------------------------------------------------------

Reject these

Suggested jobs

Recommended jobs

Daily Digest

Weekly Digest

Job Alerts

People You May Know

Connection Request

Marketing emails

Newsletter

Advertisement

Promotional offers

Subscription emails

Security alerts

Password reset

OTP

Account verification

Billing

Invoice

Payment

Spam

General LinkedIn notifications

General Naukri notifications

General Indeed notifications

------------------------------------------------------------
MARKETING WRAPPED AROUND A REAL CONFIRMATION
------------------------------------------------------------

Job platforms often wrap a genuine application confirmation inside marketing content — app download banners, interview-prep upsells, "get the app" CTAs, promotional buttons.

This is still a JOB EMAIL if it contains an explicit statement like:

"you've applied to X job at Y"

"you applied to X at Y"

"your application to X at Y"

Do NOT reject an email just because it also contains ads, upsells, or promotional CTAs.

Only reject it if, after ignoring the marketing chrome, there is NO explicit statement that an application was submitted to a specific company for a specific role.

Example

Subject: "SmartDocs Business Solutions Private Limited Application Successful | Ace your interview using PrepAI's personalised Q&A"

Body: "Hi Harsh, you've applied to Jr. DevOps Engineer job at SmartDocs Business Solutions Private Limited." followed by interview-prep upsell content.

Correct

is_job_email = true

company = "SmartDocs Business Solutions Private Limited"

role = "Jr. DevOps Engineer"

status = "Applied"

Wrong

Rejecting this because of the PrepAI/interview-prep marketing content.

------------------------------------------------------------
IMPORTANT COMPANY RULES
------------------------------------------------------------

Company should NEVER be

LinkedIn

Naukri

Indeed

Internshala

Unstop

Wellfound

unless that company is actually hiring for itself.

These are platforms, NOT employers.

Examples

LinkedIn email saying

"Amazon is interested in your application."

company = "Amazon"

platform = "linkedin"

NOT

company = "LinkedIn"

Example

Naukri email saying

"TCS viewed your profile."

company = "TCS"

platform = "naukri"

NOT

company = "Naukri"

Example

Indeed email saying

"Microsoft has invited you to interview."

company = "Microsoft"

platform = "indeed"

NOT

company = "Indeed"

------------------------------------------------------------
CONFIDENCE SCORING
------------------------------------------------------------

100

Company

Role

Status

Clearly identified.

95

Everything is explicit.

90

Company and role are very clear.

80

Strong evidence.

70

Likely correct.

60

Some uncertainty.

Below 60

Reject the email.

Set

"is_job_email": false

------------------------------------------------------------
REJECTION RULES
------------------------------------------------------------

Reject the email (treat as non-lifecycle) if ANY of these are true

intent is not one of the six lifecycle intents

confidence < 60

company == null

role == null

role == ""

role == "Unknown"

role == "Unknown Role"

If rejected

Return

{
  "intent": <the intent you determined — still report it, even if not lifecycle>,
  "company": null,
  "role": null,
  "platform": null,
  "status": null,
  "event_type": null,
  "event_date": null,
  "applied_date": null,
  "job_id": null,
  "location": null,
  "confidence": <calculated score>,
  "is_job_email": false
}

------------------------------------------------------------
IMPORTANT
------------------------------------------------------------

Never invent company names.

Never invent job titles.

Never guess.

Return null instead of guessing.

Return ONLY valid JSON.

No explanation.

No markdown.

No extra text.
`;

const cleanAndParse = (text) => {
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
};

module.exports = { buildPrompt, cleanAndParse, formatFewShotSection };
