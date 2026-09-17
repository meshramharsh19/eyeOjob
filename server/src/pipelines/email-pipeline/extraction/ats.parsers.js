const cheerio = require('cheerio');

// ──────────────────────────────────────────────────
// STAGE 3a — DETERMINISTIC PARSER
// Zero-token extraction for vendors with a known template (ats.registry.js).
// Runs before the AI extractor; falls through to it when nothing matches or
// the sanity check rejects the result.
// ──────────────────────────────────────────────────

// ── Turn raw HTML into clean, whitespace-normalized text via the DOM ──
// (More reliable than blunt tag-stripping — handles tables/lists/entities correctly.)
const htmlToCleanText = (html) => {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('script, style').remove();
  return $.root().text().replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
};

// ── Company + role extraction ──────────────────
// Patterns observed across LinkedIn / Naukri / Indeed / Internshala confirmation emails.
// Ordered most-specific-first; first match wins. Each entry declares which capture
// group is the role and which is the company, since real templates use both
// "role at company" and "company for role" ordering.
const ROLE_AT_COMPANY_PATTERNS = [
  // "you applied to X job/role/position at Y" — connector word present
  { regex: /you(?:'ve| have)? applied (?:to|for) (?:the )?([A-Za-z0-9()/&+.,\- ]{2,60}?) (?:job|role|position) at ([A-Za-z0-9()&.,\- ]{2,60}?)[.,!\n]/i, role: 1, company: 2 },
  { regex: /your application (?:for|to) (?:the )?([A-Za-z0-9()/&+.,\- ]{2,60}?) (?:position|role) at ([A-Za-z0-9()&.,\- ]{2,60}?)[.,!\n]/i, role: 1, company: 2 },
  { regex: /applied for (?:the )?([A-Za-z0-9()/&+.,\- ]{2,60}?) (?:position|role) at ([A-Za-z0-9()&.,\- ]{2,60}?)[.,!\n]/i, role: 1, company: 2 },
  // "you applied to X at Y" — no connector word (LinkedIn/Indeed's common short form)
  { regex: /you(?:'ve| have)? applied (?:to|for) (?:the )?([A-Za-z0-9()/&+.,\- ]{2,60}?) at ([A-Za-z0-9()&.,\- ]{2,60}?)[.,!\n]/i, role: 1, company: 2 },
  // "application (was/has been/is) sent/submitted to Y for X" — company-first ordering (Naukri)
  { regex: /application (?:was |has been |is )?(?:sent|submitted) to ([A-Za-z0-9()&.,\- ]{2,60}?) for (?:the )?([A-Za-z0-9()/&+.,\- ]{2,60}?)[.,!\n]/i, role: 2, company: 1 },
  // "applied for X at Y" — no connector word
  { regex: /applied for (?:the )?([A-Za-z0-9()/&+.,\- ]{2,60}?) at ([A-Za-z0-9()&.,\- ]{2,60}?)[.,!\n]/i, role: 1, company: 2 },
  // "Thank you for your interest in the X position/role at Y" — the dominant LinkedIn
  // rejection template ("...position at Digichorus Technologies Pvt Ltd in Pune...").
  { regex: /interest in the ([A-Za-z0-9()/&+.,\- ]{2,60}?) (?:position|role) at ([A-Za-z0-9()&.,\- ]{2,60}?)(?: in [A-Za-z][A-Za-z,\s]{0,60}?)?[.,!\n]/i, role: 1, company: 2 },
];

const COMPANY_ONLY_PATTERNS = [
  /^([A-Za-z0-9()&.,\- ]{2,60}?) (?:has received|received) your application/im,
  /your application (?:to|at|with) ([A-Za-z0-9()&.,\- ]{2,60}?) (?:has been|was) (?:received|submitted)/i,
  /(?:application |your application )?(?:was |has been |is )?(?:sent|submitted) to ([A-Za-z0-9()&.,\- ]{2,60}?)[.,!\n]/i,
  // "thank you for taking the time to apply at Qualys." — Workday/generic ATS rejection template
  // where company never appears paired with a role in the same sentence.
  /(?:taking the time to )?appl(?:y|ying) at ([A-Za-z0-9()&.,\- ]{2,60}?)[.,!\n]/i,
  // "as well as for your interest in Rockwell Automation." — company mentioned in a later
  // sentence than the role, so it can't be captured by the ROLE_AT_COMPANY pair patterns.
  // Negative lookahead avoids misfiring on "...interest in the X position at Y" sentences,
  // which the ROLE_AT_COMPANY_PATTERNS above already handle when they match first.
  /(?:as well as )?for your interest in (?!the\b)([A-Za-z0-9()&.,\- ]{2,60}?)[.,!\n]/i,
  // LinkedIn subject lines: "Harsh, your application was sent to X" / "...to Y at X"
  /application was sent to ([A-Za-z0-9()&.,\- ]{2,60}?)[.,!\n]/i,
  /application was viewed by ([A-Za-z0-9()&.,\- ]{2,60}?)[.,!\n]/i,
];

const ROLE_ONLY_PATTERNS = [
  /interest in the ([A-Za-z0-9()/&+.,\- ]{2,60}?) role/i,
  /applying for (?:the )?([A-Za-z0-9()/&+.,\- ]{2,60}?) (?:position|role)/i,
  /application for (?:the )?([A-Za-z0-9()/&+.,\- ]{2,60}?) (?:position|role)/i,
  /position of ([A-Za-z0-9()/&+.,\- ]{2,60}?)[.,\n]/i,
  /role of ([A-Za-z0-9()/&+.,\- ]{2,60}?)[.,\n]/i,
  // "Regarding your Honeywell Application for Systems Engr I - 151071" (subject line)
  /interest in the position of ([A-Za-z0-9()/&+.,\- ]{2,60}?)(?: at| in|[.,\n])/i,
];

// ── Job ID extraction — the strongest matching signal when a vendor includes it ──
const JOB_ID_PATTERNS = [
  /\bJob\s*ID\s*[:#]\s*([A-Za-z0-9\-_/]{3,40})/i,
  /\bReq(?:uisition)?\s*(?:ID|No\.?|Number)\s*[:#]\s*([A-Za-z0-9\-_/]{3,40})/i,
  /\bReference\s*(?:ID|No\.?|Number)\s*[:#]\s*([A-Za-z0-9\-_/]{3,40})/i,
  /\bPosting\s*ID\s*[:#]\s*([A-Za-z0-9\-_/]{3,40})/i,
  // "Support Engineer, Recommerce (ID: 10427858)" — Amazon Jobs
  /\(ID:\s*([A-Za-z0-9\-_/]{3,40})\)/i,
  // "R0004598 Front End Software Engineer (A156476)" — Workday business-process notifications
  /\b(R\d{6,8})\b/,
];

const extractJobId = (text) => {
  for (const pattern of JOB_ID_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[1].trim();
  }
  return null;
};

// ── Location extraction — only catches explicit "Location:"-style lines;
// free-form "City, State" text embedded in prose isn't reliable enough to
// parse deterministically, so those cases fall through to the AI extractor. ──
const LOCATION_PATTERNS = [
  /\b(?:Location|Job Location|Work Location|Based in)\s*[:\-]\s*([A-Za-z][A-Za-z\s,]{2,60}?)(?:[.\n]|$)/i,
];

const extractLocation = (text) => {
  for (const pattern of LOCATION_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[1].trim();
  }
  return null;
};

// ── Status extraction — most specific/rare signals checked first ──
const STATUS_PATTERNS = [
  { status: 'Offer', patterns: [/offer letter/i, /pleased to offer/i, /welcome aboard/i, /formal offer/i] },
  { status: 'Rejected', patterns: [
    /regret to inform/i, /not moving forward/i, /not selected/i, /position has been filled/i, /won'?t be proceeding/i,
    /decided to (?:move forward|proceed) with (?:a |another )?candidate/i,
    /have not been shortlisted/i, /has not been shortlisted/i, /not shortlisted for the next/i,
    /will not be pursuing your candidacy/i, /we (?:have )?chosen to move forward with applicants/i,
    /received an exceptionally high volume of applications/i, /filled very quickly/i,
    /very competitive selection process/i, /application has expired/i,
  ] },
  { status: 'Interview', patterns: [/interview (?:invitation|scheduled|request|slot)/i, /schedule an interview/i, /shortlisted for the next round/i, /shortlisted/i, /next round/i] },
  { status: 'OA', patterns: [/online assessment/i, /coding challenge/i, /technical assessment/i, /complete the assessment/i, /hackerrank|hackerearth|codility/i] },
  { status: 'Applied', patterns: [/successfully applied/i, /application received/i, /thank you for applying/i, /application (?:has been )?submitted/i, /you applied (?:to|for)/i, /application successful/i, /your application was sent to/i] },
];

const extractCompanyAndRole = (text) => {
  for (const { regex, role, company } of ROLE_AT_COMPANY_PATTERNS) {
    const m = text.match(regex);
    if (m) return { role: m[role].trim(), company: m[company].trim() };
  }

  let company = null;
  for (const pattern of COMPANY_ONLY_PATTERNS) {
    const m = text.match(pattern);
    if (m) { company = m[1].trim(); break; }
  }

  let role = null;
  for (const pattern of ROLE_ONLY_PATTERNS) {
    const m = text.match(pattern);
    if (m) { role = m[1].trim(); break; }
  }

  return { role, company };
};

const extractStatus = (text) => {
  for (const { status, patterns } of STATUS_PATTERNS) {
    if (patterns.some(p => p.test(text))) return status;
  }
  return null;
};

// ── Run the deterministic parser for a known vendor ──
// Returns null if it can't confidently extract anything — caller falls back to AI.
const parseWithVendorRules = ({ subject = '', plainText = '', html = '' }) => {
  const text = html ? htmlToCleanText(html) : plainText;
  const searchText = `${subject}\n${text}`.substring(0, 8000);

  const { company, role } = extractCompanyAndRole(searchText);
  const status = extractStatus(searchText);
  const jobId = extractJobId(searchText);
  const location = extractLocation(searchText);

  if (!company && !role) return null;

  return {
    company,
    role,
    status,
    jobId,
    location,
    source: 'deterministic_parser',
  };
};

// ── Sanity check — never trust a parser result blindly ──
// company must be non-empty and not a platform name; role must be non-empty;
// status (if present) must map to a known enum.
const KNOWN_STATUSES = new Set(['Applied', 'OA', 'Interview', 'HR Round', 'Final Round', 'Offer', 'Rejected', 'Withdrawn']);
const PLATFORM_NAMES = new Set(['linkedin', 'naukri', 'indeed', 'internshala', 'unstop', 'wellfound', 'greenhouse', 'lever', 'workday']);

const passesSanityCheck = (result) => {
  if (!result) return false;
  if (!result.company || PLATFORM_NAMES.has(result.company.toLowerCase())) return false;
  if (!result.role) return false;
  if (result.status && !KNOWN_STATUSES.has(result.status)) return false;
  return true;
};

module.exports = { htmlToCleanText, parseWithVendorRules, passesSanityCheck, extractJobId, extractLocation };
