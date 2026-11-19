'use strict';
/**
 * Firestore rules tests. Run with:  npm run test:rules   (starts the Firestore emulator)
 */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, Timestamp } = require('firebase/firestore');

let env;
const future = () => Math.floor(Date.now() / 1000) + 3600;
const past = () => Math.floor(Date.now() / 1000) - 10;

const guest = () => env.unauthenticatedContext().firestore();
const user = (uid = 'u1') => env.authenticatedContext(uid, { email_verified: true }).firestore();
const adminLocked = () => env.authenticatedContext('a1', { admin: true }).firestore();
const adminExpired = () => env.authenticatedContext('a1', { admin: true, adminUntil: past() }).firestore();
const admin = () => env.authenticatedContext('a1', { admin: true, adminUntil: future() }).firestore();
const fakeAdminClaimOnly = () => env.authenticatedContext('x1', { adminUntil: future() }).firestore();

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-whyverse',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'pages/p1'), { status: 'published', ageBand: 'junior', title: 'Volcanoes', category: 'nature', viewCount: 0 });
    await setDoc(doc(db, 'pages/p2'), { status: 'ready', ageBand: 'junior', title: 'Draft page' });
    await setDoc(doc(db, 'pages/p1/private/report'), { safety: 'secret' });
    await setDoc(doc(db, 'categories/space'), { name: 'Space' });
    await setDoc(doc(db, 'settings/public'), { siteName: 'WhyVerse' });
    await setDoc(doc(db, 'settings/main'), { limits: {} });
    await setDoc(doc(db, 'adminSecrets/accessCode'), { hash: 'x' });
    await setDoc(doc(db, 'users/u1'), { displayName: 'Asha', interests: [], ageConfirmed: true, personalisation: false, banned: false, rejectionStreak: 0 });
    await setDoc(doc(db, 'users/u2'), { displayName: 'Ravi', interests: [], ageConfirmed: true, personalisation: true });
    await setDoc(doc(db, 'userSubmissions/s1'), { authorUid: 'u1', status: 'submitted' });
    await setDoc(doc(db, 'userSubmissions/s2'), { authorUid: 'u2', status: 'submitted' });
    await setDoc(doc(db, 'notifications/n1'), { recipientUid: 'u1', read: false, title: 'hi' });
    await setDoc(doc(db, 'notifications/n2'), { audience: 'admin', read: false, title: 'review' });
    await setDoc(doc(db, 'jobs/j1'), { status: 'queued' });
    await setDoc(doc(db, 'reports/r1'), { pageId: 'p1' });
  });
});
test.after(async () => env && env.cleanup());

// ---------- guests ----------
test('guest can list published pages but not unpublished ones', async () => {
  await assertSucceeds(getDocs(query(collection(guest(), 'pages'), where('status', '==', 'published'), where('ageBand', 'in', ['junior', 'all']))));
  await assertFails(getDocs(collection(guest(), 'pages'))); // unfiltered query could leak drafts
  await assertFails(getDoc(doc(guest(), 'pages/p2')));
});
test('guest can read a published page', async () => {
  await assertSucceeds(getDoc(doc(guest(), 'pages/p1')));
});
test('guest cannot write anything, cannot read private page data', async () => {
  await assertFails(setDoc(doc(guest(), 'pages/new'), { status: 'published', ageBand: 'all' }));
  await assertFails(updateDoc(doc(guest(), 'pages/p1'), { viewCount: 999 }));
  await assertFails(getDoc(doc(guest(), 'pages/p1/private/report')));
  await assertFails(setDoc(doc(guest(), 'reports/x'), { pageId: 'p1' }));
});
test('guest reads categories and only the public settings doc', async () => {
  await assertSucceeds(getDoc(doc(guest(), 'categories/space')));
  await assertSucceeds(getDoc(doc(guest(), 'settings/public')));
  await assertFails(getDoc(doc(guest(), 'settings/main')));
});
test('nobody can read secrets or rate buckets', async () => {
  for (const db of [guest(), user(), admin()]) {
    await assertFails(getDoc(doc(db, 'adminSecrets/accessCode')));
    await assertFails(getDoc(doc(db, 'rateBuckets/abc')));
  }
});

// ---------- adult accounts ----------
const newProfile = (extra = {}) => ({
  displayName: 'Meera', interests: ['space'], ageConfirmed: true, personalisation: false,
  privacyAcceptedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});
