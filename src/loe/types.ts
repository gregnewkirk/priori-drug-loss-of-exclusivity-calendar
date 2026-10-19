// Data model for the FDA Orange Book (small-molecule drug products, patents,
// and exclusivity) and the loss-of-exclusivity (LOE) analysis Priori derives.

export interface OBProduct {
  ingredient: string;
  dfRoute: string; // "DF;Route", e.g. "TABLET;ORAL"
  tradeName: string;
  applicant: string; // condensed <=20 char applicant string
  strength: string;
  applType: string; // N (NDA) | A (ANDA)
  applNo: string;
  productNo: string;
  teCode: string;
  approvalDate: string; // raw text
  rld: string; // Reference Listed Drug: Yes/No
  rs: string; // Reference Standard: Yes/No
  type: string; // RX | OTC | DISCN
  applicantFullName: string;
}

export interface OBPatent {
  applType: string;
  applNo: string;
  productNo: string;
  patentNo: string;
  patentExpireDateText: string; // raw "Aug 24, 2026"
  drugSubstanceFlag: boolean;
  drugProductFlag: boolean;
  patentUseCode: string; // e.g. "U-141" (method-of-use)
  delistFlag: boolean;
  submissionDate: string;
}

export interface OBExclusivity {
  applType: string;
  applNo: string;
  productNo: string;
  exclusivityCode: string; // e.g. "NCE", "ODE", "PED"
  exclusivityDate: string; // raw text
}

export interface OrangeBookData {
  products: OBProduct[];
  patents: OBPatent[];
  exclusivity: OBExclusivity[];
  sourceVersion: string; // e.g. "Orange Book EOBZIP_2026_05.zip"
  filesLoaded: string[];
}

export type ProtectionKind = 'patent' | 'exclusivity';

export interface ProtectionItem {
  kind: ProtectionKind;
  code: string; // patent number or exclusivity code
  expiry: string | null; // ISO yyyy-mm-dd
  expiryText: string; // raw source text
  detail: string; // human-readable description
  carveOutable: boolean; // method-of-use patents may be carved out under section viii
  delisted: boolean; // patent flagged for delisting (excluded from LOE math, kept for transparency)
  pediatricExtension: boolean; // Orange Book "*PED" row: pediatric-exclusivity extension of a base patent
  basePatentNo?: string; // for a "*PED" row, the base patent it extends
}

export interface DrugLoe {
  ingredient: string;
  tradeName: string;
  applicant: string;
  applicantFullName: string;
  applType: string;
  applNo: string;
  productNo: string;
  strength: string;
  dosageFormRoute: string;
  marketingStatus: string;
  patents: ProtectionItem[]; // includes delisted patents, flagged; excluded from the maxima
  exclusivities: ProtectionItem[];
  latestPatentExpiry: string | null; // over non-delisted patents
  latestExclusivityExpiry: string | null;
  latestListedProtection: string | null; // conservative "fully clear" date: max of all non-delisted patents + exclusivity
  controllingProtection: ProtectionItem | null; // the (first) protection whose expiry equals latestListedProtection
  controllingProtections: ProtectionItem[]; // all protections tied at latestListedProtection
  earliestGenericEntry: string | null; // max of BLOCKING protections only (excludes carve-outable method-of-use patents)
  earliestGenericEntryBasis: ProtectionItem | null;
  carveOutSensitive: boolean; // true when a carve-outable use patent extends protection beyond earliestGenericEntry
  offPatent: boolean; // latestListedProtection is null or already past
}

export interface Cliff {
  tradeName: string;
  ingredient: string;
  applType: string;
  applNo: string;
  productNo: string;
  strength: string;
  latestListedProtection: string | null;
  earliestGenericEntry: string | null;
  carveOutSensitive: boolean;
  controllingProtection: ProtectionItem | null;
}

export interface CompanyLoeCalendar {
  company: string;
  matchedApplicants: string[];
  drugCount: number;
  cliffs: Cliff[]; // nearest upcoming loss-of-exclusivity first
  drugs: DrugLoe[];
  disambiguation: boolean; // true when the query was too broad to answer safely
  candidates: { applicant: string; productCount: number }[]; // suggestions when disambiguation is true
  truncated: boolean; // true when drugs/cliffs were capped for item size
}
