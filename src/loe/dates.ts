// Orange Book expiry dates are free text like "Aug 24, 2026".

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

// Parse an Orange Book date into an ISO yyyy-mm-dd string, or null if unparseable.
export function parseObDate(text: string | undefined | null): string | null {
  if (!text) return null;
  const m = text.trim().match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[1]!];
  if (mon === undefined) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, mon, day));
  if (Number.isNaN(d.getTime())) return null;
  // Reject overflow dates such as "Feb 31, 2026" that JS silently rolls forward
  // to March, which would shift a protection date without any error.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mon || d.getUTCDate() !== day) {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

// Latest (max) of a set of ISO date strings, ignoring nulls. ISO strings sort lexically.
export function maxIsoDate(dates: (string | null)[]): string | null {
  const valid = dates.filter((d): d is string => d !== null).sort();
  return valid.length ? valid[valid.length - 1]! : null;
}

// Today as an ISO yyyy-mm-dd (UTC).
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
