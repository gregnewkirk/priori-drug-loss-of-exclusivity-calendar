import { parseObDate, maxIsoDate, todayIso } from './dates.js';
import { describeExclusivity } from './exclusivityCodes.js';
import type {
  OBProduct,
  OBPatent,
  OBExclusivity,
  ProtectionItem,
  DrugLoe,
} from './types.js';

interface Keyed {
  applType: string;
  applNo: string;
  productNo: string;
}

export function keyOf(r: Keyed): string {
  return `${r.applType}~${r.applNo}~${r.productNo}`;
}

export function indexByKey<T extends Keyed>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyOf(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function patentDetail(p: OBPatent): string {
  const parts: string[] = [];
  if (p.drugSubstanceFlag) parts.push('drug substance');
  if (p.drugProductFlag) parts.push('drug product');
  if (p.patentUseCode) parts.push(`method of use ${p.patentUseCode}`);
  if (parts.length === 0) parts.push('listed patent');
  return parts.join(', ');
}

// Orange Book pediatric rows carry the base patent number suffixed with "*PED"
// and represent the 6-month pediatric-exclusivity extension of that patent.
function pediatricBase(patentNo: string): string | null {
  const m = patentNo.match(/^(.*?)\*PED$/i);
  return m ? m[1]!.trim() : null;
}

function patentToProtection(p: OBPatent): ProtectionItem {
  const base = pediatricBase(p.patentNo);
  const isPed = base !== null;
  const carveOutable = !p.drugSubstanceFlag && !p.drugProductFlag && p.patentUseCode.length > 0;
  const detail = isPed ? `pediatric-exclusivity extension of patent ${base}` : patentDetail(p);
  const item: ProtectionItem = {
    kind: 'patent',
    code: p.patentNo,
    expiry: parseObDate(p.patentExpireDateText),
    expiryText: p.patentExpireDateText,
    detail,
    carveOutable,
    delisted: p.delistFlag,
    pediatricExtension: isPed,
  };
  if (base) item.basePatentNo = base;
  return item;
}

function exclusivityToProtection(e: OBExclusivity): ProtectionItem {
  return {
    kind: 'exclusivity',
    code: e.exclusivityCode,
    expiry: parseObDate(e.exclusivityDate),
    expiryText: e.exclusivityDate,
    detail: describeExclusivity(e.exclusivityCode),
    carveOutable: false,
    delisted: false,
    pediatricExtension: /ped/i.test(e.exclusivityCode),
  };
}

// Compute the loss-of-exclusivity picture for one product row given the patents
// and exclusivities that share its application/product key. Pure and testable.
//
// Two dates are reported and they can differ:
//   latestListedProtection  = the conservative "fully clear" date: the last of
//                             all non-delisted patents and exclusivities to lapse.
//   earliestGenericEntry    = the last of only the BLOCKING protections to lapse,
//                             excluding carve-outable method-of-use patents, since
//                             a generic may carve out the protected use (section
//                             viii) and enter for other indications sooner.
// Delisted patents are surfaced in `patents` (flagged) but excluded from both.
export function computeDrugLoe(
  product: OBProduct,
  patents: OBPatent[],
  exclusivities: OBExclusivity[],
  asOf: string = todayIso(),
): DrugLoe {
  const patentItems = patents.map(patentToProtection); // includes delisted, flagged
  const exclusivityItems = exclusivities.map(exclusivityToProtection);

  // Pediatric-extension ("*PED") rows carry blank flags. Inherit the base
  // patent's carve-out status so a pediatric extension of a carve-outable
  // method-of-use patent is not wrongly treated as blocking generic entry.
  const baseCarveOut = new Map<string, boolean>();
  for (const it of patentItems) {
    if (!it.pediatricExtension) baseCarveOut.set(it.code, it.carveOutable);
  }
  for (const it of patentItems) {
    if (it.pediatricExtension && it.basePatentNo !== undefined) {
      const inherited = baseCarveOut.get(it.basePatentNo);
      if (inherited !== undefined) it.carveOutable = inherited;
    }
  }

  const activePatentItems = patentItems.filter((p) => !p.delisted);

  const latestPatentExpiry = maxIsoDate(activePatentItems.map((p) => p.expiry));
  const latestExclusivityExpiry = maxIsoDate(exclusivityItems.map((e) => e.expiry));
  const latestListedProtection = maxIsoDate([latestPatentExpiry, latestExclusivityExpiry]);

  const blocking = [
    ...activePatentItems.filter((p) => !p.carveOutable),
    ...exclusivityItems,
  ];
  const earliestGenericEntry = maxIsoDate(blocking.map((it) => it.expiry));

  const allActive = [...activePatentItems, ...exclusivityItems];
  const controllingProtections = latestListedProtection
    ? allActive.filter((it) => it.expiry === latestListedProtection)
    : [];
  const controllingProtection = controllingProtections[0] ?? null;
  const earliestGenericEntryBasis = earliestGenericEntry
    ? (blocking.find((it) => it.expiry === earliestGenericEntry) ?? null)
    : null;

  // Sensitive when a carve-outable use patent (or nothing but use patents) pushes
  // the "fully clear" date past the earliest a generic could plausibly enter.
  const carveOutSensitive =
    latestListedProtection !== null && earliestGenericEntry !== latestListedProtection;

  const offPatent = latestListedProtection === null || latestListedProtection < asOf;

  return {
    ingredient: product.ingredient,
    tradeName: product.tradeName,
    applicant: product.applicant,
    applicantFullName: product.applicantFullName,
    applType: product.applType,
    applNo: product.applNo,
    productNo: product.productNo,
    strength: product.strength,
    dosageFormRoute: product.dfRoute,
    marketingStatus: product.type,
    patents: patentItems,
    exclusivities: exclusivityItems,
    latestPatentExpiry,
    latestExclusivityExpiry,
    latestListedProtection,
    controllingProtection,
    controllingProtections,
    earliestGenericEntry,
    earliestGenericEntryBasis,
    carveOutSensitive,
    offPatent,
  };
}

// Build DrugLoe rows for a set of products against pre-built indexes.
export function computeForProducts(
  products: OBProduct[],
  patentIdx: Map<string, OBPatent[]>,
  exclIdx: Map<string, OBExclusivity[]>,
  asOf: string = todayIso(),
): DrugLoe[] {
  return products.map((p) =>
    computeDrugLoe(p, patentIdx.get(keyOf(p)) ?? [], exclIdx.get(keyOf(p)) ?? [], asOf),
  );
}
