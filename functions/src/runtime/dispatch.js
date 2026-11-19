'use strict';
/**
 * Turns an HTTP request into a handler call, the way Firebase "callable" functions did.
 *   POST /api/<name>   body { data }   header Authorization: Bearer <Firebase ID token> (optional)
 * Answers { result } or { error: { status, message } }.
 */
const { HttpsError } = require('./https');

function errorBody(err) {
  if (err instanceof HttpsError) return { status: err.httpStatus, body: { error: { status: err.code, message: err.message } } };
  console.error('Unhandled error', err && err.stack ? err.stack : err);
  return { status: 500, body: { error: { status: 'internal', message: 'Something went wrong. Please try again.' } } };
}

/**
 * @param {object} deps  { verifyToken(idToken) -> decoded|throws, verifyAppCheck(token) -> void|throws }
 */
async function runCallable(def, { headers = {}, body, ip }, deps) {
  try {
    const data = body && typeof body === 'object' ? body.data : undefined;
    let auth = null;
    const h = String(headers.authorization || headers.Authorization || '');
    if (h.startsWith('Bearer ')) {
      try {
        const decoded = await deps.verifyToken(h.slice(7));
        auth = { uid: decoded.uid, token: decoded };
      } catch {
        throw new HttpsError('unauthenticated', 'Your sign-in has expired. Please sign in again.');
      }
    }
    if (deps.verifyAppCheck) {
      try { await deps.verifyAppCheck(headers['x-firebase-appcheck']); } catch { throw new HttpsError('failed-precondition', 'Request could not be verified.'); }
    }
    const result = await def.handler({ auth, data, rawRequest: { headers, ip } });
    return { status: 200, body: { result: result === undefined ? null : result } };
  } catch (err) {
    return errorBody(err);
  }
}

/** Scheduled jobs are only started by our timer, which must present the shared CRON_SECRET. */
async function runScheduled(def, { headers = {} }, env = process.env) {
  const given = String(headers.authorization || '');
  const secret = env.CRON_SECRET || '';
  if (!secret || given !== `Bearer ${secret}`) return { status: 401, body: { error: { status: 'unauthenticated', message: 'No.' } } };
  try {
    const out = await def.handler({});
    return { status: 200, body: { ok: true, result: out === undefined ? null : out } };
  } catch (err) {
    return errorBody(err);
  }
}

module.exports = { runCallable, runScheduled, errorBody };
