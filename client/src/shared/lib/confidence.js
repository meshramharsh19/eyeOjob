// Confidence is stored/served on a 0-100 scale everywhere in this app
// (DECIMAL(5,2) columns), never 0.0-1.0 — do not multiply by 100 here.
// mysql2 can return DECIMAL columns as strings (e.g. "100.00"), so parse first.
export const toConfidencePct = (confidence) => {
  if (confidence == null) return null;
  const rawVal = parseFloat(confidence);
  if (Number.isNaN(rawVal)) return 0;
  return Math.min(100, Math.max(0, Math.round(rawVal)));
};
