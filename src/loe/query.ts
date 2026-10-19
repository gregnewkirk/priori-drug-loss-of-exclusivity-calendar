import { computeForProducts, indexByKey, computeDrugLoe, keyOf } from './compute.js';
import { todayIso } from './dates.js';
import type {
  OrangeBookData,
  OBProduct,
  DrugLoe,
  CompanyLoeCalendar,
  Cliff,
} from './types.js';

// Over-broad single-word company queries that would merge unrelated firms.
const STOPWORDS = new Set([
  'inc', 'llc', 'ltd', 'corp', 'co', 'company', 'pharma', 'pharms', 'pharm',
  'pharmaceutical', 'pharmaceuticals', 'labs', 'laboratories', 'lab', 'bio',
  'usa', 'us', 'group', 'holding', 'holdings', 'international', 'intl',
  'sciences', 'science', 'therapeutics', 'health', 'healthcare', 'medical',
  'gmbh', 'ag', 'sa', 'plc', 'llp', 'the',
]);

const MIN_SINGLE_WORD = 3; // single-word queries shorter than this are too broad
const MAX_DISTINCT_APPLICANTS = 30; // beyond this, ask the user to disambiguate
const MAX_DRUGS_IN_ITEM = 1500; // cap the drugs array for dataset-item size
const MAX_CLIFFS_IN_ITEM = 750;
const CANDIDATE_LIMIT = 40;

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function tokenize(s: string): string[] {
  return norm(s).split(/[^a-z0-9]+/).filter(Boolean);
}

function tokensOf(p: OBProduct): string[] {
  return [...tokenize(p.applicantFullName), ...tokenize(p.applicant)];
}

// Drug mode: match products by ingredient or trade name (case-insensitive substring).
export function queryByDrug(
  data: OrangeBookData,
  query: string,
  maxResults: number,
  asOf: string = todayIso(),
): DrugLoe[] {
  const q = norm(query);
  const patentIdx = indexByKey(data.patents);
  const exclIdx = indexByKey(data.exclusivity);
  const matched = data.products.filter(
    (p) => norm(p.ingredient).includes(q) || norm(p.tradeName).includes(q),
  );
  const results = computeForProducts(matched, patentIdx, exclIdx, asOf);
  results.sort((a, b) => (b.latestListedProtection ?? '').localeCompare(a.latestListedProtection ?? ''));
  return results.slice(0, maxResults);
}

function candidatesFrom(matched: OBProduct[]): { applicant: string; productCount: number }[] {
  const counts = new Map<string, number>();
  for (const p of matched) {
    const name = p.applicantFullName || p.applicant;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([applicant, productCount]) => ({ applicant, productCount }))
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, CANDIDATE_LIMIT);
}

function disambiguation(query: string, matched: OBProduct[]): CompanyLoeCalendar {
  const matchedApplicants = [...new Set(matched.map((p) => p.applicantFullName || p.applicant))].sort();
  return {
    company: query,
    matchedApplicants: matchedApplicants.slice(0, CANDIDATE_LIMIT),
    drugCount: 0,
    cliffs: [],
    drugs: [],
    disambiguation: true,
    candidates: candidatesFrom(matched),
    truncated: false,
  };
}

// Resolve a company query to the set of products for ONE company, or return a
// disambiguation prompt. Rules:
//   multi-word  -> substring match (specific enough).
//   single word -> too short or a stopword ("inc"/"pharma") disambiguates.
//                  A whole-token match ("bristol", "nova") is specific: use only
//                  those products and ignore prefix coincidences (so "nova" does
//                  not pull in NOVARTIS). A pure-prefix query ("novart") must
//                  resolve to exactly one applicant, else it disambiguates.
function resolveCompany(data: OrangeBookData, nq: string): OBProduct[] | { disambiguate: OBProduct[] } {
  if (!nq.includes(' ')) {
    if (nq.length < MIN_SINGLE_WORD || STOPWORDS.has(nq)) {
      return { disambiguate: data.products.filter((p) => tokensOf(p).some((t) => t === nq || t.startsWith(nq))) };
    }
    const exact = data.products.filter((p) => tokensOf(p).includes(nq));
    if (exact.length > 0) return exact;
    const prefix = data.products.filter((p) => tokensOf(p).some((t) => t.startsWith(nq)));
    const distinct = new Set(prefix.map((p) => p.applicantFullName || p.applicant));
    if (distinct.size !== 1) return { disambiguate: prefix };
    return prefix;
  }
  return data.products.filter(
    (p) => norm(p.applicantFullName).includes(nq) || norm(p.applicant).includes(nq),
  );
}

// Company mode: roll a single company's products up to a per-drug LOE calendar
// ordered by nearest upcoming loss of exclusivity, or return a disambiguation
// prompt when the query is too broad. Output is capped for dataset-item size.
export function queryByCompany(
  data: OrangeBookData,
  query: string,
  asOf: string = todayIso(),
): CompanyLoeCalendar {
  const nq = norm(query);
  if (nq.length < 2) return disambiguation(query, []);

  const resolved = resolveCompany(data, nq);
  if (!Array.isArray(resolved)) return disambiguation(query, resolved.disambiguate);
  const matched = resolved;

  const matchedApplicants = [...new Set(matched.map((p) => p.applicantFullName || p.applicant))];
  if (matchedApplicants.length > MAX_DISTINCT_APPLICANTS) return disambiguation(query, matched);

  const patentIdx = indexByKey(data.patents);
  const exclIdx = indexByKey(data.exclusivity);
  const drugs = matched.map((p) =>
    computeDrugLoe(p, patentIdx.get(keyOf(p)) ?? [], exclIdx.get(keyOf(p)) ?? [], asOf),
  );

  // Product-level cliffs, deduped by (application, protection date, earliest
  // generic entry) so same-date strengths collapse while genuinely different
  // cliffs (different dates, or different carve-out sensitivity) are preserved.
  const seen = new Set<string>();
  const cliffs: Cliff[] = [];
  for (const d of drugs) {
    if (d.latestListedProtection === null || d.offPatent) continue;
    const cliffKey = `${d.applType}~${d.applNo}~${d.latestListedProtection}~${d.earliestGenericEntry ?? ''}`;
    if (seen.has(cliffKey)) continue;
    seen.add(cliffKey);
    cliffs.push({
      tradeName: d.tradeName,
      ingredient: d.ingredient,
      applType: d.applType,
      applNo: d.applNo,
      productNo: d.productNo,
      strength: d.strength,
      latestListedProtection: d.latestListedProtection,
      earliestGenericEntry: d.earliestGenericEntry,
      carveOutSensitive: d.carveOutSensitive,
      controllingProtection: d.controllingProtection,
    });
  }
  cliffs.sort((a, b) => (a.latestListedProtection ?? '').localeCompare(b.latestListedProtection ?? ''));

  const truncated = drugs.length > MAX_DRUGS_IN_ITEM || cliffs.length > MAX_CLIFFS_IN_ITEM;

  return {
    company: query,
    matchedApplicants: [...matchedApplicants].sort(),
    drugCount: drugs.length,
    cliffs: cliffs.slice(0, MAX_CLIFFS_IN_ITEM),
    drugs: drugs.slice(0, MAX_DRUGS_IN_ITEM),
    disambiguation: false,
    candidates: [],
    truncated,
  };
}
