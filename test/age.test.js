import test from 'node:test';
import assert from 'node:assert/strict';
import { ageOn } from '../src/lib/age.js';

const now = new Date(Date.UTC(2026, 10, 13));
test('18 today is adult, tomorrow is not', () => {
  assert.equal(ageOn('2008-11-13', now), 18);
  assert.equal(ageOn('2008-11-14', now), 17);
});
test('bad dates give null', () => {
  for (const b of ['2026-02-31', '2027-01-01', '1850-01-01', '', null, '1/1/2000']) assert.equal(ageOn(b, now), null);
});
