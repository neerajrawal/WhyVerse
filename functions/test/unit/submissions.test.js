'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSubmission, decideSubmission } = require('../../src/submissions/pure');
const { checkSubmission } = require('../../src/submissions/process');

const para = (n, s = 'The monsoon brings rain to many parts of India each year and farmers wait for it.') => Array.from({ length: n }, () => s).join(' ');
const ok = (over = {}) => ({ title: 'My monsoon story', category: 'nature', ageBand: 'all', body: `${para(6)}\n\n## Clouds\n\n${para(6)}`, ...over });
const opts = { categoryIds: ['nature', 'space'], maxWords: 1500 };

test('a good draft is accepted and turned into safe blocks', () => {
  const v = validateSubmission(ok({ body: `<script>x</script>${para(6)}\n\n## Clouds\n\n${para(6)}` }), opts);
  assert.equal(v.ok, true, v.problems.join());
  assert.equal(JSON.stringify(v.clean.blocks).includes('<script'), false);
  assert.ok(v.clean.words >= 150);
});

test('too short, too long, bad category and band are all reported', () => {
  assert.match(validateSubmission(ok({ body: 'Tiny.' }), opts).problems.join(' '), /at least 150/);
  assert.match(validateSubmission(ok({ body: para(200) }), { ...opts, maxWords: 300 }).problems.join(' '), /limit is 300/);
  assert.match(validateSubmission(ok({ category: 'nope' }), opts).problems.join(' '), /category/);
  assert.match(validateSubmission(ok({ ageBand: 'adult' }), opts).problems.join(' '), /who the page is for/);
  assert.match(validateSubmission(ok({ title: 'Hi' }), opts).problems.join(' '), /title/);
});

test('personal details are refused and never echoed back', () => {
  const v = validateSubmission(ok({ body: `${para(6)}\n\nCall me on 98765 43210 or write to a.b@example.com, see https://x.example.com\n\n${para(6)}` }), opts);
  assert.equal(v.ok, false);
  const msg = v.problems.join(' ');
  assert.match(msg, /phone number/);
  assert.match(msg, /email address/);
  assert.match(msg, /web link/);
  assert.equal(msg.includes('98765'), false);
  assert.equal(msg.includes('example.com'), false);
});

const pass = { verdict: 'pass', reasons: [], categories: [], personalInfo: false };
const factOk = { ok: true, unsupported: [] };

test('decideSubmission: clean goes to an admin, never straight to publish', () => {
  const d = decideSubmission({ safety: pass, overlap: 0, fact: factOk });
  assert.equal(d.status, 'submitted');
  assert.deepEqual(d.flags, []);
});
test('decideSubmission: unsuitable or copied pages are rejected with a reason', () => {
  assert.equal(decideSubmission({ safety: { ...pass, verdict: 'reject', reasons: ['Too scary'] }, overlap: 0, fact: factOk }).status, 'rejected');
  const c = decideSubmission({ safety: pass, overlap: 0.6, fact: factOk });
  assert.equal(c.status, 'rejected');
  assert.match(c.reasons[0], /own words/);
});
test('decideSubmission: doubts become flags for the admin', () => {
  const d = decideSubmission({ safety: { ...pass, verdict: 'review', unavailable: true }, overlap: 0.3, fact: { ok: false, unsupported: [{}, {}] } });
  assert.equal(d.status, 'submitted');
  assert.equal(d.flags.length, 3);
});

const clean = { title: 'My monsoon story', category: 'nature', ageBand: 'all', text: para(12) };
const deps = (over = {}) => ({
  safety: { checkText: async () => ({ ...pass, suggestedBand: 'all' }) },
  factCheck: async () => ({ ok: true, unsupported: [], summary: 'fine' }),
  references: async () => [{ title: 'Monsoon', url: 'https://en.wikipedia.org/wiki/Monsoon', text: 'Completely different text about winds and seasons over oceans and land masses.' }],
  ...over,
});

test('checkSubmission: clean page', async () => {
  const r = await checkSubmission({ clean, deps: deps() });
  assert.equal(r.decision.status, 'submitted');
  assert.equal(r.plagiarism.overlap, 0);
});
test('checkSubmission: copied page is rejected and not fact-checked', async () => {
  let factCalls = 0;
  const r = await checkSubmission({ clean, deps: deps({ references: async () => [{ title: 'x', url: 'https://en.wikipedia.org/wiki/X', text: clean.text }], factCheck: async () => { factCalls += 1; return { ok: true, unsupported: [] }; } }) });
  assert.equal(r.decision.status, 'rejected');
  assert.equal(factCalls, 0);
});
test('checkSubmission: model and reference failures fail safe, not open', async () => {
  const r = await checkSubmission({ clean, deps: deps({
    safety: { checkText: async () => ({ verdict: 'review', unavailable: true, reasons: ['down'], categories: [] }) },
    references: async () => { throw new Error('network'); },
    factCheck: async () => { throw new Error('boom'); },
  }) });
  assert.equal(r.decision.status, 'submitted'); // a person still decides
  assert.ok(r.decision.flags.some((f) => /could not run/.test(f)));
});

