'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSettingsPatch, validatePublicPatch, pageFromSubmission, TRANSITIONS } = require('../../src/admin/pure');

test('settings: valid changes are accepted and nested', () => {
  const v = validateSettingsPatch({ 'limits.maxPagesPerDay': 10, 'automation.enabled': true, 'automation.defaultBand': 'junior', 'sources.blockedDomains': ['Spam.example.com'], 'safety.bannedTopics': ['Gambling'] });
  assert.equal(v.ok, true, v.problems.join());
  assert.equal(v.nested.limits.maxPagesPerDay, 10);
  assert.equal(v.nested.automation.enabled, true);
  assert.deepEqual(v.nested.sources.blockedDomains, ['spam.example.com']);
});
test('settings: the access code, unknown keys and bad values are refused', () => {
  for (const bad of [{ 'accessCode.maxFailures': 100 }, { 'limits.maxPagesPerDay': -1 }, { 'limits.maxPagesPerDay': '5' }, { 'automation.defaultBand': 'adult' }, { 'sources.blockedDomains': ['not a domain'] }, { 'llm.writeModel': 'x; drop' }, { 'safety.mode': 'off' }]) {
    assert.equal(validateSettingsPatch(bad).ok, false, JSON.stringify(bad));
  }
});
test('public flags: only known booleans pass', () => {
  assert.deepEqual(validatePublicPatch({ submissionsOpen: false, maintenance: 'yes', other: true }), { submissionsOpen: false });
});
test('approved submission becomes a clean user-authored page', () => {
  const sub = { title: 'My story', category: 'nature', ageBand: 'all', authorUid: 'u1', authorName: 'Asha', readingMinutes: 3, bodyBlocks: [{ type: 'p', text: 'Rain **falls** from clouds.' }] };
  const p = pageFromSubmission(sub, { ageBand: 'junior' });
  assert.equal(p.source, 'user');
  assert.equal(p.ageBand, 'junior');
  assert.equal(p.authorName, 'Asha');
  assert.equal(p.summary, 'Rain falls from clouds.');
  assert.deepEqual(p.quiz, []);
  assert.equal(pageFromSubmission(sub, { ageBand: 'adult' }).ageBand, 'all'); // never an invented band
});
test('page transitions: only sensible moves', () => {
  assert.ok(TRANSITIONS.publish.from.includes('ready'));
  assert.ok(!TRANSITIONS.publish.from.includes('rejected'));
  assert.ok(!TRANSITIONS.unpublish.from.includes('ready'));
});
