// ──────────────────────────────────────────────────
// ATS REGISTRY
// Sender domain → vendor lookup. A vendor with `hasParser: true` gets tried
// against the deterministic parser (ats.parsers.js) before falling back to the
// AI extractor. New vendors start with hasParser: false until enough
// needs_review corrections justify writing a parser for them.
// ──────────────────────────────────────────────────

const VENDORS = [
  { domain: 'linkedin.com', name: 'LinkedIn', hasParser: true },
  { domain: 'naukri.com', name: 'Naukri', hasParser: true },
  { domain: 'indeed.com', name: 'Indeed', hasParser: true },
  { domain: 'internshala.com', name: 'Internshala', hasParser: true },
  { domain: 'unstop.com', name: 'Unstop', hasParser: true },
  { domain: 'wellfound.com', name: 'Wellfound', hasParser: true },
  { domain: 'greenhouse.io', name: 'Greenhouse', hasParser: true },
  { domain: 'lever.co', name: 'Lever', hasParser: true },
  { domain: 'workday.com', name: 'Workday', hasParser: true },
  { domain: 'myworkdayjobs.com', name: 'Workday', hasParser: true },
  { domain: 'icims.com', name: 'iCIMS', hasParser: false },
  { domain: 'smartrecruiters.com', name: 'SmartRecruiters', hasParser: false },
  { domain: 'jobvite.com', name: 'Jobvite', hasParser: false },
  { domain: 'ashbyhq.com', name: 'Ashby', hasParser: false },
  { domain: 'monster.com', name: 'Monster', hasParser: true },
  { domain: 'monsterindia.com', name: 'Monster India', hasParser: true },
  { domain: 'foundit.in', name: 'Foundit', hasParser: true },
  { domain: 'foundit.com', name: 'Foundit', hasParser: true },
  { domain: 'shine.com', name: 'Shine', hasParser: false },
  { domain: 'timesjobs.com', name: 'TimesJobs', hasParser: false },
  { domain: 'hirist.com', name: 'Hirist', hasParser: false },
  { domain: 'freshteam.com', name: 'Freshteam', hasParser: false },
  { domain: 'zohorecruit.com', name: 'Zoho Recruit', hasParser: false },
  { domain: 'cutshort.io', name: 'Cutshort', hasParser: false },
  { domain: 'taleo.net', name: 'Oracle Taleo', hasParser: false },
  { domain: 'successfactors.com', name: 'SAP SuccessFactors', hasParser: false },
  { domain: 'oraclecloud.com', name: 'Oracle Recruiting Cloud', hasParser: false },
  { domain: 'bamboohr.com', name: 'BambooHR', hasParser: false },
  { domain: 'workable.com', name: 'Workable', hasParser: false },
  { domain: 'teamtailor.com', name: 'Teamtailor', hasParser: false },
  { domain: 'jazzhr.com', name: 'JazzHR', hasParser: false },
  { domain: 'breezy.hr', name: 'Breezy HR', hasParser: false },
  { domain: 'recruitee.com', name: 'Recruitee', hasParser: false },
  { domain: 'avature.net', name: 'Avature', hasParser: false },
  { domain: 'brassring.com', name: 'IBM BrassRing', hasParser: false },
  { domain: 'kenexa.com', name: 'IBM Kenexa', hasParser: false },
  { domain: 'eightfold.ai', name: 'Eightfold AI', hasParser: false },
  { domain: 'phenompeople.com', name: 'Phenom', hasParser: false },
  { domain: 'pageuppeople.com', name: 'PageUp', hasParser: false },
  { domain: 'ukg.com', name: 'UKG Recruiting', hasParser: false },
  { domain: 'dayforce.com', name: 'Dayforce', hasParser: false },
  { domain: 'personio.com', name: 'Personio', hasParser: false },
  { domain: 'rippling.com', name: 'Rippling', hasParser: false },
  { domain: 'clearcompany.com', name: 'ClearCompany', hasParser: false },
  { domain: 'hireology.com', name: 'Hireology', hasParser: false },
  { domain: 'manatal.com', name: 'Manatal', hasParser: false },
  { domain: 'bullhorn.com', name: 'Bullhorn', hasParser: false },
  { domain: 'pinpointhq.com', name: 'Pinpoint', hasParser: false },
  { domain: 'recruitcrm.io', name: 'Recruit CRM', hasParser: false },
  { domain: 'apna.co', name: 'Apna', hasParser: false },
  { domain: 'instahyre.com', name: 'Instahyre', hasParser: false },
  { domain: 'hasjob.co', name: 'Hasjob', hasParser: false },
];

const getVendor = (senderDomain) => {
  if (!senderDomain) return null;
  const domain = senderDomain.toLowerCase();
  return VENDORS.find(v => domain.includes(v.domain)) || null;
};

module.exports = { getVendor, VENDORS };