// ---------------------------------------------------------------- warning ladder
const { strikeAction } = require('../../src/submissions/strikes');
const { DEFAULT_SETTINGS } = require('../../src/config/defaults');
const ladder = DEFAULT_SETTINGS.submissions.strikes;

test('warning ladder: a different message and consequence at each step', () => {
  const steps = [1, 2, 3, 4, 5].map((n) => strikeAction(n, ladder));
  assert.deepEqual(steps.map((s) => s.level), ['notice', 'warning', 'final_warning', 'suspended', 'blocked']);
  assert.deepEqual(steps.map((s) => s.pauseHours), [0, 0, 24, 168, 0]);
  assert.deepEqual(steps.map((s) => s.block), [false, false, false, false, true]);
  assert.equal(new Set(steps.map((s) => s.title)).size, 5);
  assert.match(steps[2].body, /24 hours/);
  assert.match(steps[3].body, /7 days/);
});
test('warning ladder: beyond the last step stays blocked; editable ladders work', () => {
  assert.equal(strikeAction(9, ladder).level, 'blocked');
  const custom = [{ at: 1, level: 'warning', pauseHours: 0 }, { at: 2, level: 'blocked', block: true }];
  assert.equal(strikeAction(2, custom).block, true);
});

// ---------------------------------------------------------------- whole-web check
test('web check flag: admins are told when it could not run', () => {
  const d = decideSubmission({ safety: pass, overlap: 0, fact: factOk, webChecked: false });
  assert.equal(d.status, 'submitted');
  assert.ok(d.flags.some((f) => /whole-web/.test(f)));
  assert.deepEqual(decideSubmission({ safety: pass, overlap: 0, fact: factOk, webChecked: true }).flags, []);
});
test('checkSubmission: copying found on the wider web is rejected', async () => {
  const web = async () => ({ checked: true, refs: [{ title: 'blog', url: 'https://blog.example.com/p', text: clean.text }] });
  const r = await checkSubmission({ clean, deps: deps({ webReferences: web }) });
  assert.equal(r.decision.status, 'rejected');
  assert.equal(r.plagiarism.webChecked, true);
});
test('checkSubmission: a failing web check is flagged, not ignored', async () => {
  const r = await checkSubmission({ clean, deps: deps({ webReferences: async () => { throw new Error('x'); } }) });
  assert.equal(r.decision.status, 'submitted');
  assert.equal(r.plagiarism.webChecked, false);
});

const { distinctiveSentences } = require('../../src/safety/webCheck');
test('distinctiveSentences picks spread-out, medium-length sentences', () => {
  const text = Array.from({ length: 10 }, (_, i) => `Sentence number ${i} talks about how the monsoon winds carry water across the Indian Ocean every year.`).join(' ');
  const s = distinctiveSentences(text, 3);
  assert.equal(s.length, 3);
  assert.ok(s[0] !== s[2]);
  assert.deepEqual(distinctiveSentences('Short one. Tiny.', 3), []);
});

const { fetchHtmlText, htmlToText } = require('../../src/providers/search/htmlText');
const res = (status, headers, body = '') => ({ status, ok: status < 300, headers: { get: (k) => headers[k.toLowerCase()] || null }, body: { getReader: () => { let sent = false; return { read: async () => (sent ? { done: true } : (sent = true, { done: false, value: Buffer.from(body) })), cancel: async () => {} }; } } });
test('htmlText: strips markup and follows safe redirects', async () => {
  const calls = [];
  const fetchImpl = async (u) => { calls.push(u); return calls.length === 1 ? res(302, { location: 'https://site.example.org/a' }) : res(200, { 'content-type': 'text/html' }, '<html><nav>menu</nav><script>x()</script><p>Hello &amp; welcome</p></html>'); };
  assert.equal(await fetchHtmlText('https://redirect.example.com/x', { fetchImpl }), 'Hello & welcome');
});
test('htmlText: refuses to follow a redirect to an internal address (SSRF)', async () => {
  const seen = [];
  const fetchImpl = async (u) => { seen.push(u); return res(302, { location: 'https://169.254.169.254/latest/meta-data' }); };
  assert.equal(await fetchHtmlText('https://redirect.example.com/x', { fetchImpl }), '');
  assert.equal(seen.length, 1);
  assert.equal(htmlToText('<b>a</b>  <i>b</i>'), 'a b');
});
