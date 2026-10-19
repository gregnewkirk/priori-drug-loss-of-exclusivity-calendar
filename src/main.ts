import { Actor, log } from 'apify';
import { loadOrangeBook, EOB_URL } from './loe/orangebook.js';
import { queryByDrug, queryByCompany } from './loe/query.js';
import { stampCitation } from './core/citation.js';
import { assessCompleteness } from './core/completeness.js';
import { chargeForResult, EVENTS } from './core/billing.js';
import { todayIso } from './loe/dates.js';

interface Input {
  mode?: 'drug' | 'company';
  query?: string;
  maxResults?: number;
}

const EXPECTED_FILES = ['products.txt', 'patent.txt', 'exclusivity.txt'];
const MAX_ITEM_BYTES = 8_000_000; // stay safely under Apify's dataset-item limit

// Ensure a company record fits in one dataset item BEFORE we charge for it, so a
// successful charge is never followed by an oversized-item write failure.
function fitCompanyItem<T extends { drugs: unknown[]; truncated: boolean }>(record: T): T {
  if (JSON.stringify(record).length <= MAX_ITEM_BYTES) return record;
  const drugs = record.drugs;
  let keep = drugs.length;
  let out: T = { ...record, drugs: drugs.slice(0, keep), truncated: true };
  while (keep > 0 && JSON.stringify(out).length > MAX_ITEM_BYTES) {
    keep = Math.floor(keep * 0.8);
    out = { ...record, drugs: drugs.slice(0, keep), truncated: true };
  }
  log.warning(`Company item exceeded ${MAX_ITEM_BYTES} bytes; trimmed drugs to ${keep} (cliffs retained).`);
  return out;
}

async function run(): Promise<void> {
  const input = (await Actor.getInput<Input>()) ?? {};
  const mode = input.mode === 'company' ? 'company' : 'drug';
  const query = (input.query ?? '').trim();
  const maxResults = Math.min(Math.max(input.maxResults ?? 100, 1), 5000);

  if (!query) {
    throw new Error('Input "query" is required (a drug name in drug mode, or a company name in company mode).');
  }

  const data = await loadOrangeBook();
  const completeness = assessCompleteness(EXPECTED_FILES, data.filesLoaded);
  const retrievedAt = new Date().toISOString();
  const asOf = todayIso();

  const citeBase = {
    source: 'FDA Orange Book',
    sourceUrl: EOB_URL,
    sourceVersion: data.sourceVersion,
    retrievedAt,
  };

  if (mode === 'drug') {
    const results = queryByDrug(data, query, maxResults, asOf);
    log.info(`Drug mode: "${query}" matched ${results.length} product record(s).`);
    for (const drug of results) {
      // Charge first; deliver only what was actually charged; stop after the
      // charge that reaches the spend limit (still delivering that record).
      const { charged, stop } = await chargeForResult(EVENTS.DRUG_LOE_RECORD);
      if (charged) {
        await Actor.pushData(
          stampCitation(drug, { ...citeBase, recordId: `${drug.applType}${drug.applNo}-${drug.productNo}` }),
        );
      }
      if (stop) break;
    }
  } else {
    const calendar = queryByCompany(data, query, asOf);
    log.info(
      `Company mode: "${query}" matched ${calendar.drugCount} product record(s) across ${calendar.matchedApplicants.length} applicant name(s)${calendar.disambiguation ? ' [disambiguation]' : ''}.`,
    );
    const record = stampCitation(
      { ...calendar, completeness },
      { ...citeBase, recordId: `company:${query}` },
    );

    // Bill only a real, complete, non-empty, unambiguous synthesis. Everything
    // else (empty match, incomplete inputs, disambiguation) is returned for free.
    const billable =
      completeness.complete && calendar.drugCount > 0 && !calendar.disambiguation;

    if (billable) {
      const fitted = fitCompanyItem(record); // size-guard before charging
      const { charged } = await chargeForResult(EVENTS.COMPANY_LOE_CALENDAR);
      if (!charged) {
        log.warning('Company calendar not charged (spend limit or error); not delivered.');
        return;
      }
      await Actor.pushData(fitted);
    } else {
      await Actor.pushData(record);
      log.warning('Company result returned without charge (empty, incomplete, or disambiguation).');
    }
  }
}

await Actor.init();
try {
  await run();
} catch (err) {
  log.exception(err as Error, 'Run failed');
  await Actor.fail(`Run failed: ${(err as Error).message}`);
  process.exit(1);
}
await Actor.exit();
