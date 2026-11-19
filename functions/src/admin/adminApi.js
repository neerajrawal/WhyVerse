'use strict';
/**
 * Everything an admin can DO. The browser can read review data (Firestore rules) but every change
 * goes through these functions, which check the live admin session, validate, and write the
 * activity log. Reading is in the rules; writing is only here.
 */
const { onCall, HttpsError } = require('../runtime/https');
const { db, FieldValue } = require('../lib/firebase');
const { callableOptions } = require('../lib/options');
const { requireAdmin } = require('../lib/auth');
const { logActivity } = require('../lib/logger');
const { notifyUser } = require('../lib/notify');
const { uniqueSlug } = require('../lib/slug');
const { markdownLiteToBlocks, cleanLine, readingMinutes, blocksToPlainText } = require('../lib/sanitize');
const { BANDS, DEFAULT_CATEGORIES } = require('../config/defaults');
const { bannedHits } = require('../safety/filter');
const { getSettings, clearSettingsCache } = require('../lib/settings');
const secrets = require('../config/secrets');
const { validateSettingsPatch, validatePublicPatch, pageFromSubmission, TRANSITIONS } = require('./pure');

const opts = (extra = {}) => callableOptions(extra);
const str = (v, n = 200) => String(v == null ? '' : v).slice(0, n);
const id = (v) => { const s = String(v || ''); if (!/^[A-Za-z0-9_-]{1,60}$/.test(s)) throw new HttpsError('invalid-argument', 'Bad id.'); return s; };
const who = (a) => ({ actorUid: a.uid, actorLabel: a.token.email || a.uid });

