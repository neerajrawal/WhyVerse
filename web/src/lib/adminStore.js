// Everything the admin portal reads and changes. Two flavours, like accountStore:
//   - Firebase (real): reads come from Firestore (the rules allow them only for an unlocked admin);
//     every change goes through a server function, which re-checks the live admin session.
//   - Demo (VITE_DEMO=1): a small in-memory sample so the screens can be tried with no backend.
import { config } from '../config.js';
import { backend, authBackend, callFunction } from '../backend.js';

const toDate = (v) => (!v ? null : v instanceof Date ? v : typeof v.toDate === 'function' ? v.toDate() : new Date(v));
const clean = (id, d) => {
  const o = { id };
  for (const [k, v] of Object.entries(d || {})) o[k] = v && typeof v.toDate === 'function' ? v.toDate() : v;
  return o;
};
export const DEMO_ADMIN_EMAIL = 'admin@whyverse.demo';

// ======================================================================= DEMO
const ago = (h) => new Date(Date.now() - h * 3600000);
const D = {
  unlocked: null,
  settings: {
    limits: { maxPagesPerDay: 10, maxSearchCallsPerDay: 200, maxLlmTokensPerDay: 2000000 },
    submissions: { maxPerDay: 2, maxPending: 10, maxWords: 1500, requireAuthorApproval: true },
    automation: { enabled: true, pagesPerRun: 2, schedule: 'daily', defaultBand: 'all' },
    sources: { webCheck: true, blockedDomains: [] },
    safety: { bannedTopics: [] },
    llm: { writeModel: '', checkModel: '' },
  },
  pub: { submissionsOpen: true, maintenance: false },
  pages: [
    { id: 'p1', title: 'Why do volcanoes erupt?', ageBand: 'teen', category: 'earth', status: 'ready', source: 'ai', summary: 'Pressure, magma and gas.', createdAt: ago(3), reason: 'Fact check found one claim to confirm.' },
    { id: 'p2', title: 'Why is the sky blue?', ageBand: 'all', category: 'space', status: 'published', source: 'ai', featured: false, createdAt: ago(30) },
    { id: 'p3', title: 'How do bees make honey?', ageBand: 'junior', category: 'animals', status: 'published', source: 'user', featured: true, createdAt: ago(60) },
  ],
  submissions: [
    { id: 's1', title: 'How rainbows form', authorName: 'Asha', authorUid: 'u1', ageBand: 'junior', category: 'science', status: 'submitted', createdAt: ago(5), words: 320, flags: [], safety: 'clean', plagiarism: 'No close matches found.', factCheck: 'No problems found.' },
  ],
  reports: [{ id: 'r1', pageId: 'p2', reason: 'The second paragraph is confusing.', status: 'open', createdAt: ago(8) }],
  jobs: [{ id: 'j1', type: 'auto', status: 'queued', params: { topic: 'How do magnets work?' }, step: 'waiting', createdAt: ago(1) }, { id: 'j2', type: 'admin', status: 'failed', params: { topic: 'Why is salt in the sea?' }, error: 'The writer did not answer in time.', createdAt: ago(9) }],
  users: [{ id: 'u1', displayName: 'Asha', authorStatus: 'requested', rejectionStreak: 0, adultVerifiedAt: ago(100), createdAt: ago(100) }, { id: 'u2', displayName: 'Ravi', authorStatus: 'approved', rejectionStreak: 2, adultVerifiedAt: ago(400), createdAt: ago(400) }],
  activity: [{ id: 'a1', actorLabel: DEMO_ADMIN_EMAIL, action: 'settings.update', target: '', createdAt: ago(20) }],
  notifications: [{ id: 'n1', title: 'A new page is waiting', body: '"How rainbows form" passed the checks.', read: false, createdAt: ago(5) }],
  usage: { pages: 4, searchCalls: 31, llmTokens: 210000 },
};
let seq = 100;
const log = (action, target) => D.activity.unshift({ id: `a${++seq}`, actorLabel: DEMO_ADMIN_EMAIL, action, target: target || '', createdAt: new Date() });
const find = (list, id) => { const x = list.find((i) => i.id === id); if (!x) throw Object.assign(new Error('Not found.'), { code: 'not-found' }); return x; };
const setPath = (o, path, v) => { const k = path.split('.'); k.slice(0, -1).forEach((p) => { o = o[p] = o[p] || {}; }); o[k.at(-1)] = v; };

