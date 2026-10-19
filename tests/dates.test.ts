import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseObDate, maxIsoDate } from '../src/loe/dates.js';

test('parseObDate parses Orange Book date text', () => {
  assert.equal(parseObDate('Aug 24, 2026'), '2026-08-24');
  assert.equal(parseObDate('Feb 1, 2027'), '2027-02-01');
  assert.equal(parseObDate('December 26, 2026'), '2026-12-26');
});

test('parseObDate returns null on empty or malformed input', () => {
  assert.equal(parseObDate(''), null);
  assert.equal(parseObDate(undefined), null);
  assert.equal(parseObDate('Approved Prior to Jan 1, 1982'), null);
  assert.equal(parseObDate('2026-08-24'), null);
});

test('parseObDate rejects impossible calendar dates instead of rolling them forward', () => {
  assert.equal(parseObDate('Feb 31, 2026'), null); // would roll to March 3
  assert.equal(parseObDate('Apr 31, 2026'), null);
  assert.equal(parseObDate('Feb 29, 2024'), '2024-02-29'); // leap year, valid
  assert.equal(parseObDate('Feb 29, 2026'), null); // not a leap year
});

test('maxIsoDate returns the latest, ignoring nulls', () => {
  assert.equal(maxIsoDate(['2026-01-01', '2031-02-24', null]), '2031-02-24');
  assert.equal(maxIsoDate(['2017-12-28']), '2017-12-28');
  assert.equal(maxIsoDate([null, null]), null);
  assert.equal(maxIsoDate([]), null);
});
