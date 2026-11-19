'use strict';
/**
 * Hashing for the 6-digit admin access code. Pure Node (no Firebase) so the one-time setup
 * script can use the exact same code as the server.
 *
 * hash = scrypt( code, salt || pepper )
 *   salt   : random, stored with the hash in Firestore (adminSecrets/accessCode)
 *   pepper : secret in Secret Manager (ADMIN_CODE_PEPPER), NOT in the database
 *
 * A 6-digit code only has 1,000,000 possibilities, so the hash alone could be brute-forced
 * offline if the database leaked. The pepper makes a database leak useless on its own, and
 * online guessing is stopped by the lockout (5 failures -> 15 minutes).
 */
const crypto = require('crypto');

const KEYLEN = 64;
const SCRYPT = { N: 16384, r: 8, p: 1 };

function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashCode(code, saltHex, pepper) {
  if (!pepper || pepper.length < 16) throw new Error('ADMIN_CODE_PEPPER must be at least 16 characters');
  const key = Buffer.concat([Buffer.from(saltHex, 'hex'), Buffer.from(pepper, 'utf8')]);
  return crypto.scryptSync(String(code), key, KEYLEN, SCRYPT).toString('hex');
}

function verifyCode(code, saltHex, expectedHashHex, pepper) {
  const actual = Buffer.from(hashCode(code, saltHex, pepper), 'hex');
  const expected = Buffer.from(expectedHashHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const WEAK = new Set([
  '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999',
  '123456', '234567', '345678', '456789', '654321', '987654', '012345', '123123', '121212', '112233',
  '696969', '123321', '159753', '147258', '102030',
]);

/** Returns an error message, or '' when the code is acceptable. */
function validateNewCode(code) {
  if (!/^\d{6}$/.test(String(code))) return 'The code must be exactly 6 digits.';
  if (WEAK.has(String(code))) return 'That code is too easy to guess. Choose a less obvious one.';
  return '';
}

module.exports = { newSalt, hashCode, verifyCode, validateNewCode };