const demo = {
  async status(user) {
    const isAdmin = Boolean(user && user.email === DEMO_ADMIN_EMAIL);
    return { isAdmin, unlocked: isAdmin && D.unlocked && D.unlocked > Date.now() ? D.unlocked : 0 };
  },
  async verifyCode(code) {
    if (String(code) !== '123456') throw Object.assign(new Error('That code is not right. (Demo code: 123456)'), { code: 'permission-denied' });
    D.unlocked = Date.now() + 2 * 3600000;
    return { expiresAt: Math.floor(D.unlocked / 1000) };
  },
  async endSession() { D.unlocked = null; },
  async dashboard() {
    return {
      usage: { ...D.usage },
      limits: D.settings.limits,
      counts: { ready: D.pages.filter((p) => p.status === 'ready').length, submissions: D.submissions.filter((s) => ['submitted', 'in_review'].includes(s.status)).length, reports: D.reports.filter((r) => r.status === 'open').length, jobsFailed: D.jobs.filter((j) => j.status === 'failed').length, authorRequests: D.users.filter((u) => u.authorStatus === 'requested').length, unread: D.notifications.filter((n) => !n.read).length },
      auto: { ...D.settings.automation },
    };
  },
  async list(kind) {
    const map = {
      pages: D.pages.filter((p) => ['ready', 'published', 'unpublished'].includes(p.status)),
      submissions: D.submissions.filter((s) => ['submitted', 'in_review'].includes(s.status)),
      reports: D.reports.filter((r) => r.status === 'open'),
      jobs: D.jobs, users: D.users.filter((u) => ['requested', 'approved', 'blocked'].includes(u.authorStatus)),
      activity: D.activity, notifications: D.notifications,
    };
    return structuredClone(map[kind] || []);
  },
  async getSettings() { return { main: structuredClone(D.settings), pub: { ...D.pub } }; },
  async pageAction(pageId, action, patch) {
    const p = find(D.pages, pageId);
    if (action === 'publish') p.status = 'published';
    else if (action === 'unpublish') p.status = 'unpublished';
    else if (action === 'reject') p.status = 'rejected';
    else if (action === 'feature' || action === 'unfeature') p.featured = action === 'feature';
    else if (action === 'edit') Object.assign(p, patch);
    log(`page.${action}`, pageId);
  },
  async reviewSubmission(id, decision, comment, ageBand) {
    const s = find(D.submissions, id);
    if (decision !== 'approve' && String(comment || '').trim().length < 5) throw Object.assign(new Error('Please write a short comment for the author.'), { code: 'invalid-argument' });
    s.status = decision === 'approve' ? 'published' : decision === 'changes' ? 'changes_requested' : 'rejected';
    if (decision === 'approve') D.pages.unshift({ id: `p${++seq}`, title: s.title, ageBand: ageBand || s.ageBand, category: s.category, status: 'published', source: 'user', createdAt: new Date() });
    log(`submission.${decision}`, id);
  },
  async resolveReport(id, action) { find(D.reports, id).status = action === 'dismiss' ? 'dismissed' : 'actioned'; log(`report.${action}`, id); },
  async generate({ topic, category, band, runNow }) {
    if (String(topic).trim().length < 5) throw Object.assign(new Error('Please type a topic (at least 5 letters).'), { code: 'invalid-argument' });
    const id = `j${++seq}`;
    D.jobs.unshift({ id, type: 'admin', status: runNow ? 'done' : 'queued', params: { topic, category, band }, step: runNow ? 'ready' : 'waiting', createdAt: new Date() });
    if (runNow) D.pages.unshift({ id: `p${++seq}`, title: topic, ageBand: band, category, status: 'ready', source: 'ai', createdAt: new Date(), reason: 'Admin-requested pages always wait for you.' });
    log('job.enqueue', id);
    return { jobId: id, status: runNow ? 'review' : 'queued' };
  },
  async jobAction(jobId, action) { const j = find(D.jobs, jobId); j.status = action === 'retry' ? 'queued' : 'cancelled'; j.error = null; log(`job.${action}`, jobId); },
  async setAuthor(uid, status, comment) { const u = find(D.users, uid); u.authorStatus = status; if (status === 'approved' || status === 'none') u.rejectionStreak = 0; log(`author.${status}`, uid); void comment; },
  async updateSettings(patch, publicPatch) {
    for (const [k, v] of Object.entries(patch || {})) setPath(D.settings, k, v);
    Object.assign(D.pub, publicPatch || {});
    log('settings.update');
  },
  async markRead(id) { D.notifications.forEach((n) => { if (!id || n.id === id) n.read = true; }); },
  async rotateCode() { log('admin.code.rotate'); },
};

// ======================================================================= FIREBASE
const startOfDay = () => new Date().toISOString().slice(0, 10);