// ------------------------------------------------------------------ pages
exports.adminPageAction = onCall(opts(), async (request) => {
  const a = requireAdmin(request);
  const { action, patch } = request.data || {};
  const ref = db.doc(`pages/${id(request.data && request.data.pageId)}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Page not found.');
  const page = snap.data();
  const now = FieldValue.serverTimestamp();

  if (TRANSITIONS[action]) {
    const t = TRANSITIONS[action];
    if (!t.from.includes(page.status)) throw new HttpsError('failed-precondition', `A ${page.status} page cannot be ${action}ed.`);
    await ref.update({ status: t.to, updatedAt: now, ...(t.to === 'published' ? { publishedAt: now } : {}) });
  } else if (action === 'feature' || action === 'unfeature') {
    if (page.status !== 'published') throw new HttpsError('failed-precondition', 'Only published pages can be featured.');
    await ref.update({ featured: action === 'feature', updatedAt: now });
  } else if (action === 'edit') {
    const p = patch || {};
    const changes = {};
    if (p.title !== undefined) { const t = cleanLine(p.title, 120); if (t.length < 5) throw new HttpsError('invalid-argument', 'Title is too short.'); changes.title = t; }
    if (p.summary !== undefined) changes.summary = cleanLine(p.summary, 300);
    if (p.ageBand !== undefined) { if (!BANDS.includes(p.ageBand)) throw new HttpsError('invalid-argument', 'Bad audience.'); changes.ageBand = p.ageBand; }
    if (p.category !== undefined) { changes.category = str(p.category, 40); }
    if (p.bodyText !== undefined) {
      const blocks = markdownLiteToBlocks(p.bodyText);
      if (!blocks.length) throw new HttpsError('invalid-argument', 'The page body is empty.');
      changes.body = blocks;
      changes.readingMinutes = readingMinutes(blocksToPlainText(blocks));
    }
    if (!Object.keys(changes).length) throw new HttpsError('invalid-argument', 'Nothing to change.');
    // Keep the previous version so an edit can always be undone.
    await db.collection('pageVersions').add({ pageId: ref.id, version: page.version || 1, title: page.title, summary: page.summary, ageBand: page.ageBand, category: page.category, body: page.body, savedBy: a.uid, createdAt: now });
    await ref.update({ ...changes, version: (page.version || 1) + 1, updatedAt: now });
  } else {
    throw new HttpsError('invalid-argument', 'Unknown action.');
  }
  await logActivity({ ...who(a), action: `page.${action}`, target: ref.id });
  return { ok: true };
});

// ------------------------------------------------------------------ adult submissions
exports.adminReviewSubmission = onCall(opts(), async (request) => {
  const a = requireAdmin(request);
  const { decision, comment, ageBand } = request.data || {};
  const ref = db.doc(`userSubmissions/${id(request.data && request.data.id)}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Submission not found.');
  const sub = snap.data();
  if (!['submitted', 'in_review'].includes(sub.status)) throw new HttpsError('failed-precondition', 'This page has already been decided.');
  const note = cleanLine(comment, 500);
  const now = FieldValue.serverTimestamp();

  if (decision === 'approve') {
    const slug = await uniqueSlug(db, sub.title);
    const pref = db.collection('pages').doc();
    await pref.set({ ...pageFromSubmission(sub, { ageBand }), slug, status: 'published', createdAt: now, updatedAt: now, publishedAt: now });
    await pref.collection('private').doc('report').set({ safety: sub.safetyReport, plagiarism: sub.plagiarism, factCheck: sub.factCheck, flags: sub.flags, submissionId: ref.id, createdAt: now });
    await ref.update({ status: 'published', pageId: pref.id, slug, adminComment: note, updatedAt: now });
    await db.doc(`users/${sub.authorUid}`).update({ rejectionStreak: 0 }).catch(() => {});
    await notifyUser(sub.authorUid, { type: 'submission_published', title: 'Your page is live!', body: `"${sub.title}" is now published on WhyVerse.${note ? ` Note: ${note}` : ''}`, link: `/page/${slug}` });
  } else if (decision === 'changes' || decision === 'reject') {
    if (note.length < 5) throw new HttpsError('invalid-argument', 'Please write a short comment for the author.');
    const status = decision === 'changes' ? 'changes_requested' : 'rejected';
    await ref.update({ status, adminComment: note, updatedAt: now });
    await notifyUser(sub.authorUid, {
      type: `submission_${status}`,
      title: decision === 'changes' ? 'Changes needed on your page' : 'Your page was not accepted',
      body: `"${sub.title}": ${note}`, link: '/my-pages',
    });
  } else {
    throw new HttpsError('invalid-argument', 'Unknown decision.');
  }
  await logActivity({ ...who(a), action: `submission.${decision}`, target: ref.id });
  return { ok: true };
});

// ------------------------------------------------------------------ reports
exports.adminResolveReport = onCall(opts(), async (request) => {
  const a = requireAdmin(request);
  const { action } = request.data || {};
  const ref = db.doc(`reports/${id(request.data && request.data.id)}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Report not found.');
  if (!['dismiss', 'unpublish'].includes(action)) throw new HttpsError('invalid-argument', 'Unknown action.');
  if (action === 'unpublish' && snap.get('pageId')) {
    await db.doc(`pages/${snap.get('pageId')}`).update({ status: 'unpublished', updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
  }
  await ref.update({ status: action === 'dismiss' ? 'dismissed' : 'actioned', resolvedBy: a.uid, resolvedAt: FieldValue.serverTimestamp() });
  await logActivity({ ...who(a), action: `report.${action}`, target: ref.id });
  return { ok: true };
});

// ------------------------------------------------------------------ settings
exports.adminUpdateSettings = onCall(opts(), async (request) => {
  const a = requireAdmin(request);
  const { patch, publicPatch } = request.data || {};
  const v = validateSettingsPatch(patch);
  if (!v.ok) throw new HttpsError('invalid-argument', v.problems.join(' '));
  if (Object.keys(v.nested).length) await db.doc('settings/main').set(v.nested, { merge: true });
  const pub = validatePublicPatch(publicPatch);
  const sub = v.nested.submissions;
  if (sub && typeof sub.requireAuthorApproval === 'boolean') pub.authorApprovalRequired = sub.requireAuthorApproval;
  if (Object.keys(pub).length) await db.doc('settings/public').set(pub, { merge: true });
  clearSettingsCache();
  await logActivity({ ...who(a), action: 'settings.update', meta: { keys: [...Object.keys(patch || {}), ...Object.keys(pub)] } });
  return { ok: true };
});

// ------------------------------------------------------------------ AI pages and jobs
/**
 * Admin asks for an AI-written page on any topic. The same checks as the automatic engine apply,
 * and the page still goes live only if every check is clean (otherwise it waits in Review).
 * runNow: write it right away instead of waiting for the 10-minute queue.
 */
exports.adminGeneratePage = onCall(opts({ timeoutSeconds: 540, memory: '512MiB', secrets: [secrets.GEMINI_API_KEY, secrets.PEXELS_API_KEY] }), async (request) => {
  const a = requireAdmin(request);
  const { topic, category, band, runNow } = request.data || {};
  const t = cleanLine(topic, 120);
  if (t.length < 5) throw new HttpsError('invalid-argument', 'Please type a topic (at least 5 letters).');
  if (!DEFAULT_CATEGORIES.some((c) => c.id === category) && !(await db.doc(`categories/${str(category, 40)}`).get()).exists) throw new HttpsError('invalid-argument', 'Unknown category.');
  if (!BANDS.includes(band)) throw new HttpsError('invalid-argument', 'Choose Everyone, Junior or Teen.');
  const settings = await getSettings();
  const hits = bannedHits(t, settings.safety.bannedTopics);
  if (hits.length) throw new HttpsError('invalid-argument', `That topic contains blocked terms (${hits.join(', ')}).`);

  const store = require('../content/store');
  const jobId = await store.createJob({ type: 'admin', params: { topic: t, category, band, forceReview: true }, status: runNow ? 'running' : 'queued' });
  await logActivity({ ...who(a), action: 'job.enqueue', target: jobId, meta: { topic: t } });
  if (!runNow) return { jobId, status: 'queued' };

  const { runJob } = require('../content/pipeline');
  const { _deps } = require('../content/engine');
  const jobSnap = await db.doc(`jobs/${jobId}`).get();
  // One request must stay under about a minute on the free host: if the page is not finished by then,
  // it is parked and the 30-minute timer completes it.
  const res = await runJob({ id: jobId, ...jobSnap.data() }, _deps(), { budgetMs: 50000 });
  return { jobId, ...res };
});

exports.adminJobAction = onCall(opts(), async (request) => {
  const a = requireAdmin(request);
  const { action } = request.data || {};
  const ref = db.doc(`jobs/${id(request.data && request.data.jobId)}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Job not found.');
  const st = snap.get('status');
  if (action === 'retry' && st === 'failed') await ref.update({ status: 'queued', attempts: 0, error: null, step: 'waiting', updatedAt: FieldValue.serverTimestamp() });
  else if (action === 'cancel' && st === 'queued') await ref.update({ status: 'cancelled', updatedAt: FieldValue.serverTimestamp() });
  else throw new HttpsError('failed-precondition', `A ${st} job cannot be ${action === 'retry' ? 'retried' : 'cancelled'}.`);
  await logActivity({ ...who(a), action: `job.${action}`, target: ref.id });
  return { ok: true };
});

// ------------------------------------------------------------------ authors
exports.adminSetAuthorStatus = onCall(opts(), async (request) => {
  const a = requireAdmin(request);
  const { status, comment } = request.data || {};
  const uid = id(request.data && request.data.uid);
  if (!['approved', 'declined', 'blocked', 'none'].includes(status)) throw new HttpsError('invalid-argument', 'Unknown status.');
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found.');
  const reset = status === 'approved' || status === 'none' ? { rejectionStreak: 0, submitBlockedUntil: FieldValue.delete() } : {};
  await ref.update({ authorStatus: status, ...reset });
  const note = cleanLine(comment, 300);
  const msg = {
    approved: ['You can now write pages', 'An admin approved you as a writer. Press "Write a new page" to start.'],
    declined: ['Writer request not approved', note || 'An admin did not approve this request for now.'],
    blocked: ['Writing turned off', note || 'An admin turned writing off for your account. You can still read everything.'],
    none: ['Writing reset', 'Your writer status was reset.'],
  }[status];
  await notifyUser(uid, { type: `author_${status}`, title: msg[0], body: msg[1], link: '/my-pages' });
  await logActivity({ ...who(a), action: `author.${status}`, target: uid });
  return { ok: true };
});

// ------------------------------------------------------------------ alerts
exports.adminMarkRead = onCall(opts(), async (request) => {
  requireAdmin(request);
  const d = request.data || {};
  if (d.id) { await db.doc(`notifications/${id(d.id)}`).update({ read: true }); return { ok: true }; }
  const snap = await db.collection('notifications').where('audience', '==', 'admin').where('read', '==', false).limit(400).get();
  const batch = db.batch();
  snap.docs.forEach((x) => batch.update(x.ref, { read: true }));
  await batch.commit();
  return { ok: true, count: snap.size };
});
