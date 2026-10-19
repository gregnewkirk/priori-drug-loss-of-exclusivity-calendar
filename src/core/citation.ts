// Priori operational scaffold: every synthesized record carries its source,
// source version, record id, retrieval timestamp, and a disclaimer, so any
// downstream claim is auditable back to the primary record.

export interface Citation {
  source: string;
  sourceUrl: string;
  sourceVersion: string;
  recordId: string;
  retrievedAt: string; // ISO timestamp
  disclaimer: string;
}

export const LOE_DISCLAIMER =
  'Derived from the FDA Orange Book, a public FDA record. This is Priori-generated ' +
  'analysis, not the official FDA record and not a legal opinion. The computed ' +
  'loss-of-exclusivity date reflects the latest listed patent and exclusivity ' +
  'expirations only. It does not account for Paragraph IV challenges, section viii ' +
  'method-of-use carve-outs, ongoing patent litigation, or settlement agreements, ' +
  'any of which can move actual generic entry earlier. Verify against primary ' +
  'sources before relying on it.';

export function stampCitation<T extends object>(
  record: T,
  cite: Omit<Citation, 'disclaimer'>,
): T & { _citation: Citation } {
  return { ...record, _citation: { ...cite, disclaimer: LOE_DISCLAIMER } };
}
