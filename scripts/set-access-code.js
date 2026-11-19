'use strict';
/**
 * One-time (and for emergency reset): set the 6-digit admin access code.
 *
 *   ADMIN_CODE_PEPPER="$(firebase functions:secrets:access ADMIN_CODE_PEPPER)" \
 *     node scripts/set-access-code.js
 *
 * The code is typed at a hidden prompt (so it does not end up in shell history), hashed with
 * scrypt using a random salt plus the pepper, and only the HASH is stored in Firestore
 * (adminSecrets/accessCode). Later, admins can rotate it from the portal.
 */
const { init, askHidden } = require('./_init');
const { newSalt, hashCode, validateNewCode } = require('../functions/src/admin/codeHash');

async function main() {
  const pepper = process.env.ADMIN_CODE_PEPPER;
  if (!pepper || pepper.length < 16) {
    console.error('Set ADMIN_CODE_PEPPER to the same value as the Cloud Functions secret (see the header of this file).');
    process.exit(1);
  }
  const code = await askHidden('New 6-digit access code: ');
  const again = await askHidden('Type it again: ');
  if (code !== again) {
    console.error('The two entries did not match.');
    process.exit(1);
  }
  const problem = validateNewCode(code);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  const admin = init();
  const salt = newSalt();
  await admin.firestore().doc('adminSecrets/accessCode').set({
    salt,
    hash: hashCode(code, salt, pepper),
    algo: 'scrypt-N16384-r8-p1',
    rotatedAt: admin.firestore.FieldValue.serverTimestamp(),
    rotatedBy: 'script',
  });
  // A reset also clears any lockout left on admin accounts.
  const sessions = await admin.firestore().collection('adminSessions').get();
  await Promise.all(sessions.docs.map((d) => d.ref.delete()));
  await admin.firestore().collection('activityLog').add({
    ts: admin.firestore.FieldValue.serverTimestamp(),
    actorUid: 'script',
    actorLabel: 'set-access-code.js',
    action: 'admin.code.set',
  });
  console.log('Access code saved (hash only).');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
