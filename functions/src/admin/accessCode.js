'use strict';
/**
 * Admin gate, step 2 of 2.
 *   Step 1: the person signs in with a Firebase account that has the permanent "admin" claim
 *           (created by scripts/create-first-admin.js).
 *   Step 2: they enter the 6-digit code. It is checked HERE, on the server. On success we set a
 *           short-lived "adminUntil" claim (default 2 hours). Firestore rules and every admin
 *           function check that claim; nothing is decided by frontend JavaScript.
 *
 * Brute-force protection: failures are counted BEFORE the code is compared, inside a
 * transaction, so parallel guesses cannot sneak past the limit. 5 failures -> 15 min lockout.
 * Every attempt (success or fail) is written to the activity log.
 */
const { onCall, HttpsError } = require('../runtime/https');
const { db, auth, FieldValue, Timestamp } = require('../lib/firebase');
const secrets = require('../config/secrets');
const { callableOptions } = require('../lib/options');
const { requireAdminAccount, requireAdmin } = require('../lib/auth');
const { logActivity } = require('../lib/logger');
const { getSettings } = require('../lib/settings');
const { nowSeconds } = require('../lib/time');
const { verifyCode, hashCode, newSalt, validateNewCode } = require('./codeHash');

const CODE_DOC = 'adminSecrets/accessCode';

/**
 * Check a code for this admin account with lockout. Throws HttpsError on failure.
 * @returns {Promise<void>} resolves only when the code is correct
 */
async function checkCodeWithLockout(uid, label, code) {
  if (!/^\d{6}$/.test(String(code || ''))) {
    throw new HttpsError('invalid-argument', 'Enter the 6-digit code.');
  }
  const { accessCode: cfg } = await getSettings();
  const stateRef = db.doc(`adminSessions/${uid}`);

  // 1) Reserve an attempt (and enforce the lockout) atomically before comparing.
  const reserved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const s = snap.exists ? snap.data() : {};
    const now = Date.now();
    const lockedUntilMs = s.lockedUntil ? s.lockedUntil.toMillis() : 0;
    if (lockedUntilMs > now) return { locked: true, until: lockedUntilMs };

    // A lock that has expired starts a fresh count.
    let failures = lockedUntilMs && lockedUntilMs <= now ? 0 : (s.failures || 0);
    failures += 1;
    const update = { failures, lastAttemptAt: Timestamp.now() };
    if (failures >= cfg.maxFailures) {
      update.lockedUntil = Timestamp.fromMillis(now + cfg.lockoutMinutes * 60 * 1000);
    }
    tx.set(stateRef, update, { merge: true });
    return { locked: false, failures, becameLocked: Boolean(update.lockedUntil) };
  });

  if (reserved.locked) {
    await logActivity({ actorUid: uid, actorLabel: label, action: 'admin.code.blocked', meta: { reason: 'locked' } });
    const mins = Math.max(1, Math.ceil((reserved.until - Date.now()) / 60000));
    throw new HttpsError('resource-exhausted', `Too many wrong codes. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }

  // 2) Compare.
  const codeSnap = await db.doc(CODE_DOC).get();
  if (!codeSnap.exists) {
    throw new HttpsError('failed-precondition', 'No access code has been set yet. Run scripts/set-access-code.js.');
  }
  const { salt, hash } = codeSnap.data();
  const ok = verifyCode(code, salt, hash, secrets.ADMIN_CODE_PEPPER.value());

  if (!ok) {
    await logActivity({
      actorUid: uid,
      actorLabel: label,
      action: 'admin.code.fail',
      meta: { failures: reserved.failures, locked: reserved.becameLocked },
    });
    throw new HttpsError(
      'permission-denied',
      reserved.becameLocked
        ? `Wrong code. This account is locked for ${cfg.lockoutMinutes} minutes.`
        : 'Wrong code.',
    );
  }

  // 3) Success resets the counter.
  await stateRef.set({ failures: 0, lockedUntil: FieldValue.delete(), lastSuccessAt: Timestamp.now() }, { merge: true });
}

/** Merge a claim change without wiping the account's other claims. */
async function setClaims(uid, patch) {
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}), ...patch };
  for (const k of Object.keys(claims)) if (claims[k] === null) delete claims[k];
  await auth.setCustomUserClaims(uid, claims);
}

const base = { secrets: [secrets.ADMIN_CODE_PEPPER] };

/**
 * adminVerifyCode({ code }) -> { expiresAt }
 * After success the client must call getIdToken(true) to receive the new claim.
 */
exports.adminVerifyCode = onCall(callableOptions(base), async (request) => {
  const { uid, token } = requireAdminAccount(request);
  const label = token.email || uid;
  await checkCodeWithLockout(uid, label, request.data && request.data.code);

  const { accessCode: cfg } = await getSettings();
  const expiresAt = nowSeconds() + Math.round(cfg.sessionHours * 3600);
  await setClaims(uid, { adminUntil: expiresAt });
  await logActivity({ actorUid: uid, actorLabel: label, action: 'admin.code.success', meta: { expiresAt } });
  return { ok: true, expiresAt };
});

/** adminEndSession() -> locks the portal again straight away. */
exports.adminEndSession = onCall(callableOptions({}), async (request) => {
  const { uid, token } = requireAdminAccount(request);
  await setClaims(uid, { adminUntil: null });
  await logActivity({ actorUid: uid, actorLabel: token.email || uid, action: 'admin.session.end' });
  return { ok: true };
});

/**
 * adminRotateCode({ currentCode, newCode })
 * Needs an unlocked session AND the current code again (a stolen open session alone is not
 * enough to change the code).
 */
exports.adminRotateCode = onCall(callableOptions(base), async (request) => {
  const { uid, token } = requireAdmin(request);
  const label = token.email || uid;
  const { currentCode, newCode } = request.data || {};

  const problem = validateNewCode(newCode);
  if (problem) throw new HttpsError('invalid-argument', problem);
  if (String(currentCode) === String(newCode)) {
    throw new HttpsError('invalid-argument', 'The new code must be different from the current one.');
  }
  await checkCodeWithLockout(uid, label, currentCode);

  const salt = newSalt();
  await db.doc(CODE_DOC).set({
    salt,
    hash: hashCode(newCode, salt, secrets.ADMIN_CODE_PEPPER.value()),
    algo: 'scrypt-N16384-r8-p1',
    rotatedAt: FieldValue.serverTimestamp(),
    rotatedBy: uid,
  });
  await logActivity({ actorUid: uid, actorLabel: label, action: 'admin.code.rotated' });
  return { ok: true };
});
