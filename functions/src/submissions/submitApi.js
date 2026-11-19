'use strict';
/**
 * Adult page submissions.
 *   submitPage        draft -> checks -> userSubmissions (status "submitted", or "rejected")
 *   reopenSubmission  take a submitted / changes-requested page back to a draft to edit it
 * Only 18+ adults with a verified email can use these. Pages are NEVER published from here:
 * an admin approves every adult-written page (Stage 7).
 */
const { onCall, HttpsError } = require('../runtime/https');
const { db, FieldValue } = require('../lib/firebase');
const { callableOptions } = require('../lib/options');
const { requireVerifiedAdult: requireAdult } = require('../lib/auth');
const { getSettings } = require('../lib/settings');
const { dayKey } = require('../lib/time');
const { notifyAdmins, notifyUser } = require('../lib/notify');
const { logActivity } = require('../lib/logger');
const secrets = require('../config/secrets');
const { DEFAULT_CATEGORIES } = require('../config/defaults');
const { validateSubmission } = require('./pure');
const { checkSubmission } = require('./process');
const { strikeAction } = require('./strikes');
const { detectPii } = require('../lib/pii');
const { Timestamp } = require('../lib/firebase');

const PENDING = ['submitted', 'in_review', 'changes_requested'];

async function categoryIds() {
  const snap = await db.collection('categories').get();
  return snap.empty ? DEFAULT_CATEGORIES.map((c) => c.id) : snap.docs.map((d) => d.id);
}

/** Reference texts for copy and fact checks: Wikipedia on the same subject, plus pages we already have. */
async function references(title, category) {
  const { webSearch, fetchPageText } = require('../providers/search');
  const refs = [];
  const found = await webSearch(title, { limit: 4 });
  for (const r of found.results.slice(0, 2)) {
    const text = await fetchPageText(r.url, { maxChars: 12000 });
    if (text) refs.push({ title: r.title, url: r.url, text });
  }
  const mine = await db.collection('pages').where('category', '==', category).where('status', '==', 'published').limit(40).get();
  const { blocksToPlainText } = require('../lib/sanitize');
  mine.docs.forEach((d) => refs.push({ title: d.get('title'), url: `https://whyverse.invalid/page/${d.get('slug')}`, text: blocksToPlainText(d.get('body')) }));
  return refs;
}

function realDeps() {
  return { safety: require('../safety/filter'), factCheck: require('../safety/factcheck').factCheck, references, webReferences: require('../safety/webCheck').webReferences };
}

/** Count this submission against the author's daily allowance (atomic, so parallel clicks cannot bypass it). */
async function reserveSlot(uid, max) {
  const ref = db.doc(`users/${uid}`);
  const today = dayKey();
  await db.runTransaction(async (tx) => {
    const u = (await tx.get(ref)).data() || {};
    const used = u.lastSubmissionDay === today ? (u.submissionsToday || 0) : 0;
    if (used >= max) throw new HttpsError('resource-exhausted', `You can send ${max} pages a day. Please try again tomorrow.`);
    tx.update(ref, { lastSubmissionDay: today, submissionsToday: used + 1 });
  });
}

