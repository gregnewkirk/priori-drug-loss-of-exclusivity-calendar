import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProducts, parsePatents, parseExclusivity } from '../src/loe/orangebook.js';

const productsHeader =
  'Ingredient~DF;Route~Trade_Name~Applicant~Strength~Appl_Type~Appl_No~Product_No~TE_Code~Approval_Date~RLD~RS~Type~Applicant_Full_Name';
const patentsHeader =
  'Appl_Type~Appl_No~Product_No~Patent_No~Patent_Expire_Date_Text~Drug_Substance_Flag~Drug_Product_Flag~Patent_Use_Code~Delist_Flag~Submission_Date';
const exclusivityHeader = 'Appl_Type~Appl_No~Product_No~Exclusivity_Code~Exclusivity_Date';

const productsTxt = [
  productsHeader,
  'APIXABAN~TABLET;ORAL~ELIQUIS~BRISTOL~EQ 2.5MG BASE~N~202155~001~~Dec 28, 2012~Yes~Yes~RX~BRISTOL MYERS SQUIBB CO',
].join('\r\n');

const patentsTxt = [
  patentsHeader,
  'N~202155~001~6967208~Dec 26, 2026~Y~~~~',
  'N~202155~001~9326945~Feb 24, 2031~~~U-1234~~',
].join('\n');

const exclusivityTxt = [exclusivityHeader, 'N~202155~001~NCE~Dec 28, 2017'].join('\n');

test('parseProducts maps all product fields', () => {
  const rows = parseProducts(productsTxt);
  assert.equal(rows.length, 1);
  const p = rows[0]!;
  assert.equal(p.ingredient, 'APIXABAN');
  assert.equal(p.dfRoute, 'TABLET;ORAL');
  assert.equal(p.tradeName, 'ELIQUIS');
  assert.equal(p.applType, 'N');
  assert.equal(p.applNo, '202155');
  assert.equal(p.productNo, '001');
  assert.equal(p.type, 'RX');
  assert.equal(p.applicantFullName, 'BRISTOL MYERS SQUIBB CO');
});

test('parsePatents maps flags and use codes', () => {
  const rows = parsePatents(patentsTxt);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.patentNo, '6967208');
  assert.equal(rows[0]!.drugSubstanceFlag, true);
  assert.equal(rows[0]!.drugProductFlag, false);
  assert.equal(rows[0]!.delistFlag, false);
  assert.equal(rows[1]!.patentUseCode, 'U-1234');
});

test('parseExclusivity maps code and date', () => {
  const rows = parseExclusivity(exclusivityTxt);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.exclusivityCode, 'NCE');
  assert.equal(rows[0]!.exclusivityDate, 'Dec 28, 2017');
});

test('parser fails closed on header schema drift (column reorder/rename)', () => {
  const drifted = [
    'Appl_Type~Appl_No~Product_No~Patent_No~Drug_Substance_Flag~Patent_Expire_Date_Text~Drug_Product_Flag~Patent_Use_Code~Delist_Flag~Submission_Date',
    'N~202155~001~6967208~Y~Dec 26, 2026~~~~',
  ].join('\n');
  assert.throws(() => parsePatents(drifted), /schema drift/i);
});
