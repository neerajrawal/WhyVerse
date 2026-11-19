'use strict';
/**
 * Adult confirmation, a step above a tick-box:
 *   verified email  +  date of birth that works out to 18 or over.
 * The date of birth is used for the calculation and then thrown away: only "adult confirmed on <date>"
 * is kept. This cannot prove who someone is (that needs an ID check, which costs money and means holding
 * sensitive documents), so it is one layer: an admin also approves every writer and reads every page.
 */
const { onCall, HttpsError } = require('../runtime/https');
const { db, FieldValue, Timestamp } = require('../lib/firebase');
const { requireAuth } = require('../lib/auth');
const { logActivity } = require('../lib/logger');

const LOCK_DAYS = 30;

/** Whole years between a date of birth (YYYY-MM-DD) and today, or null if the date is not real. */
function ageOn(dob, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null; // 31 Feb etc.
  if (date > now || y < 1900) return null;
  let age = now.getUTCFullYear() - y;
  const hadBirthday = now.getUTCMonth() > mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

exports.confirmAdult = onCall({}, async (request) => {
  const { uid } = requireAuth(request);
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'Please finish setting up your account first.');
  const u = snap.data();
  if (u.adultVerifiedAt) return { ok: true };

  const lockedUntil = u.ageCheckLockedUntil && u.ageCheckLockedUntil.toMillis ? u.ageCheckLockedUntil.toMillis() : 0;
  if (lockedUntil > Date.now()) throw new HttpsError('permission-denied', 'We could not confirm that this account belongs to an adult.');

  const age = ageOn(request.data && request.data.dob);
  if (age === null) throw new HttpsError('invalid-argument', 'Please enter your real date of birth.');
  if (age < 18) {
    await ref.update({ ageCheckLockedUntil: Timestamp.fromMillis(Date.now() + LOCK_DAYS * 86400000) });
    await logActivity({ actorUid: uid, actorLabel: 'user', action: 'adult.check.under18' });
    throw new HttpsError('failed-precondition', 'Accounts are for adults (18 and over). You can still read all of WhyVerse without an account.');
  }
  await ref.update({ adultVerifiedAt: FieldValue.serverTimestamp(), adultMethod: 'dob+email' });
  await logActivity({ actorUid: uid, actorLabel: 'user', action: 'adult.confirmed' });
  return { ok: true };
});

exports._test = { ageOn };
