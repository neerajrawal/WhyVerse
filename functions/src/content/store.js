'use strict';
/** Firestore side of the content engine (jobs, pages, usage). The pipeline only sees this interface. */
const { db, FieldValue, Timestamp } = require('../lib/firebase');
const { uniqueSlug } = require('../lib/slug');
const { jobLog } = require('../lib/logger');
const { notifyAdmins } = require('../lib/notify');
const { recordUsage } = require('../lib/usage');

const LEASE_MS = 9 * 60 * 1000; // a job that silently dies is picked up again after this

async function createJob({ type = 'manual', params, status = 'queued' }) {
  const ref = await db.collection('jobs').add({
    type, status, step: 'waiting', progress: 0, params, attempts: 0, pageId: null, error: null,
    usage: { tokens: 0, searches: 0 }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** Take the oldest queued job (and rescue jobs whose worker died). Returns null when idle. */
async function claimNextJob() {
  const now = Date.now();
  const running = await db.collection('jobs').where('status', '==', 'running').limit(20).get();
  for (const d of running.docs) {
    const lease = d.get('leaseUntil');
    if (lease && lease.toMillis() < now) await d.ref.update({ status: 'queued', step: 'waiting', updatedAt: FieldValue.serverTimestamp() });
  }
  const q = await db.collection('jobs').where('status', '==', 'queued').orderBy('createdAt').limit(1).get();
  if (q.empty) return null;
  const ref = q.docs[0].ref;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('status') !== 'queued') return null; // someone else took it
    tx.update(ref, { status: 'running', leaseUntil: Timestamp.fromMillis(now + LEASE_MS), updatedAt: FieldValue.serverTimestamp() });
    return { id: ref.id, ...snap.data() };
  });
}

const updateJob = (id, patch) => db.doc(`jobs/${id}`).update({ ...patch, updatedAt: FieldValue.serverTimestamp() });

/** Titles of pages and waiting jobs, so topics are never repeated. */
async function existingTitles() {
  const [pages, jobs] = await Promise.all([
    db.collection('pages').select('title').limit(1000).get(),
    db.collection('jobs').where('status', 'in', ['queued', 'running', 'needs_review']).select('params').limit(200).get(),
  ]);
  return [...pages.docs.map((d) => d.get('title')), ...jobs.docs.map((d) => d.get('params.topic'))].filter(Boolean);
}

async function categoryCounts() {
  const snap = await db.collection('pages').where('status', '==', 'published').select('category').limit(2000).get();
  const counts = {};
  snap.docs.forEach((d) => { const c = d.get('category'); counts[c] = (counts[c] || 0) + 1; });
  return counts;
}

async function categories() {
  const snap = await db.collection('categories').orderBy('order').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function queuedCount() {
  const snap = await db.collection('jobs').where('status', '==', 'queued').count().get();
  return snap.data().count;
}

async function createPage({ page, status, report }) {
  const slug = await uniqueSlug(db, page.title);
  const ref = db.collection('pages').doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    ...page, slug, status, createdAt: now, updatedAt: now,
    ...(status === 'published' ? { publishedAt: now } : {}),
  });
  await ref.collection('private').doc('report').set({ ...report, createdAt: now });
  return ref.id;
}

/** Parked draft between the two stages of a job (kept out of the job document, which admins list). */
const saveWork = (id, work) => db.doc(`jobs/${id}/work/state`).set({ ...work, savedAt: FieldValue.serverTimestamp() });
const loadWork = async (id) => { const s = await db.doc(`jobs/${id}/work/state`).get(); return s.exists ? s.data() : null; };
const clearWork = (id) => db.doc(`jobs/${id}/work/state`).delete().catch(() => {});

module.exports = {
  saveWork, loadWork, clearWork,
  createJob, claimNextJob, updateJob, existingTitles, categoryCounts, categories, queuedCount, createPage,
  log: jobLog,
  recordPage: () => recordUsage({ pages: 1 }),
  notifyReview: ({ title, why, pageId }) => notifyAdmins({ type: 'review_needed', title: `Review needed: ${title}`, body: why.join(' ').slice(0, 280), link: `/authority/review/${pageId}` }),
  notifyFailure: ({ topic, error }) => notifyAdmins({ type: 'job_failed', title: `Could not write: ${topic}`, body: String(error).slice(0, 280), link: '/authority/jobs' }),
};