const fb = {
  async status(user) {
    if (!user) return { isAdmin: false, unlocked: 0 };
    const { auth } = await authBackend();
    const r = await auth.currentUser.getIdTokenResult();
    const isAdmin = r.claims.admin === true;
    const until = Number(r.claims.adminUntil || 0) * 1000;
    return { isAdmin, unlocked: isAdmin && until > Date.now() ? until : 0 };
  },
  async verifyCode(code) {
    const res = await callFunction('adminVerifyCode', { code });
    const { auth } = await authBackend();
    await auth.currentUser.getIdToken(true); // pick up the new "unlocked" claim
    return res;
  },
  async endSession() {
    await callFunction('adminEndSession', {});
    const { auth } = await authBackend();
    await auth.currentUser.getIdToken(true);
  },
  async _docs(col, { where = [], order = null, max = 100 } = {}) {
    const { db, fs } = await backend();
    // Filtered lists are sorted here, not in the query, so no composite indexes are needed.
    const q = [...where.map(([f, op, v]) => fs.where(f, op, v)), ...(order && !where.length ? [fs.orderBy(order, 'desc')] : []), fs.limit(where.length ? 300 : max)];
    const snap = await fs.getDocs(fs.query(fs.collection(db, col), ...q));
    const rows = snap.docs.map((d) => clean(d.id, d.data()));
    if (order && where.length) rows.sort((a, b) => (toDate(b[order]) || 0) - (toDate(a[order]) || 0));
    return rows.slice(0, max);
  },
  async dashboard() {
    const { db, fs } = await backend();
    const count = async (col, where) => (await fs.getCountFromServer(fs.query(fs.collection(db, col), ...where.map(([f, op, v]) => fs.where(f, op, v))))).data().count;
    const [ready, subs, reports, failed, requests, unread, usage, main] = await Promise.all([
      count('pages', [['status', '==', 'ready']]),
      count('userSubmissions', [['status', 'in', ['submitted', 'in_review']]]),
      count('reports', [['status', '==', 'open']]),
      count('jobs', [['status', '==', 'failed']]),
      count('users', [['authorStatus', '==', 'requested']]),
      count('notifications', [['audience', '==', 'admin'], ['read', '==', false]]),
      fs.getDoc(fs.doc(db, 'usage', startOfDay())),
      fs.getDoc(fs.doc(db, 'settings', 'main')),
    ]);
    const s = main.exists() ? main.data() : {};
    const u = usage.exists() ? usage.data() : {};
    return {
      usage: { pages: u.pages || 0, searchCalls: u.searchCalls || 0, llmTokens: u.llmTokens || 0 },
      limits: s.limits || {},
      counts: { ready, submissions: subs, reports, jobsFailed: failed, authorRequests: requests, unread },
      auto: s.automation || {},
    };
  },
  async list(kind) {
    const q = {
      pages: ['pages', { where: [['status', 'in', ['ready', 'published', 'unpublished']]], order: 'updatedAt' }],
      submissions: ['userSubmissions', { where: [['status', 'in', ['submitted', 'in_review']]], order: 'createdAt' }],
      reports: ['reports', { where: [['status', '==', 'open']], order: 'createdAt' }],
      jobs: ['jobs', { order: 'createdAt' }],
      users: ['users', { where: [['authorStatus', 'in', ['requested', 'approved', 'blocked']]], order: 'createdAt' }],
      activity: ['activityLog', { order: 'createdAt', max: 100 }],
      notifications: ['notifications', { where: [['audience', '==', 'admin']], order: 'createdAt', max: 50 }],
    }[kind];
    if (!q) return [];
    return fb._docs(q[0], q[1]);
  },
  async getSettings() {
    const { db, fs } = await backend();
    const [m, p] = await Promise.all([fs.getDoc(fs.doc(db, 'settings', 'main')), fs.getDoc(fs.doc(db, 'settings', 'public'))]);
    return { main: m.exists() ? m.data() : {}, pub: p.exists() ? p.data() : {} };
  },
  pageAction: (pageId, action, patch) => callFunction('adminPageAction', { pageId, action, patch }),
  reviewSubmission: (id, decision, comment, ageBand) => callFunction('adminReviewSubmission', { id, decision, comment, ageBand }),
  resolveReport: (id, action) => callFunction('adminResolveReport', { id, action }),
  generate: (d) => callFunction('adminGeneratePage', d),
  jobAction: (jobId, action) => callFunction('adminJobAction', { jobId, action }),
  setAuthor: (uid, status, comment) => callFunction('adminSetAuthorStatus', { uid, status, comment }),
  updateSettings: (patch, publicPatch) => callFunction('adminUpdateSettings', { patch, publicPatch }),
  markRead: (id) => callFunction('adminMarkRead', id ? { id } : {}),
  rotateCode: (currentCode, newCode) => callFunction('adminRotateCode', { currentCode, newCode }),
};

export const adminStore = config.demo ? demo : fb;
export { toDate };
