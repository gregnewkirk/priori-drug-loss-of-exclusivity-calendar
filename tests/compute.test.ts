import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDrugLoe } from '../src/loe/compute.js';
import type { OBProduct, OBPatent, OBExclusivity } from '../src/loe/types.js';

const product: OBProduct = {
  ingredient: 'APIXABAN',
  dfRoute: 'TABLET;ORAL',
  tradeName: 'ELIQUIS',
  applicant: 'BRISTOL',
  strength: 'EQ 2.5MG BASE',
  applType: 'N',
  applNo: '202155',
  productNo: '001',
  teCode: '',
  approvalDate: 'Dec 28, 2012',
  rld: 'Yes',
  rs: 'Yes',
  type: 'RX',
  applicantFullName: 'BRISTOL MYERS SQUIBB CO',
};

function patent(over: Partial<OBPatent>): OBPatent {
  return {
    applType: 'N', applNo: '202155', productNo: '001', patentNo: '0',
    patentExpireDateText: '', drugSubstanceFlag: false, drugProductFlag: false,
    patentUseCode: '', delistFlag: false, submissionDate: '', ...over,
  };
}

const patents: OBPatent[] = [
  patent({ patentNo: '6967208', patentExpireDateText: 'Dec 26, 2026', drugSubstanceFlag: true }),
  patent({ patentNo: '9326945', patentExpireDateText: 'Feb 24, 2031', patentUseCode: 'U-1234' }),
  patent({ patentNo: '0000000', patentExpireDateText: 'Jan 1, 2099', delistFlag: true }),
];

const exclusivity: OBExclusivity[] = [
  { applType: 'N', applNo: '202155', productNo: '001', exclusivityCode: 'NCE', exclusivityDate: 'Dec 28, 2017' },
];

test('delisted patents are kept in output (flagged) but excluded from the maxima', () => {
  const loe = computeDrugLoe(product, patents, exclusivity, '2026-01-01');
  assert.equal(loe.patents.length, 3);
  const delisted = loe.patents.find((p) => p.code === '0000000');
  assert.equal(delisted?.delisted, true);
  assert.equal(loe.latestPatentExpiry, '2031-02-24'); // NOT 2099
  assert.equal(loe.latestListedProtection, '2031-02-24');
});

test('picks latest listed protection and its controller', () => {
  const loe = computeDrugLoe(product, patents, exclusivity, '2026-01-01');
  assert.equal(loe.latestListedProtection, '2031-02-24');
  assert.equal(loe.controllingProtection?.code, '9326945');
});

test('earliest generic entry excludes carve-outable method-of-use patents', () => {
  const loe = computeDrugLoe(product, patents, exclusivity, '2026-01-01');
  // 9326945 is a use-only patent (carve-outable), so the earliest a generic can
  // enter is bounded by the substance patent (2026-12-26), not 2031.
  assert.equal(loe.earliestGenericEntry, '2026-12-26');
  assert.equal(loe.earliestGenericEntryBasis?.code, '6967208');
  assert.equal(loe.carveOutSensitive, true);
});

test('method-of-use patents are flagged carve-outable, substance patents are not', () => {
  const loe = computeDrugLoe(product, patents, exclusivity, '2026-01-01');
  assert.equal(loe.patents.find((p) => p.code === '9326945')?.carveOutable, true);
  assert.equal(loe.patents.find((p) => p.code === '6967208')?.carveOutable, false);
});

test('*PED rows are normalized as pediatric extensions of a base patent', () => {
  const withPed = [
    ...patents,
    patent({ patentNo: '9326945*PED', patentExpireDateText: 'Aug 24, 2031' }),
  ];
  const loe = computeDrugLoe(product, withPed, exclusivity, '2026-01-01');
  const ped = loe.patents.find((p) => p.code === '9326945*PED');
  assert.equal(ped?.pediatricExtension, true);
  assert.equal(ped?.basePatentNo, '9326945');
  assert.match(ped?.detail ?? '', /pediatric/i);
  assert.equal(loe.latestListedProtection, '2031-08-24'); // the pediatric-extended date controls
  assert.equal(loe.controllingProtection?.code, '9326945*PED');
});

test('*PED extension inherits carve-out status from its base patent', () => {
  const substance = patent({ patentNo: 'S1', patentExpireDateText: 'Dec 26, 2026', drugSubstanceFlag: true });
  const useOnly = patent({ patentNo: 'U1', patentExpireDateText: 'Feb 24, 2031', patentUseCode: 'U-777' });
  const ped = patent({ patentNo: 'U1*PED', patentExpireDateText: 'Aug 24, 2031' });
  const loe = computeDrugLoe(product, [substance, useOnly, ped], [], '2026-01-01');
  assert.equal(loe.patents.find((p) => p.code === 'U1')?.carveOutable, true);
  assert.equal(loe.patents.find((p) => p.code === 'U1*PED')?.carveOutable, true); // inherited
  // Both use patents are carve-outable, so entry is bounded by the substance patent.
  assert.equal(loe.earliestGenericEntry, '2026-12-26');
  assert.equal(loe.latestListedProtection, '2031-08-24');
  assert.equal(loe.carveOutSensitive, true);
});

test('date ties return all controlling protections', () => {
  const tied = [
    patent({ patentNo: 'AAA', patentExpireDateText: 'Feb 24, 2031', drugSubstanceFlag: true }),
    patent({ patentNo: 'BBB', patentExpireDateText: 'Feb 24, 2031', drugProductFlag: true }),
  ];
  const loe = computeDrugLoe(product, tied, [], '2026-01-01');
  assert.equal(loe.latestListedProtection, '2031-02-24');
  assert.equal(loe.controllingProtections.length, 2);
});

test('offPatent reflects the asOf date', () => {
  assert.equal(computeDrugLoe(product, patents, exclusivity, '2026-01-01').offPatent, false);
  assert.equal(computeDrugLoe(product, patents, exclusivity, '2035-01-01').offPatent, true);
});

test('a product with no patents or exclusivity is off-patent with null protection', () => {
  const loe = computeDrugLoe(product, [], [], '2026-01-01');
  assert.equal(loe.latestListedProtection, null);
  assert.equal(loe.controllingProtection, null);
  assert.equal(loe.earliestGenericEntry, null);
  assert.equal(loe.offPatent, true);
});
