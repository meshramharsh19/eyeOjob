const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../../../config/env');
const logger = require('../../../config/logger');
const { INTENTS, isLifecycleIntent } = require('../classification/intentTypes');
const { recordProviderCall } = require('../pipeline.stats');

const groq = new Groq({ apiKey: env.ai.groqApiKey });
const genAI = new GoogleGenerativeAI(env.ai.geminiApiKey);

const OPENROUTER_API_KEY = env.ai.openRouterApiKey;
const OPENROUTER_MODEL = env.ai.openRouterModel;

const buildPrompt = (subject, body, sender, emailReceivedAt = null) => `
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

// ──────────────────────────────────────────────
// Provider callers — each throws on failure, and each returns
// { json, usage } rather than the bare parsed object, so the caller can log
// token consumption per provider. `usage` is null where a provider doesn't
// expose it (shouldn't happen for any of these OpenAI-compatible ones, but
// Gemini reports it under a different field name, handled below).
// ──────────────────────────────────────────────
const usageFromOpenAIStyle = (data) => data.usage
  ? { promptTokens: data.usage.prompt_tokens ?? null, completionTokens: data.usage.completion_tokens ?? null, totalTokens: data.usage.total_tokens ?? null }
  : null;

const callGroq = async (prompt) => {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  });
  return {
    json: cleanAndParse(completion.choices[0]?.message?.content?.trim() || ''),
    usage: usageFromOpenAIStyle(completion),
  };
};

const callOpenRouter = async (prompt) => {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error(`OpenRouter request failed: ${res.status}`);
  const data = await res.json();
  return {
    json: cleanAndParse(data.choices?.[0]?.message?.content?.trim() || ''),
    usage: usageFromOpenAIStyle(data),
  };
};

// Was 'gemini-2.5-flash-lite' — that pinned model is deprecated for new
// users and 404s now. 'gemini-flash-lite-latest' is Google's rolling alias
// to whatever their current fast/free-tier model is, so this stops going
// stale every time Google renames/retires a version.
const callGemini = async (prompt) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
  const result = await model.generateContent(prompt);
  const usageMeta = result.response.usageMetadata;
  return {
    json: cleanAndParse(result.response.text().trim()),
    usage: usageMeta
      ? { promptTokens: usageMeta.promptTokenCount ?? null, completionTokens: usageMeta.candidatesTokenCount ?? null, totalTokens: usageMeta.totalTokenCount ?? null }
      : null,
  };
};

// Cerebras Cloud — OpenAI-compatible endpoint. Free tier (~14,400 req/day,
// 1M tokens/day per model as of writing) is comparable to Groq's but on
// genuinely separate infrastructure/quota, so it's a real second leg rather
// than just another queue behind the same bottleneck.
const CEREBRAS_API_KEY = env.ai.cerebrasApiKey;
const CEREBRAS_MODEL = env.ai.cerebrasModel;

const callCerebras = async (prompt) => {
  if (!CEREBRAS_API_KEY) throw new Error('CEREBRAS_API_KEY not set');
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CEREBRAS_API_KEY}`
    },
    body: JSON.stringify({
      model: CEREBRAS_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error(`Cerebras request failed: ${res.status}`);
  const data = await res.json();
  return {
    json: cleanAndParse(data.choices?.[0]?.message?.content?.trim() || ''),
    usage: usageFromOpenAIStyle(data),
  };
};

// Mistral "La Plateforme" — OpenAI-compatible endpoint. Free "Experiment"
// tier gives a large monthly token budget on its own separate quota; RPM
// isn't published, so it's placed after Groq/Cerebras rather than first.
const MISTRAL_API_KEY = env.ai.mistralApiKey;
const MISTRAL_MODEL = env.ai.mistralModel;

const callMistral = async (prompt) => {
  if (!MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY not set');
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error(`Mistral request failed: ${res.status}`);
  const data = await res.json();
  return {
    json: cleanAndParse(data.choices?.[0]?.message?.content?.trim() || ''),
    usage: usageFromOpenAIStyle(data),
  };
};

// SambaNova Cloud — OpenAI-compatible endpoint. Persistent free tier (not a
// depleting one-time credit grant like NVIDIA NIM) — 10-30 RPM depending on
// model, resets continuously rather than a signup-only allowance.
const SAMBANOVA_API_KEY = env.ai.sambanovaApiKey;
const SAMBANOVA_MODEL = env.ai.sambanovaModel;

const callSambaNova = async (prompt) => {
  if (!SAMBANOVA_API_KEY) throw new Error('SAMBANOVA_API_KEY not set');
  const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SAMBANOVA_API_KEY}`
    },
    body: JSON.stringify({
      model: SAMBANOVA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error(`SambaNova request failed: ${res.status}`);
  const data = await res.json();
  return {
    json: cleanAndParse(data.choices?.[0]?.message?.content?.trim() || ''),
    usage: usageFromOpenAIStyle(data),
  };
};

// Cloudflare Workers AI — permanent free tier, 10,000 "neurons"/day (their
// compute unit), resets daily, no card. Endpoint is per-account/per-model;
// the llama-3.1-8b-instruct model actually responds in OpenAI chat-completion
// shape wrapped one level deeper — { result: { choices: [...] } }, not the
// { result: { response: "..." } } shape some other Workers AI models use.
// Verified directly against the live API rather than assumed from docs.
const CLOUDFLARE_ACCOUNT_ID = env.ai.cloudflareAccountId;
const CLOUDFLARE_API_TOKEN = env.ai.cloudflareApiToken;
const CLOUDFLARE_MODEL = env.ai.cloudflareModel;

const callCloudflare = async (prompt) => {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN not set');
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${CLOUDFLARE_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
    }
  );
  if (!res.ok) throw new Error(`Cloudflare request failed: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Cloudflare error: ${JSON.stringify(data.errors)}`);
  const content = data.result?.choices?.[0]?.message?.content ?? data.result?.response;
  return {
    json: cleanAndParse((content || '').trim()),
    usage: usageFromOpenAIStyle(data.result || {}),
  };
};

// Cohere — using their OpenAI-compatibility endpoint rather than the native
// /v2/chat shape, so it reuses the same request/response handling as every
// other provider here. Trial key free tier (~100 req/day, doesn't expire),
// smallest daily volume of the new providers so it's placed near the end.
const COHERE_API_KEY = env.ai.cohereApiKey;
const COHERE_MODEL = env.ai.cohereModel;

const callCohere = async (prompt) => {
  if (!COHERE_API_KEY) throw new Error('COHERE_API_KEY not set');
  const res = await fetch('https://api.cohere.ai/compatibility/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${COHERE_API_KEY}`
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error(`Cohere request failed: ${res.status}`);
  const data = await res.json();
  return {
    json: cleanAndParse(data.choices?.[0]?.message?.content?.trim() || ''),
    usage: usageFromOpenAIStyle(data),
  };
};

// All provider callers, keyed by name — used by both the fallback chain and
// the startup health check below, so there's one source of truth for
// "what providers exist and are they configured".
const PROVIDER_CALLERS = {
  Groq: { call: callGroq, configured: () => true }, // required env var, checked at process start
  SambaNova: { call: callSambaNova, configured: () => !!SAMBANOVA_API_KEY },
  Gemini: { call: callGemini, configured: () => !!env.ai.geminiApiKey },
  OpenRouter: { call: callOpenRouter, configured: () => !!OPENROUTER_API_KEY },
  Mistral: { call: callMistral, configured: () => !!MISTRAL_API_KEY },
  Cloudflare: { call: callCloudflare, configured: () => !!(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) },
  Cohere: { call: callCohere, configured: () => !!COHERE_API_KEY },
  Cerebras: { call: callCerebras, configured: () => !!CEREBRAS_API_KEY }, // not in the active chain — see note below
};

// ──────────────────────────────────────────────
// AI EMAIL EXTRACTOR
// Company, role, platform, status extract karta hai
// Order: Groq -> SambaNova -> Gemini -> OpenRouter -> Mistral -> Cloudflare -> Cohere
//
// All of these are daily-renewing/persistent free tiers with no card —
// Cerebras and NVIDIA NIM are deliberately NOT in this chain: Cerebras 402s
// until a card is added, NVIDIA NIM's ~1,000 credits are a one-time signup
// grant, not a renewing quota. Their call functions (callCerebras above)
// are left defined in case that tradeoff changes later. Gemini uses
// 'gemini-flash-lite-latest' (Google's rolling alias) rather than a pinned
// version — the earlier pinned model had gone stale/404 for new users.
//
// OpenRouter's model default is 'google/gemma-4-31b-it:free' — there is NO
// free Gemini model on OpenRouter as of this writing (checked the live
// /v1/models list directly); Gemma is Google's closest free equivalent.
// Free slugs there rotate weekly regardless — verify at openrouter.ai/models
// if this starts 404ing again.
// ──────────────────────────────────────────────

// History: 40000ms -> 12000ms -> 18000ms. With 7 providers now chained,
// even 18s per hop is too expensive if several stall in a row (up to 2+
// minutes worst case). 9s is the new target — long enough that a genuinely
// answering provider isn't cut off, short enough that a full 7-provider
// fallback still resolves in well under a minute even if the first few fail.
const PROVIDER_TIMEOUT_MS = 9000;

// A stalled/rate-limited provider must never eat the whole sync budget —
// fail fast and let the next provider in the chain take over.
const withTimeout = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// ── Per-provider concurrency limiter ────────────────────────────────────
// Overall sync concurrency (pipeline.orchestrator.js CONCURRENCY) used to be
// capped at 2 purely to protect Groq's free-tier rate limit — which throttled
// every email in the sync, including ones that never call AI at all. Rate
// limiting belongs at the provider call site, not the whole pipeline: cap how
// many Groq calls are in flight at once here, and let orchestrator concurrency
// reflect actual I/O parallelism instead of Groq's quota.
const makeLimiter = (maxConcurrent) => {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
};

const groqLimiter = makeLimiter(3);
const cerebrasLimiter = makeLimiter(3);
const sambanovaLimiter = makeLimiter(2); // SambaNova's free RPM (10-30) is lower than Groq's
const PROVIDER_LIMITERS = { Groq: groqLimiter, Cerebras: cerebrasLimiter, SambaNova: sambanovaLimiter };

// ── Circuit breaker ─────────────────────────────────────────────────────
// With 7 providers in the chain, a provider that's down for an extended
// stretch (quota exhausted for the day, outage, etc.) shouldn't still eat a
// full timeout on every single email — that's pure wasted latency once it's
// established the provider isn't answering. After 3 consecutive failures,
// skip that provider entirely for 10 minutes; a 200 anywhere resets its
// failure count immediately. State is in-memory and per-process, which is
// fine here — it only needs to survive within one sync run, and resetting
// on restart is the safe direction to fail in.
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 10 * 60 * 1000;
const circuitState = {}; // { [providerName]: { consecutiveFailures, openUntil } }

const getCircuit = (name) => (circuitState[name] ??= { consecutiveFailures: 0, openUntil: 0 });

const isCircuitOpen = (name) => Date.now() < getCircuit(name).openUntil;

const recordCircuitSuccess = (name) => {
  const circuit = getCircuit(name);
  circuit.consecutiveFailures = 0;
  circuit.openUntil = 0;
};

const recordCircuitFailure = (name) => {
  const circuit = getCircuit(name);
  circuit.consecutiveFailures++;
  if (circuit.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && circuit.openUntil < Date.now()) {
    circuit.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    logger.warn(`[ai.extractor] circuit opened for ${name} after ${circuit.consecutiveFailures} consecutive failures — skipping for ${CIRCUIT_COOLDOWN_MS / 60000}min`);
  }
};

// ── Rate-limit-aware retry ──────────────────────
// Free-tier providers under sync concurrency hit 429s constantly — most
// clear within a couple seconds. A single short retry recovers a large
// fraction of what would otherwise be treated as a full provider failure,
// without eating so much time that it defeats the point of the fallback chain.
const isRateLimitError = (err) => {
  const status = err?.status || err?.response?.status;
  if (status === 429) return true;
  return /\b429\b|rate.?limit|quota|resource.*exhausted/i.test(err?.message || '');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callWithRetry = async (call, prompt, label) => {
  const attempt = () => withTimeout(call(prompt), PROVIDER_TIMEOUT_MS, label);
  // Groq/Cerebras calls are funneled through a per-provider concurrency
  // limiter instead of relying on orchestrator-wide concurrency to stay low —
  // this is what actually protects each free-tier quota now (see
  // makeLimiter above). Providers without a limiter just run directly.
  const limiter = PROVIDER_LIMITERS[label];
  const run = limiter ? () => limiter(attempt) : attempt;
  try {
    return await run();
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    await sleep(1500);
    return run();
  }
};

const extractJobDetails = async (subject, body, sender, stats = null, emailReceivedAt = null) => {
  const prompt = buildPrompt(subject, body, sender, emailReceivedAt);
  // Seven no-card, daily-renewing (not one-time-credit) free tiers, in
  // requested order: Mistral -> Gemini -> Cohere -> Groq -> rest. Cerebras
  // stays out of this chain — it 402s until a card is added — but its call
  // function is kept defined above in case that changes; just splice it
  // back in.
  const providers = [
    ['Mistral', callMistral],
    ['Gemini', callGemini],
    ['Cohere', callCohere],
    ['Groq', callGroq],
    ['SambaNova', callSambaNova],
    ['OpenRouter', callOpenRouter],
    ['Cloudflare', callCloudflare],
  ];

  for (const [name, call] of providers) {
    if (isCircuitOpen(name)) {
      logger.debug(`[ai.extractor] ${name} circuit open, skipping — cooldown until ${new Date(getCircuit(name).openUntil).toISOString()}`);
      continue;
    }

    const start = Date.now();
    try {
      const { json: result, usage } = await callWithRetry(call, prompt, name);
      const ms = Date.now() - start;
      if (stats) recordProviderCall(stats, name, ms, false);
      recordCircuitSuccess(name);
      logger.info(`[ai.extractor] ${name} ok — ${ms}ms, intent=${result.intent || 'null'}, tokens=${usage?.totalTokens ?? 'n/a'}`);

      // Never trust the model's own is_job_email flag over the intent it reported —
      // enforce the lifecycle gate here regardless of what the model claims.
      const lifecycle = isLifecycleIntent(result.intent);
      return {
        ...result,
        intent: result.intent || INTENTS.OTHER,
        is_job_email: lifecycle && result.is_job_email !== false,
        company: lifecycle ? result.company : null,
        role: lifecycle ? result.role : null,
        job_id: lifecycle ? (result.job_id || null) : null,
        location: lifecycle ? (result.location || null) : null,
        event_type: lifecycle ? (result.event_type || null) : null,
        event_date: lifecycle ? (result.event_date || null) : null,
      };
    } catch (err) {
      const ms = Date.now() - start;
      if (stats) recordProviderCall(stats, name, ms, true);
      recordCircuitFailure(name);
      logger.error(`[ai.extractor] ${name} failed — ${ms}ms, reason: ${err.message}`);
    }
  }

  // All providers failed/timed out — this is NOT the same as the AI confidently
  // deciding the email isn't job-related. Flagged distinctly so the caller can
  // route it to needs_review instead of silently discarding a possibly-real
  // application just because every provider happened to be unavailable.
  return {
    intent: INTENTS.OTHER, company: null, role: null, platform: null,
    status: null, event_type: null, event_date: null, applied_date: null,
    job_id: null, location: null,
    confidence: 0, is_job_email: false, extractionFailed: true,
  };
};

// ──────────────────────────────────────────────
// STARTUP HEALTH CHECK
// Pings every configured provider with a trivial prompt so config problems
// (missing key, dead model slug, expired trial) show up in the startup log
// immediately instead of surfacing as a mid-sync failure hours later.
// Call this once from server.js after env is loaded — it's not on the hot
// path of any email sync.
// ──────────────────────────────────────────────
const HEALTH_CHECK_PROMPT = 'Return ONLY this exact JSON, nothing else: {"ok":true}';
const HEALTH_CHECK_TIMEOUT_MS = 6000;

const checkProviderHealth = async () => {
  // Chain order first, Cerebras last as an informational extra since it's
  // not currently spliced into the active fallback chain (see note above).
  const names = ['Mistral', 'Gemini', 'Cohere', 'Groq', 'SambaNova', 'OpenRouter', 'Cloudflare', 'Cerebras'];
  const results = await Promise.all(names.map(async (name) => {
    const provider = PROVIDER_CALLERS[name];
    if (!provider.configured()) {
      return { name, ok: false, reason: 'not configured (missing API key)' };
    }
    try {
      await withTimeout(provider.call(HEALTH_CHECK_PROMPT), HEALTH_CHECK_TIMEOUT_MS, name);
      return { name, ok: true };
    } catch (err) {
      return { name, ok: false, reason: err.message };
    }
  }));

  logger.info('[ai.extractor] provider health check:');
  for (const r of results) {
    const inChain = r.name !== 'Cerebras';
    const suffix = !inChain ? ' (not in active chain)' : '';
    logger.info(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.reason}`}${suffix}`);
  }
  return results;
};

module.exports = { extractJobDetails, checkProviderHealth };
