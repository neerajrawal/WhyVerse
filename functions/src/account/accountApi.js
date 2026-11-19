'use strict';
/**
 * Adult account data controls (DPDP: access / portability and erasure).
 *   exportMyData     -> everything WhyVerse holds about the signed-in adult, as JSON
 *   deleteMyAccount  -> removes the account and all data linked to it
 */
const crypto = require('crypto');
const { onCall, HttpsError } = require('../runtime/https');
const { db, auth, FieldValue, Timestamp } = require('../lib/firebase');
const { callableOptions } = require('../lib/options');
const { requireAuth } = require('../lib/auth');
const { logActivity } = require('../lib/logger');

const MAX_DOCS = 2000;
const RECENT_LOGIN_MS = 10 * 60 * 1000;

/** Firestore Timestamps -> ISO strings so the export is plain JSON. */
function plain(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

async function docsOf(query) {
  const snap = await query.limit(MAX_DOCS).get();
  return snap.docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
}

exports.exportMyData = onCall(callableOptions({ timeoutSeconds: 60, memory: '512MiB' }), async (request) => {
  const { uid, token } = requireAuth(request);

  const [profile, history, progress, drafts, submissions, notifications, chats, pages] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    docsOf(db.collection(`users/${uid}/history`)),
    docsOf(db.collection(`readingProgress/${uid}/pages`)),
    docsOf(db.collection(`userDrafts/${uid}/drafts`)),
    docsOf(db.collection('userSubmissions').where('authorUid', '==', uid)),
    docsOf(db.collection('notifications').where('recipientUid', '==', uid)),
    docsOf(db.collection(`chats/${uid}/threads`)),
    docsOf(db.collection('pages').where('authorUid', '==', uid)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: { uid, email: token.email || null, emailVerified: token.email_verified === true },
    profile: profile.exists ? plain(profile.data()) : null,
    history,
    readingProgress: progress,
    drafts,
    submissions,
    publishedPages: pages.map((p) => ({ id: p.id, title: p.title, slug: p.slug, status: p.status })),
    notifications,
    savedChats: chats,
  };
});

async function deleteByQuery(query) {
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

exports.deleteMyAccount = onCall(callableOptions({ timeoutSeconds: 300, memory: '512MiB' }), async (request) => {
  const { uid, token } = requireAuth(request);

  if (token.admin === true) {
    throw new HttpsError('failed-precondition', 'Admin accounts cannot be deleted here. Ask the site owner to remove admin access first.');
  }
  // Destructive action: the person must have signed in within the last 10 minutes.
  const authTimeMs = Number(token.auth_time) * 1000;
  if (!(authTimeMs > Date.now() - RECENT_LOGIN_MS)) {
    throw new HttpsError('failed-precondition', 'recent-login-required');
  }
  if (!request.data || request.data.confirm !== 'DELETE') {
    throw new HttpsError('invalid-argument', 'Type DELETE to confirm.');
  }

  // 1. Personal data
  await Promise.all([
    db.recursiveDelete(db.doc(`users/${uid}`)),
    db.recursiveDelete(db.doc(`readingProgress/${uid}`)),
    db.recursiveDelete(db.doc(`userDrafts/${uid}`)),
    db.recursiveDelete(db.doc(`chats/${uid}`)),
    deleteByQuery(db.collection('notifications').where('recipientUid', '==', uid)),
    deleteByQuery(db.collection('userSubmissions').where('authorUid', '==', uid)),
  ]);

  // 2. Pages the person wrote are taken down and no longer carry their name.
  const pages = await db.collection('pages').where('authorUid', '==', uid).get();
  await Promise.all(pages.docs.map((d) => d.ref.update({
    status: 'unpublished',
    unpublishedReason: 'author_deleted_account',
    authorUid: FieldValue.delete(),
    authorName: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  })));

  // 3. The sign-in account itself, last.
  await auth.deleteUser(uid);

  // The log keeps only a one-way hash, never the uid or email.
  const hash = crypto.createHash('sha256').update(uid).digest('hex').slice(0, 12);
  await logActivity({ action: 'account.deleted', target: hash, meta: { pagesUnpublished: pages.size } });
  return { ok: true };
});
