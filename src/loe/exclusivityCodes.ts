// Human-readable descriptions for the most common FDA Orange Book exclusivity
// codes. This is not exhaustive; unknown codes fall back to the raw code plus a
// prefix-based hint. Descriptions are informational, not legal definitions.

const EXACT: Record<string, string> = {
  NCE: 'New Chemical Entity exclusivity (5 years)',
  NP: 'New Product exclusivity (3 years)',
  NDF: 'New Dosage Form exclusivity (3 years)',
  NS: 'New Strength exclusivity (3 years)',
  NC: 'New Combination exclusivity (3 years)',
  NE: 'New Ester / new salt exclusivity (3 years)',
  NR: 'New Route of administration exclusivity (3 years)',
  NPP: 'New Patient Population exclusivity (3 years)',
  ODE: 'Orphan Drug Exclusivity (7 years)',
  GAIN: 'Generating Antibiotic Incentives Now exclusivity (+5 years)',
  RTO: 'Reference-listed drug transfer / other exclusivity',
  PED: 'Pediatric exclusivity (adds 6 months to the referenced protection)',
  PC: 'Patent Challenge (180-day generic exclusivity)',
  M: 'Other exclusivity (miscellaneous)',
  I: 'New Indication exclusivity (3 years)',
  D: 'Other exclusivity (see FDA code list)',
};

export function describeExclusivity(code: string): string {
  const c = code.trim().toUpperCase();
  if (EXACT[c]) return EXACT[c]!;
  // Pediatric add-on codes are often the base code suffixed with "*PED".
  if (c.includes('PED')) return `Pediatric exclusivity add-on (${code})`;
  if (c.startsWith('ODE')) return `Orphan Drug Exclusivity (${code})`;
  if (c.startsWith('NCE')) return `New Chemical Entity exclusivity (${code})`;
  if (c.startsWith('D-') || c.startsWith('I-') || c.startsWith('M-')) {
    return `FDA exclusivity code ${code} (see FDA exclusivity code definitions)`;
  }
  return `FDA exclusivity code ${code}`;
}
