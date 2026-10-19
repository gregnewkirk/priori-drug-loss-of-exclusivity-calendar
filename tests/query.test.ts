import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryByCompany, queryByDrug } from '../src/loe/query.js';
import type { OBProduct, OBPatent, OrangeBookData } from '../src/loe/types.js';

const ASOF = '2026-01-01';

function prod(over: Partial<OBProduct>): OBProduct {
  return {
    ingredient: '', dfRoute: 'TABLET;ORAL', tradeName: '', applicant: '', strength: '',
    applType: 'N', applNo: '', productNo: '001', teCode: '', approvalDate: '',
    rld: 'Yes', rs: 'Yes', type: 'RX', applicantFullName: '', ...over,
  };
}
function pat(applNo: string, productNo: string, patentNo: string, date: string): OBPatent {
  return {
    applType: 'N', applNo, productNo, patentNo, patentExpireDateText: date,
    drugSubstanceFlag: true, drugProductFlag: false, patentUseCode: '', delistFlag: false, submissionDate: '',
  };
}

const data: OrangeBookData = {
  products: [
    prod({ ingredient: 'APIXABAN', tradeName: 'ELIQUIS', applicant: 'BRISTOL', applicantFullName: 'BRISTOL MYERS SQUIBB CO', applNo: '202155', productNo: '001', strength: '2.5MG' }),
    prod({ ingredient: 'APIXABAN', tradeName: 'ELIQUIS', applicant: 'BRISTOL', applicantFullName: 'BRISTOL MYERS SQUIBB CO', applNo: '202155', productNo: '002', strength: '5MG' }),
    prod({ ingredient: 'APIXABAN', tradeName: 'ELIQUIS', applicant: 'BRISTOL', applicantFullName: 'BRISTOL MYERS SQUIBB CO', applNo: '202155', productNo: '003', strength: '5MG-ALT' }),
    prod({ ingredient: 'NUSINERSEN', tradeName: 'SPINRAZA', applicant: 'BIOGEN', applicantFullName: 'BIOGEN INC', applNo: '125514', productNo: '001', strength: '12MG' }),
    prod({ ingredient: 'CELECOXIB', tradeName: 'CELEBREX', applicant: 'PFIZER', applicantFullName: 'PFIZER INC', applNo: '050733', productNo: '001', strength: '100MG' }),
  ],
  patents: [
    pat('202155', '001', 'P1', 'Feb 24, 2031'),
    pat('202155', '002', 'P2', 'Jun 1, 2028'),
    pat('202155', '003', 'P3', 'Feb 24, 2031'),
    pat('125514', '001', 'PB', 'Jan 1, 2029'),
    pat('050733', '001', 'PF', 'Jan 1, 2030'),
  ],
  exclusivity: [],
  sourceVersion: 'test',
  filesLoaded: ['products.txt', 'patent.txt', 'exclusivity.txt'],
};

test('company query matches one firm by token, not unrelated firms', () => {
  const cal = queryByCompany(data, 'bristol', ASOF);
  assert.equal(cal.disambiguation, false);
  assert.equal(cal.drugCount, 3); // only the 3 Bristol products
  assert.deepEqual(cal.matchedApplicants, ['BRISTOL MYERS SQUIBB CO']);
});

test('company cliffs dedup same-date strengths but preserve different-date cliffs', () => {
  const cal = queryByCompany(data, 'bristol', ASOF);
  // products 001 and 003 share 2031-02-24 (collapse), 002 is 2028-06-01 (kept).
  assert.equal(cal.cliffs.length, 2);
  assert.equal(cal.cliffs[0]!.latestListedProtection, '2028-06-01'); // nearest first
  assert.equal(cal.cliffs[1]!.latestListedProtection, '2031-02-24');
});

