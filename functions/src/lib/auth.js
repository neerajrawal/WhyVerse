'use strict';
const { HttpsError } = require('../runtime/https');
const { db } = require('./firebase');
const { nowSeconds } = require('./time');

/** Signed-in user (any). */
function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  return request.auth;
}

/**
 * Admin = permanent "admin" claim + a live access-code session ("adminUntil" claim).
 * Enforced here on the server for every admin function; the client is never trusted.
 */
function requireAdmin(request) {
  const auth = requireAuth(request);
  const t = auth.token || {};
  if (t.admin !== true) throw new HttpsError('permission-denied', 'Not allowed.');
  if (!(Number(t.adminUntil) > nowSeconds())) {
    throw new HttpsError('permission-denied', 'Admin session expired. Enter the access code again.');
  }
  return auth;
}

/** Admin account (permanent claim) but NOT necessarily an unlocked session. Used by the code gate. */
function requireAdminAccount(request) {
  const auth = requireAuth(request);
  if (auth.token.admin !== true) throw new HttpsError('permission-denied', 'Not allowed.');
  return auth;
}

/** Email must be verified (Google sign-in is verified automatically). */
function requireVerifiedEmail(request) {
  const auth = requireAuth(request);
  if (auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Please verify your email address first.');
  }
  return auth;
}

/**
 * A usable adult account: signed in, email verified, age confirmed (18+), not banned.
 * Returns { uid, profile }.
 */
async function requireAdult(request) {
  const auth = requireVerifiedEmail(request);
  const snap = await db.doc(`users/${auth.uid}`).get();
  if (!snap.exists || snap.data().ageConfirmed !== true) {
    throw new HttpsError('failed-precondition', 'Please finish setting up your adult account first.');
  }
  const profile = snap.data();
  if (profile.banned === true) {
    throw new HttpsError('permission-denied', 'This account has been blocked.');
  }
  return { uid: auth.uid, profile };
}

/** Adult whose date of birth check passed (needed for writing pages). */
async function requireVerifiedAdult(request) {
  const res = await requireAdult(request);
  if (!res.profile.adultVerifiedAt) {
    throw new HttpsError('failed-precondition', 'Please confirm your date of birth first (Write a page > Confirm you are an adult).');
  }
  return res;
}

module.exports = { requireVerifiedAdult, requireAuth, requireAdmin, requireAdminAccount, requireVerifiedEmail, requireAdult };
