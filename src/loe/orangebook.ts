import { unzipSync, strFromU8 } from 'fflate';
import { getCachedOrDownload } from '../core/cache.js';
import type { OBProduct, OBPatent, OBExclusivity, OrangeBookData } from './types.js';

// Stable FDA redirect to the current monthly Orange Book data files ZIP (EOBZIP).
export const EOB_URL = 'https://www.fda.gov/media/76860/download';

const PRODUCTS_HEADER =
  'Ingredient~DF;Route~Trade_Name~Applicant~Strength~Appl_Type~Appl_No~Product_No~TE_Code~Approval_Date~RLD~RS~Type~Applicant_Full_Name';
const PATENTS_HEADER =
  'Appl_Type~Appl_No~Product_No~Patent_No~Patent_Expire_Date_Text~Drug_Substance_Flag~Drug_Product_Flag~Patent_Use_Code~Delist_Flag~Submission_Date';
const EXCLUSIVITY_HEADER = 'Appl_Type~Appl_No~Product_No~Exclusivity_Code~Exclusivity_Date';

// Fail closed on schema drift: the header must match exactly (catches column
// reorders/additions that would otherwise misalign fields), and if more than 1%
// of rows have an unexpected column count we refuse to parse rather than emit
// silently misaligned data. A handful of anomalous rows are dropped with a count.
function dataRows(text: string, expectedHeader: string, fileLabel: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  const header = (lines[0] ?? '').trim();
  if (header !== expectedHeader) {
    throw new Error(
      `Orange Book schema drift in ${fileLabel}: unexpected header.\n  expected: ${expectedHeader}\n  found:    ${header}\nRefusing to parse to avoid misaligned data.`,
    );
  }
  const expectedCols = expectedHeader.split('~').length;
  const rows: string[][] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split('~');
    if (cols.length === expectedCols) rows.push(cols);
    else skipped++;
  }
  const total = rows.length + skipped;
  if (total > 0 && skipped / total > 0.01) {
    throw new Error(
      `Orange Book schema drift in ${fileLabel}: ${skipped}/${total} rows had an unexpected column count (>1%). Refusing to parse.`,
    );
  }
  if (skipped > 0) {
    // Rare anomalies tolerated; surfaced for observability.
    // eslint-disable-next-line no-console
    console.warn(`Orange Book ${fileLabel}: skipped ${skipped} malformed row(s).`);
  }
  return rows;
}

const yes = (v: string | undefined): boolean => (v ?? '').trim().toUpperCase() === 'Y';

export function parseProducts(text: string): OBProduct[] {
  return dataRows(text, PRODUCTS_HEADER, 'products.txt').map((c) => ({
    ingredient: (c[0] ?? '').trim(),
    dfRoute: (c[1] ?? '').trim(),
    tradeName: (c[2] ?? '').trim(),
    applicant: (c[3] ?? '').trim(),
    strength: (c[4] ?? '').trim(),
    applType: (c[5] ?? '').trim(),
    applNo: (c[6] ?? '').trim(),
    productNo: (c[7] ?? '').trim(),
    teCode: (c[8] ?? '').trim(),
    approvalDate: (c[9] ?? '').trim(),
    rld: (c[10] ?? '').trim(),
    rs: (c[11] ?? '').trim(),
    type: (c[12] ?? '').trim(),
    applicantFullName: (c[13] ?? '').trim(),
  }));
}

export function parsePatents(text: string): OBPatent[] {
  return dataRows(text, PATENTS_HEADER, 'patent.txt').map((c) => ({
    applType: (c[0] ?? '').trim(),
    applNo: (c[1] ?? '').trim(),
    productNo: (c[2] ?? '').trim(),
    patentNo: (c[3] ?? '').trim(),
    patentExpireDateText: (c[4] ?? '').trim(),
    drugSubstanceFlag: yes(c[5]),
    drugProductFlag: yes(c[6]),
    patentUseCode: (c[7] ?? '').trim(),
    delistFlag: yes(c[8]),
    submissionDate: (c[9] ?? '').trim(),
  }));
}

export function parseExclusivity(text: string): OBExclusivity[] {
  return dataRows(text, EXCLUSIVITY_HEADER, 'exclusivity.txt').map((c) => ({
    applType: (c[0] ?? '').trim(),
    applNo: (c[1] ?? '').trim(),
    productNo: (c[2] ?? '').trim(),
    exclusivityCode: (c[3] ?? '').trim(),
    exclusivityDate: (c[4] ?? '').trim(),
  }));
}

function fileFromZip(files: Record<string, Uint8Array>, endsWith: string): string {
  const key = Object.keys(files).find((k) => k.toLowerCase().endsWith(endsWith));
  if (!key) throw new Error(`Orange Book ZIP is missing ${endsWith}`);
  return strFromU8(files[key]!);
}

// Download (or reuse the revalidated cache), unzip, and parse all three files.
export async function loadOrangeBook(): Promise<OrangeBookData> {
  const { bytes, sourceVersion } = await getCachedOrDownload(EOB_URL);
  const files = unzipSync(bytes);
  const products = parseProducts(fileFromZip(files, 'products.txt'));
  const patents = parsePatents(fileFromZip(files, 'patent.txt'));
  const exclusivity = parseExclusivity(fileFromZip(files, 'exclusivity.txt'));
  return {
    products,
    patents,
    exclusivity,
    sourceVersion,
    filesLoaded: ['products.txt', 'patent.txt', 'exclusivity.txt'],
  };
}