test('adult can create own profile only with the 18+ confirmation', async () => {
  await assertSucceeds(setDoc(doc(user('u9'), 'users/u9'), newProfile()));
  await assertFails(setDoc(doc(user('u8'), 'users/u8'), newProfile({ ageConfirmed: false })));
  await assertFails(setDoc(doc(user('u7'), 'users/u7'), { displayName: 'No', interests: [], privacyAcceptedAt: serverTimestamp(), createdAt: serverTimestamp() }));
});
test('profile cannot carry server fields or be created for someone else', async () => {
  await assertFails(setDoc(doc(user('u6'), 'users/u6'), newProfile({ banned: false })));
  await assertFails(setDoc(doc(user('u6'), 'users/u5'), newProfile()));
  await assertFails(setDoc(doc(user('u6'), 'users/u6'), newProfile({ displayName: 'A' }))); // too short
  await assertFails(setDoc(doc(user('u6'), 'users/u6'), newProfile({ displayName: 'a@b.com' }))); // no emails as names
});
test('user can edit allowed fields, never banned / rejectionStreak', async () => {
  await assertSucceeds(updateDoc(doc(user('u1'), 'users/u1'), { displayName: 'Asha K', interests: ['space'], updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(user('u1'), 'users/u1'), { banned: false }));
  await assertFails(updateDoc(doc(user('u1'), 'users/u1'), { rejectionStreak: 0 }));
  await assertFails(updateDoc(doc(user('u1'), 'users/u2'), { displayName: 'Hacked' }));
  await assertFails(deleteDoc(doc(user('u1'), 'users/u1')));
});
test('users read only their own profile', async () => {
  await assertSucceeds(getDoc(doc(user('u1'), 'users/u1')));
  await assertFails(getDoc(doc(user('u1'), 'users/u2')));
  await assertFails(getDoc(doc(guest(), 'users/u1')));
});
test('history writes need the personalisation toggle ON; clearing is always allowed', async () => {
  const ev = { type: 'search', term: 'volcano', at: serverTimestamp() };
  await assertFails(setDoc(doc(user('u1'), 'users/u1/history/e1'), ev)); // u1 has it off
  await assertSucceeds(setDoc(doc(user('u2'), 'users/u2/history/e1'), ev)); // u2 has it on
  await assertFails(setDoc(doc(user('u2'), 'users/u2/history/e2'), { ...ev, extra: 'x' }));
  await assertFails(getDoc(doc(user('u1'), 'users/u2/history/e1')));
  await assertSucceeds(deleteDoc(doc(user('u2'), 'users/u2/history/e1')));
});
test('drafts: owner only, cannot carry a status', async () => {
  const draft = { title: 'My page', category: 'space', ageBand: 'all', body: 'hello', updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(user('u1'), 'userDrafts/u1/drafts/d1'), draft));
  await assertFails(setDoc(doc(user('u1'), 'userDrafts/u1/drafts/d2'), { ...draft, status: 'published' }));
  await assertFails(setDoc(doc(user('u2'), 'userDrafts/u1/drafts/d3'), draft));
  await assertFails(getDoc(doc(user('u2'), 'userDrafts/u1/drafts/d1')));
  await assertFails(getDoc(doc(admin(), 'userDrafts/u1/drafts/d1')));
});
test('submissions: author reads own, nobody writes from the client', async () => {
  await assertSucceeds(getDoc(doc(user('u1'), 'userSubmissions/s1')));
  await assertFails(getDoc(doc(user('u1'), 'userSubmissions/s2')));
  await assertFails(updateDoc(doc(user('u1'), 'userSubmissions/s1'), { status: 'published' }));
  await assertFails(setDoc(doc(user('u1'), 'userSubmissions/new'), { authorUid: 'u1', status: 'published' }));
  await assertFails(setDoc(doc(user('u1'), 'pages/mine'), { status: 'published', ageBand: 'all', authorUid: 'u1' }));
});
test('notifications: read own, mark read only', async () => {
  await assertSucceeds(getDoc(doc(user('u1'), 'notifications/n1')));
  await assertFails(getDoc(doc(user('u2'), 'notifications/n1')));
  await assertSucceeds(updateDoc(doc(user('u1'), 'notifications/n1'), { read: true }));
  await assertFails(updateDoc(doc(user('u1'), 'notifications/n1'), { title: 'changed' }));
  await assertFails(getDoc(doc(user('u1'), 'notifications/n2'))); // admin alert
});
test('reading progress is private to the owner and validated', async () => {
  const p = { progress: 40, state: 'reading', saved: false, updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(user('u1'), 'readingProgress/u1/pages/p1'), p));
  await assertFails(setDoc(doc(user('u1'), 'readingProgress/u1/pages/p2'), { ...p, progress: 500 }));
  await assertFails(setDoc(doc(user('u2'), 'readingProgress/u1/pages/p1'), p));
  await assertFails(getDoc(doc(user('u2'), 'readingProgress/u1/pages/p1')));
});

// ---------- admin ----------
test('admin needs BOTH the admin claim and a live code session', async () => {
  await assertFails(getDoc(doc(adminLocked(), 'jobs/j1'))); // no code entered
  await assertFails(getDoc(doc(adminExpired(), 'jobs/j1'))); // session expired
  await assertFails(getDoc(doc(fakeAdminClaimOnly(), 'jobs/j1'))); // adminUntil without admin
  await assertSucceeds(getDoc(doc(admin(), 'jobs/j1')));
  await assertSucceeds(getDoc(doc(admin(), 'reports/r1')));
  await assertSucceeds(getDoc(doc(admin(), 'settings/main')));
  await assertSucceeds(getDoc(doc(admin(), 'pages/p2')));
  await assertSucceeds(getDoc(doc(admin(), 'pages/p1/private/report')));
  await assertSucceeds(getDoc(doc(admin(), 'notifications/n2')));
});
test('even an unlocked admin cannot write from the browser (all writes go via functions)', async () => {
  await assertFails(setDoc(doc(admin(), 'pages/p1'), { status: 'published', ageBand: 'all' }));
  await assertFails(updateDoc(doc(admin(), 'pages/p2'), { status: 'published' }));
  await assertFails(setDoc(doc(admin(), 'settings/main'), { limits: { maxPagesPerDay: 9999 } }));
  await assertFails(setDoc(doc(admin(), 'jobs/j9'), { status: 'queued' }));
  await assertFails(setDoc(doc(admin(), 'adminSecrets/accessCode'), { hash: 'mine' }));
  await assertFails(getDoc(doc(admin(), 'adminSecrets/accessCode')));
});
test('a normal adult cannot read admin data', async () => {
  for (const p of ['jobs/j1', 'reports/r1', 'settings/main', 'pages/p2']) {
    await assertFails(getDoc(doc(user('u1'), p)));
  }
});
