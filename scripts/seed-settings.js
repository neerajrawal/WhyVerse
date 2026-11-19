'use strict';
/**
 * One-time: write the default settings and categories.  node scripts/seed-settings.js
 * Safe to re-run: existing settings are kept (merge) and existing categories are not overwritten
 * unless you pass --force.
 */
const { init } = require('./_init');
const { DEFAULT_SETTINGS, PUBLIC_SETTINGS, DEFAULT_CATEGORIES } = require('../functions/src/config/defaults');

async function main() {
  const force = process.argv.includes('--force');
  const admin = init();
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const mainRef = db.doc('settings/main');
  const mainSnap = await mainRef.get();
  if (!mainSnap.exists || force) {
    await mainRef.set({ ...DEFAULT_SETTINGS, updatedAt: now });
    console.log('Wrote settings/main');
  } else {
    console.log('settings/main already exists (use --force to reset)');
  }
  await db.doc('settings/public').set({ ...PUBLIC_SETTINGS, updatedAt: now }, { merge: true });

  for (const c of DEFAULT_CATEGORIES) {
    const ref = db.doc(`categories/${c.id}`);
    const snap = await ref.get();
    if (!snap.exists || force) await ref.set(c);
  }
  console.log(`Categories ready (${DEFAULT_CATEGORIES.length}).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
