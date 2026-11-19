'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { _test: { ageOn } } = require('../../src/account/adult');

const now = new Date(Date.UTC(2026, 10, 13)); // 13 Nov 2026
test('exactly 18 today is an adult; one day short is not', () => {
  assert.equal(ageOn('2008-11-13', now), 18);
  assert.equal(ageOn('2008-11-14', now), 17);
  assert.equal(ageOn('2008-11-12', now), 18);
});
test('leap-day birthdays work', () => {
  assert.equal(ageOn('2008-02-29', new Date(Date.UTC(2026, 1, 28))), 17);
  assert.equal(ageOn('2008-02-29', new Date(Date.UTC(2026, 2, 1))), 18);
});
test('impossible, future, ancient and badly formatted dates are rejected', () => {
  for (const bad of ['2026-02-31', '2027-01-01', '1850-05-05', '13/11/2000', '', null, undefined, '2000-13-01']) {
    assert.equal(ageOn(bad, now), null, String(bad));
  }
});