test('over-generic single-word queries return a disambiguation prompt, not a merge', () => {
  const inc = queryByCompany(data, 'inc', ASOF);
  assert.equal(inc.disambiguation, true);
  assert.equal(inc.drugCount, 0);
  assert.ok(inc.candidates.length >= 1);

  const bio = queryByCompany(data, 'bio', ASOF);
  assert.equal(bio.disambiguation, true); // must not silently merge Biogen etc.
});

test('token matching does not bleed across firms', () => {
  const pfizer = queryByCompany(data, 'pfizer', ASOF);
  assert.equal(pfizer.disambiguation, false);
  assert.deepEqual(pfizer.matchedApplicants, ['PFIZER INC']);

  const biogen = queryByCompany(data, 'biogen', ASOF);
  assert.deepEqual(biogen.matchedApplicants, ['BIOGEN INC']);
});

test('a whole-token match wins over prefix coincidences (nova -> Nova Labs, not Novartis)', () => {
  const nd: OrangeBookData = {
    products: [
      prod({ ingredient: 'DX', tradeName: 'DX', applicant: 'NOVA', applicantFullName: 'NOVA LABS INC', applNo: '700', productNo: '001' }),
      prod({ ingredient: 'DY', tradeName: 'DY', applicant: 'NOVARTIS', applicantFullName: 'NOVARTIS PHARMACEUTICALS CORP', applNo: '701', productNo: '001' }),
    ],
    patents: [],
    exclusivity: [],
    sourceVersion: 'test',
    filesLoaded: ['products.txt', 'patent.txt', 'exclusivity.txt'],
  };
  const nova = queryByCompany(nd, 'nova', ASOF);
  assert.equal(nova.disambiguation, false);
  assert.deepEqual(nova.matchedApplicants, ['NOVA LABS INC']); // Novartis (prefix-only) excluded
  const novart = queryByCompany(nd, 'novart', ASOF);
  assert.equal(novart.disambiguation, false);
  assert.deepEqual(novart.matchedApplicants, ['NOVARTIS PHARMACEUTICALS CORP']); // pure prefix, single firm
});

test('cliffs keep same-date products that differ on carve-out sensitivity', () => {
  const carveData: OrangeBookData = {
    products: [
      prod({ ingredient: 'DRUGX', tradeName: 'DRUGX', applicant: 'ACME', applicantFullName: 'ACME PHARMA', applNo: '900', productNo: '001' }),
      prod({ ingredient: 'DRUGX', tradeName: 'DRUGX', applicant: 'ACME', applicantFullName: 'ACME PHARMA', applNo: '900', productNo: '002' }),
    ],
    patents: [
      // 001: protection is a substance patent -> not carve-out-sensitive.
      pat('900', '001', 'S001', 'Jan 1, 2030'),
      // 002: same latest date (a use patent), but a substance patent lapses earlier.
      { applType: 'N', applNo: '900', productNo: '002', patentNo: 'S002', patentExpireDateText: 'Jan 1, 2027', drugSubstanceFlag: true, drugProductFlag: false, patentUseCode: '', delistFlag: false, submissionDate: '' },
      { applType: 'N', applNo: '900', productNo: '002', patentNo: 'U002', patentExpireDateText: 'Jan 1, 2030', drugSubstanceFlag: false, drugProductFlag: false, patentUseCode: 'U-9', delistFlag: false, submissionDate: '' },
    ],
    exclusivity: [],
    sourceVersion: 'test',
    filesLoaded: ['products.txt', 'patent.txt', 'exclusivity.txt'],
  };
  const cal = queryByCompany(carveData, 'acme', ASOF);
  // Same application, same 2030 date, but different earliest-generic-entry: keep both.
  assert.equal(cal.cliffs.length, 2);
  assert.ok(cal.cliffs.some((c) => c.carveOutSensitive === true));
  assert.ok(cal.cliffs.some((c) => c.carveOutSensitive === false));
});

test('drug query returns all matched products with computed protection', () => {
  const drugs = queryByDrug(data, 'apixaban', 100, ASOF);
  assert.equal(drugs.length, 3);
  assert.ok(drugs.every((d) => d.latestListedProtection !== null));
});
