'use strict';
/**
 * Tiny stand-in for firebase-functions/v2/https, so the same handlers run on Vercel (free, no card)
 * instead of Cloud Functions (needs the paid Blaze plan). Handlers keep the same shape:
 *   onCall(options, async (request) => result)    request = { auth: {uid, token}|null, data, rawRequest }
 *   throw new HttpsError('permission-denied', 'message')
 * Options (region, memory, secrets...) are accepted and ignored here: Vercel config decides those.
 */
const STATUS = {
  'invalid-argument': 400, 'failed-precondition': 400, 'out-of-range': 400,
  unauthenticated: 401, 'permission-denied': 403, 'not-found': 404, 'already-exists': 409, aborted: 409,
  'resource-exhausted': 429, cancelled: 499, internal: 500, unknown: 500, 'data-loss': 500,
  unimplemented: 501, unavailable: 503, 'deadline-exceeded': 504,
};

class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'HttpsError';
    this.code = code;
    this.details = details;
    this.httpStatus = STATUS[code] || 500;
  }
}

function onCall(options, handler) {
  const fn = typeof options === 'function' ? options : handler;
  return { __kind: 'callable', handler: fn };
}

module.exports = { onCall, HttpsError, STATUS };
