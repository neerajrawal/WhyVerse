'use strict';
const crypto = require('crypto');
const { HttpsError } = require('../runtime/https');
const { db, Timestamp } = require('./firebase');
const { dayKey } = require('./time');

/**
 * Rate limiting WITHOUT storing who the visitor is.
 *
 * Guests: the bucket key is  sha256( secretSalt | today | scope | ip )  so
 *   - the stored document id is a one-way hash, not an IP address;
 *   - the key changes every day, so buckets cannot be linked across days;
 *   - the document holds only {count, expiresAt}. No content, no page, no user.
 * Documents expire automatically (Firestore TTL on `expiresAt`).
 *
 * Signed-in adults can be limited by uid via `key`.
 */

function clientIp(request) {
  const raw = request.rawRequest || {};
  const fwd = raw.headers && raw.headers['x-forwarded-for'];
  const ip = (fwd ? String(fwd).split(',')[0].trim() : raw.ip) || 'unknown';
  return ip;
}

function bucketId({ salt, scope, who, windowStart }) {
  return crypto
    .createHash('sha256')
    .update(`${salt}|${dayKey()}|${scope}|${who}|${windowStart}`)
    .digest('hex');
}

/**
 * Count one hit. Throws HttpsError('resource-exhausted') when over the limit.
 *
 * @param {object} p
 * @param {object} p.request   callable request (used to read the caller's IP)
 * @param {string} p.scope     e.g. 'report', 'view:<pageId>', 'chat'
 * @param {string} p.salt      RATE_LIMIT_SALT secret value
 * @param {number} p.limit     max hits per window
 * @param {number} p.windowSec window length in seconds
 * @param {string} [p.key]     identity to limit by instead of IP (e.g. an adult's uid)
 * @param {boolean} [p.silent] if true, return false instead of throwing
 * @returns {Promise<boolean>} true when the hit was allowed
 */
async function hit({ request, scope, salt, limit, windowSec, key, silent = false }) {
  const who = key || clientIp(request);
  const windowStart = Math.floor(Date.now() / 1000 / windowSec);
  const id = bucketId({ salt, scope, who, windowStart });
  const ref = db.collection('rateBuckets').doc(id);

  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? snap.data().count : 0;
    if (count >= limit) return false;
    tx.set(ref, {
      count: count + 1,
      // Keep a little past the window so late hits in the same window are still counted.
      expiresAt: Timestamp.fromMillis((windowStart + 2) * windowSec * 1000),
    });
    return true;
  });

  if (!allowed && !silent) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a little and try again.');
  }
  return allowed;
}

module.exports = { hit, clientIp, bucketId };
