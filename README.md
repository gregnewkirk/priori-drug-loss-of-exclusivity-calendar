# Priori Patent Intelligence: Drug Loss-of-Exclusivity (LOE) Calendar

Turn the FDA Orange Book into a drug **loss-of-exclusivity (LOE) calendar**.
Query any small-molecule drug or company and get every listed patent, the
exclusivity windows, and a computed "latest listed protection" date, so you can
see when a drug faces generic competition. Built on free, public FDA data, with
every field cited back to the source record.

Part of the **Priori Intelligence** family of biotech and patent data tools.

## What it does

Give it a drug name or a company name. It returns, per drug:

- Every Orange-Book-listed **patent** (number, expiry, whether it is a drug
  substance, drug product, or method-of-use patent, and whether a method-of-use
  patent may be carved out under section viii).
- Every FDA **exclusivity** (code, plain-English meaning, expiry).
- The **latest listed protection** date and the specific patent or exclusivity
  that controls it.
- A company **LOE calendar**: one cliff per drug, ordered by nearest upcoming
  loss of exclusivity.

## Why use it

Commercial patent-cliff intelligence (DrugPatentWatch, Cortellis, Patsnap) is
powerful but expensive and enterprise-gated. This tool gives you the core LOE
signal per query, pay-as-you-go, callable by your AI agent, at a fraction of the
price. It is built for biotech investors, patent attorneys and IP analysts,
generic and biosimilar strategists, and due-diligence teams who need the answer
on a handful of drugs, not an annual seat.

## Input

| Field | Type | Description |
|---|---|---|
| `mode` | string | `drug` (look up a drug by ingredient or brand) or `company` (roll up all of a company's drugs). Default `drug`. |
| `query` | string | The drug name (drug mode) or company/applicant name (company mode). Case-insensitive substring match. Required. |
| `maxResults` | integer | Cap on records returned in drug mode. Default 100. |

Example:

```json
{ "mode": "drug", "query": "apixaban" }
```

```json
{ "mode": "company", "query": "bristol myers squibb" }
```

## Output

Drug mode returns one record per matched product with its patents, exclusivities,
`latestListedProtection`, `controllingProtection`, and an `offPatent` flag.
Company mode returns a single calendar object with a deduped, date-ordered
`cliffs` array plus the full per-product `drugs` detail. Every record carries a
`_citation` block (source, source version, record id, retrieval timestamp,
disclaimer). Export as JSON, CSV, or Excel.

## Coverage and limitations

- **Small molecules only.** The Orange Book covers drugs approved under NDAs and
  ANDAs. Biologics (approved under BLAs) are not in the Orange Book; their
  exclusivity lives in the FDA Purple Book, which is planned as a companion tool.
- The computed date reflects the **latest listed patent and exclusivity
  expirations only**. It does not model Paragraph IV challenges, section viii
  method-of-use carve-outs, ongoing litigation, or settlement agreements, any of
  which can move actual generic entry earlier. Treat the output as a research
  starting point, not a legal opinion or a freedom-to-operate clearance.
- Source data is the FDA Orange Book monthly data files, refreshed monthly.

## Data source

FDA Orange Book data files (`https://www.fda.gov/drugs/drug-approvals-and-databases/orange-book-data-files`),
a public U.S. government record in the public domain. This tool downloads the
official monthly files, parses the `products`, `patent`, and `exclusivity`
tables, and computes the LOE analysis. It is not affiliated with or endorsed by
the FDA.

## Roadmap

- Purple Book (biologics and biosimilar exclusivity) companion coverage.
- Scheduled monitoring mode with alerts on LOE changes.
- Dataset schema and Store views for cleaner tabular output.
- Cross-links to the Priori Patent Intelligence global patent-family tool.

---

## Developer notes

TypeScript Apify Actor. Local development:

```bash
npm install
npm run build        # tsc -> dist/
npm test             # unit tests (node:test via tsx)
# local run: put input in storage/key_value_stores/default/INPUT.json
ACTOR_TEST_PAY_PER_EVENT=true npm run dev
```

Structure:

- `src/core/` portable Priori operational scaffold (conditional pay-per-event
  billing, source-citation stamping, completeness gate, monthly source cache).
  This is intended for extraction into a shared package when the second Priori
  Actor is built.
- `src/loe/` LOE-specific logic (Orange Book download and parse, the LOE
  computation, and drug/company queries).
- `src/main.ts` Actor entry point.

Pay-per-event: custom events are charged only after a valid result is stored, so
failed, empty, or incomplete runs charge nothing for `drug-loe-record` or
`company-loe-calendar`. Configure the event prices in the Apify Console before
publishing.