async function submitCore({ uid, profile, draftId, deps }) {
  const settings = await getSettings();
  const pub = await db.doc('settings/public').get();
  if (pub.exists && pub.get('submissionsOpen') === false) throw new HttpsError('failed-precondition', 'Sending pages is switched off for now. Please try again later.');
  if (settings.submissions.requireAuthorApproval) {
    const st = profile.authorStatus || 'none';
    if (st === 'blocked') throw new HttpsError('permission-denied', 'Writing is turned off for your account. An admin can review this.');
    if (st !== 'approved') throw new HttpsError('failed-precondition', 'An admin needs to approve you as a writer first. You can ask from the Write page.');
  }
  const until = profile.submitBlockedUntil && profile.submitBlockedUntil.toMillis ? profile.submitBlockedUntil.toMillis() : 0;
  if (until > Date.now()) {
    const hrs = Math.max(1, Math.ceil((until - Date.now()) / 3600000));
    throw new HttpsError('resource-exhausted', `Writing is paused for about ${hrs} more hour${hrs === 1 ? '' : 's'}.`);
  }
  const draftRef = db.doc(`userDrafts/${uid}/drafts/${draftId}`);
  const snap = await draftRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'We could not find that draft.');
  const draft = snap.data();

  const v = validateSubmission(draft, { categoryIds: await categoryIds(), maxWords: settings.submissions.maxWords });
  if (!v.ok) throw new HttpsError('invalid-argument', v.problems.join(' '));

  const pending = await db.collection('userSubmissions').where('authorUid', '==', uid).where('status', 'in', PENDING).count().get();
  if (pending.data().count >= settings.submissions.maxPending) {
    throw new HttpsError('resource-exhausted', 'You have a lot of pages waiting already. Please wait for some to be reviewed.');
  }
  await reserveSlot(uid, settings.submissions.maxPerDay);

  const res = await checkSubmission({ clean: v.clean, deps });
  const status = res.decision.status;
  const subRef = db.collection('userSubmissions').doc();
  await subRef.set({
    authorUid: uid, authorName: profile.displayName || 'A WhyVerse reader',
    title: v.clean.title, category: v.clean.category, ageBand: v.clean.ageBand,
    bodyBlocks: v.clean.blocks, draftText: String(draft.body).slice(0, 15000), words: v.clean.words, readingMinutes: v.clean.readingMinutes,
    status, safetyReport: res.safetyReport, plagiarism: res.plagiarism, factCheck: res.factCheck, flags: res.decision.flags,
    adminComment: status === 'rejected' ? res.decision.reasons.join(' ') : '',
    pageId: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  await draftRef.delete();

  if (status === 'rejected') {
    const act = strikeAction((profile.rejectionStreak || 0) + 1, settings.submissions.strikes);
    await db.doc(`users/${uid}`).update({
      rejectionStreak: act.streak,
      ...(act.pauseHours ? { submitBlockedUntil: Timestamp.fromMillis(Date.now() + act.pauseHours * 3600000) } : {}),
      ...(act.block ? { authorStatus: 'blocked' } : {}),
    });
    await notifyUser(uid, { type: `strike_${act.level}`, title: act.title, body: `"${v.clean.title}": ${res.decision.reasons.join(' ')} ${act.body}`.slice(0, 500), link: '/my-pages' });
    if (act.level === 'final_warning' || act.level === 'suspended' || act.block) {
      await notifyAdmins({ type: 'submission', title: `Author reached "${act.level.replace('_', ' ')}"`, body: `${act.streak} automatic rejections in a row.`, link: '/authority/users' });
    }
  } else {
    await notifyUser(uid, { type: 'submission_received', title: 'We received your page', body: `"${v.clean.title}" is waiting for a grown-up to review it.`, link: '/my-pages' });
    await notifyAdmins({ type: 'submission', title: `New page to review: ${v.clean.title}`, body: res.decision.flags.join(' ').slice(0, 280) || 'Automatic checks found nothing unusual.', link: `/authority/submissions/${subRef.id}` });
  }
  await logActivity({ actorUid: uid, actorLabel: 'author', action: `submission.${status}`, target: subRef.id });
  return { id: subRef.id, status, reasons: res.decision.reasons };
}

exports.submitPage = onCall(
  callableOptions({ timeoutSeconds: 120, memory: '512MiB', secrets: [secrets.GEMINI_API_KEY] }),
  async (request) => {
    const { uid, profile } = await requireAdult(request);
    const draftId = String((request.data && request.data.draftId) || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(draftId)) throw new HttpsError('invalid-argument', 'Missing draft.');
    return submitCore({ uid, profile, draftId, deps: realDeps() });
  },
);

/** requestAuthorAccess({ note }) – an adult asks an admin to approve them as a writer. */
exports.requestAuthorAccess = onCall(callableOptions({}), async (request) => {
  const { uid, profile } = await requireAdult(request);
  const st = profile.authorStatus || 'none';
  if (st === 'approved') return { status: 'approved' };
  if (st === 'blocked') throw new HttpsError('permission-denied', 'Writing is turned off for your account.');
  if (st === 'requested') return { status: 'requested' };
  const note = String((request.data && request.data.note) || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (note.length < 10) throw new HttpsError('invalid-argument', 'Please tell us a little about what you would like to write (at least 10 letters).');
  if (detectPii(note).found) throw new HttpsError('invalid-argument', 'Please remove personal details (emails, phone numbers, links) from your note.');
  await db.doc(`users/${uid}`).update({ authorStatus: 'requested', authorNote: note, authorRequestedAt: FieldValue.serverTimestamp() });
  await notifyAdmins({ type: 'author_request', title: `${profile.displayName || 'Someone'} asks to write pages`, body: note.slice(0, 280), link: '/authority/users' });
  await logActivity({ actorUid: uid, actorLabel: 'author', action: 'author.requested' });
  return { status: 'requested' };
});

exports.reopenSubmission = onCall(callableOptions({}), async (request) => {
  const { uid } = await requireAdult(request);
  const id = String((request.data && request.data.submissionId) || '');
  if (!/^[A-Za-z0-9]{1,40}$/.test(id)) throw new HttpsError('invalid-argument', 'Missing page.');
  const ref = db.doc(`userSubmissions/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get('authorUid') !== uid) throw new HttpsError('not-found', 'We could not find that page.');
  if (!['submitted', 'changes_requested'].includes(snap.get('status'))) {
    throw new HttpsError('failed-precondition', 'This page can no longer be edited.');
  }
  const d = snap.data();
  const draftRef = db.collection(`userDrafts/${uid}/drafts`).doc();
  await draftRef.set({ title: d.title, category: d.category, ageBand: d.ageBand, body: d.draftText || '', updatedAt: FieldValue.serverTimestamp() });
  await ref.delete();
  return { draftId: draftRef.id };
});

exports._test = { submitCore, reserveSlot };
