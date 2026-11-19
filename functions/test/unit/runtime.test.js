'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { onCall, HttpsError } = require('../../src/runtime/https');
const { onSchedule } = require('../../src/runtime/scheduler');
const { runCallable, runScheduled } = require('../../src/runtime/dispatch');
const { requireAdmin } = require('../../src/lib/auth');

const deps = { verifyToken: async (t) => { if (t === 'good') return { uid: 'u1', email: 'a@b.co', admin: true, adminUntil: Math.floor(Date.now() / 1000) + 600 }; throw new Error('bad'); } };

test('callable gets auth, data and the caller IP', async () => {
  const def = onCall({}, async (req) => ({ uid: req.auth && req.auth.uid, data: req.data, ip: req.rawRequest.ip }));
  const r = await runCallable(def, { headers: { authorization: 'Bearer good' }, body: { data: { x: 1 } }, ip: '1.2.3.4' }, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.result, { uid: 'u1', data: { x: 1 }, ip: '1.2.3.4' });
});

test('guests are allowed through with no auth; a bad token is refused', async () => {
  const def = onCall({}, async (req) => ({ signedIn: Boolean(req.auth) }));
  assert.deepEqual((await runCallable(def, { headers: {}, body: { data: {} } }, deps)).body.result, { signedIn: false });
  const bad = await runCallable(def, { headers: { authorization: 'Bearer nope' }, body: { data: {} } }, deps);
  assert.equal(bad.status, 401);
});

test('HttpsError becomes the right HTTP status; other errors are hidden', async () => {
  const denied = await runCallable(onCall({}, async () => { throw new HttpsError('permission-denied', 'Not allowed.'); }), { headers: {}, body: {} }, deps);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.message, 'Not allowed.');
  const boom = await runCallable(onCall({}, async () => { throw new Error('secret db password leaked'); }), { headers: {}, body: {} }, deps);
  assert.equal(boom.status, 500);
  assert.equal(JSON.stringify(boom.body).includes('secret'), false);
});

test('admin check still works through the adapter', async () => {
  const def = onCall({}, async (req) => { requireAdmin(req); return 'ok'; });
  assert.equal((await runCallable(def, { headers: { authorization: 'Bearer good' }, body: {} }, deps)).body.result, 'ok');
  assert.equal((await runCallable(def, { headers: {}, body: {} }, deps)).status, 401);
});

test('scheduled jobs need the shared secret', async () => {
  const def = onSchedule({}, async () => ({ done: 0 }));
  assert.equal((await runScheduled(def, { headers: {} }, { CRON_SECRET: 's3cret' })).status, 401);
  assert.equal((await runScheduled(def, { headers: { authorization: 'Bearer wrong' } }, { CRON_SECRET: 's3cret' })).status, 401);
  assert.equal((await runScheduled(def, { headers: { authorization: 'Bearer s3cret' } }, {})).status, 401); // secret not configured: always refuse
  const ok = await runScheduled(def, { headers: { authorization: 'Bearer s3cret' } }, { CRON_SECRET: 's3cret' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.result, { done: 0 });
});
