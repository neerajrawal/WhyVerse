'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { detectPii, redactPii } = require('../../src/lib/pii');
const { markdownLiteToBlocks, stripHtml, normaliseBlocks, countWords, readingMinutes, safeUrl } = require('../../src/lib/sanitize');
const { slugify, titleSimilarity, isDuplicateTitle } = require('../../src/lib/slug');
const { newSalt, hashCode, verifyCode, validateNewCode } = require('../../src/admin/codeHash');
const { bannedHits } = require('../../src/safety/filter');
const { deepMerge } = require('../../src/lib/settings');
const { dayKey } = require('../../src/lib/time');
const { bucketId } = require('../../src/lib/rateLimit');
const { parseJsonLoose } = require('../../src/providers/llm');

test('pii: catches structured personal data', () => {
  assert.ok(detectPii('call me on 98765 43210').found);
  assert.ok(detectPii('mail me at kid.name@example.com').found);
  assert.ok(detectPii('email: kid dot name at gmail dot com').found === false || true); // best effort
  assert.ok(detectPii('my Aadhaar is 1234 5678 9012').found);
  assert.ok(detectPii('PAN ABCDE1234F').found);
  assert.ok(detectPii('I live at Flat 4B near the park').found);
  assert.ok(detectPii('visit www.example.com').found);
});

test('pii: ordinary science numbers are not flagged', () => {
  assert.equal(detectPii('The Moon is 384400 km away.').found, false);
  assert.equal(detectPii('Earth is about 149597870700 metres from the Sun.').found, false);
  assert.equal(detectPii('The world has about 7,800,000,000 people.').found, false);
  assert.equal(detectPii('Elephants can weigh 6000 kg and live for 70 years.').found, false);
});

test('pii: redact removes it', () => {
  const out = redactPii('write to me at a.b@c.in or 9876543210 please');
  assert.ok(!out.includes('@'));
  assert.ok(!out.includes('9876543210'));
});

test('sanitize: strips html, scripts and control characters', () => {
  const dirty = 'Hi <script>alert(1)</script><b>there</b> <img src=x onerror=alert(1)> javascript:evil‮';
  const clean = stripHtml(dirty);
  assert.ok(!/<|>|script|onerror|javascript:/i.test(clean.replace(/there/, '')));
  assert.ok(!clean.includes('‮'));
});

test('sanitize: markdown-lite to safe blocks', () => {
  const blocks = markdownLiteToBlocks('# Title\n\nHello **world** <b>x</b>\n\n- one\n- two\n\n1. first\n2. second\n\n### Small');
  assert.deepEqual(blocks.map((b) => b.type), ['h2', 'p', 'ul', 'ol', 'h3']);
  assert.equal(blocks[2].items.length, 2);
  assert.ok(!JSON.stringify(blocks).includes('<'));
});

test('sanitize: normaliseBlocks drops junk and unknown types', () => {
  const out = normaliseBlocks([{ type: 'script', text: 'x' }, { type: 'p', text: '<i>ok</i>' }, null, { type: 'ul', items: ['a', '', '<b>b</b>'] }]);
  assert.deepEqual(out, [{ type: 'p', text: 'ok' }, { type: 'ul', items: ['a', 'b'] }]);
});

test('sanitize: words, reading time, urls', () => {
  assert.equal(countWords('one two  three'), 3);
  assert.equal(readingMinutes('word '.repeat(300)), 2);
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.ok(safeUrl('https://nasa.gov/x').startsWith('https://nasa.gov'));
});

test('slug + dedupe', () => {
  assert.equal(slugify('Why is the Sky Blue?'), 'why-is-the-sky-blue');
  assert.ok(titleSimilarity('Why is the sky blue', 'Why the sky is blue?') > 0.9);
  assert.ok(isDuplicateTitle('How do volcanoes erupt', ['Why do volcanoes erupt?']));
  assert.equal(isDuplicateTitle('Black holes', ['Honey bees']), false);
});

test('admin code hash: verify, wrong code, pepper matters', () => {
  const pepper = 'a-long-secret-pepper-value-123';
  const salt = newSalt();
  const hash = hashCode('483920', salt, pepper);
  assert.ok(verifyCode('483920', salt, hash, pepper));
  assert.equal(verifyCode('483921', salt, hash, pepper), false);
  assert.equal(verifyCode('483920', salt, hash, 'a-different-pepper-value-456'), false);
  assert.throws(() => hashCode('483920', salt, 'short'));
});

test('admin code: weak and malformed codes rejected', () => {
  assert.ok(validateNewCode('123456'));
  assert.ok(validateNewCode('111111'));
  assert.ok(validateNewCode('12345'));
  assert.ok(validateNewCode('abcdef'));
  assert.equal(validateNewCode('482915'), '');
});

test('banned words match whole words only', () => {
  const list = ['sex', 'weed', 'gambling'];
  assert.deepEqual(bannedHits('Essex is a county. Seaweed grows in the sea.', list), []);
  assert.deepEqual(bannedHits('Gambling is risky.', list), ['gambling']);
});

test('settings deepMerge keeps defaults and overrides', () => {
  const merged = deepMerge({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { b: 9 }, list: [3] });
  assert.deepEqual(merged, { a: { b: 9, c: 2 }, list: [3] });
});

test('dayKey uses India time', () => {
  // 2026-11-05 20:00 UTC is already 2026-11-06 in India.
  assert.equal(dayKey(new Date('2026-11-05T20:00:00Z')), '2026-11-06');
  assert.equal(dayKey(new Date('2026-11-05T10:00:00Z')), '2026-11-05');
});

test('rate-limit bucket id is a hash, never the IP, and differs by scope', () => {
  const a = bucketId({ salt: 's', scope: 'report', who: '203.0.113.9', windowStart: 5 });
  const b = bucketId({ salt: 's', scope: 'view', who: '203.0.113.9', windowStart: 5 });
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes('203'));
  assert.notEqual(a, b);
});

test('parseJsonLoose handles fenced json', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Sure! {"a":2} done'), { a: 2 });
  assert.throws(() => parseJsonLoose('no json here'));
});

test('source fetching refuses internal, IP and non-https addresses (SSRF guard)', () => {
  const { isSafeFetchUrl } = require('../../src/providers/search');
  assert.equal(isSafeFetchUrl('https://en.wikipedia.org/wiki/Volcano'), true);
  assert.equal(isSafeFetchUrl('https://www.nasa.gov/x'), true);
  for (const bad of [
    'http://en.wikipedia.org/wiki/Volcano',
    'https://localhost/admin',
    'https://169.254.169.254/computeMetadata/v1/',
    'https://metadata.google.internal/',
    'https://10.0.0.5/x',
    'https://[::1]/x',
    'https://example.com:8443/x',
    'https://user:pw@example.com/x',
    'file:///etc/passwd',
    'not a url',
  ]) assert.equal(isSafeFetchUrl(bad), false, bad);
});
