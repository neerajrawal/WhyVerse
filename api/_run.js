'use strict';
// Shared by the two routes. The leading underscore keeps Vercel from exposing it as an endpoint.
const server = require('../functions/index.js');
const { auth, appCheck } = require('../functions/src/lib/firebase');
const { runCallable, runScheduled } = require('../functions/src/runtime/dispatch');

const NAME = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

const deps = {
  verifyToken: (t) => auth.verifyIdToken(t),
  // Turn on with ENFORCE_APP_CHECK=1 once reCAPTCHA v3 / App Check is set up (see SETUP.md).
  verifyAppCheck: process.env.ENFORCE_APP_CHECK === '1'
    ? async (token) => { if (!token) throw new Error('missing'); await appCheck().verifyToken(token); }
    : null,
};

function send(res, { status, body }) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

function find(name, kind) {
  const def = NAME.test(name || '') ? server[name] : null;
  return def && def.__kind === kind ? def : null;
}

async function handleCallable(req, res) {
  if (req.method !== 'POST') return send(res, { status: 405, body: { error: { status: 'unimplemented', message: 'POST only.' } } });
  const def = find(req.query.fn, 'callable');
  if (!def) return send(res, { status: 404, body: { error: { status: 'not-found', message: 'No such function.' } } });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return send(res, await runCallable(def, { headers: req.headers, body: req.body, ip }, deps));
}

async function handleCron(req, res) {
  const def = find(req.query.job, 'schedule');
  if (!def) return send(res, { status: 404, body: { error: { status: 'not-found', message: 'No such job.' } } });
  return send(res, await runScheduled(def, { headers: req.headers }));
}

module.exports = { handleCallable, handleCron };
