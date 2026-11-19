'use strict';
/**
 * One-time: make an existing Firebase user an admin account.
 *
 *   1. Sign up on your site (or in the Firebase console, Authentication > Add user) with the
 *      email you want to use as admin.
 *   2. Run:   node scripts/create-first-admin.js you@example.com
 *
 * This sets the permanent custom claim  admin: true.  It does NOT unlock the portal: the
 * person must still enter the 6-digit code at /authority (the server then adds a 2-hour
 * "adminUntil" claim). To remove an admin later, run it again with --remove.
 */
const { init } = require('./_init');

async function main() {
  const email = process.argv[2];
  const remove = process.argv.includes('--remove');
  if (!email || !email.includes('@')) {
    console.error('Usage: node scripts/create-first-admin.js <email> [--remove]');
    process.exit(1);
  }
  const admin = init();
  const user = await admin.auth().getUserByEmail(email);
  const claims = { ...(user.customClaims || {}) };
  if (remove) {
    delete claims.admin;
    delete claims.adminUntil;
  } else {
    claims.admin = true;
  }
  await admin.auth().setCustomUserClaims(user.uid, claims);
  await admin.firestore().collection('activityLog').add({
    ts: admin.firestore.FieldValue.serverTimestamp(),
    actorUid: 'script',
    actorLabel: 'create-first-admin.js',
    action: remove ? 'admin.account.removed' : 'admin.account.created',
    target: user.uid,
    meta: { email },
  });
  console.log(remove ? `Removed admin from ${email}` : `${email} is now an admin account (uid ${user.uid}).`);
  console.log('They must sign out and in again (or refresh their token) for the claim to appear.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
