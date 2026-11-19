// Everything an adult account does with the backend lives here, in two flavours:
//   - Firebase (real): Auth, Firestore, Cloud Functions
//   - Demo (VITE_DEMO=1): stored in this browser only, so the design can be tried with no backend
// Views never touch Firebase directly; they call this file through state/auth.js.
import { ageOn } from './age.js';
import { config } from '../config.js';
import { backend, authBackend, callFunction } from '../backend.js';

const HISTORY_DAYS = 180; // personalisation history is deleted automatically after this long
const dayMs = 86400000;

// ======================================================================= shared helpers
const toDate = (v) => (!v ? null : v instanceof Date ? v : typeof v.toDate === 'function' ? v.toDate() : new Date(v));

function normProgress(id, d) {
  return {
    pageId: id,
    progress: Number(d.progress) || 0,
    state: ['reading', 'finished', 'none'].includes(d.state) ? d.state : 'none',
    saved: d.saved === true,
    title: String(d.title || ''),
    slug: String(d.slug || ''),
    updatedAt: toDate(d.updatedAt),
  };
}

// ======================================================================= DEMO
const mem = new Map();
const kv = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(`whyverse.demo.${k}`);
      return v == null ? (mem.has(k) ? mem.get(k) : fallback) : JSON.parse(v);
    } catch { return mem.has(k) ? mem.get(k) : fallback; }
  },
  set(k, v) {
    mem.set(k, v);
    try { localStorage.setItem(`whyverse.demo.${k}`, JSON.stringify(v)); } catch { /* ignore */ }
  },
  del(k) {
    mem.delete(k);
    try { localStorage.removeItem(`whyverse.demo.${k}`); } catch { /* ignore */ }
  },
};

const demoWatchers = new Set();
const emitDemo = () => demoWatchers.forEach((fn) => fn(kv.get('user', null)));

function demoUserFor(email, provider) {
  const id = `demo-${btoa(unescape(encodeURIComponent(email))).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  return { uid: id, email, emailVerified: provider === 'google', provider };
}

const demo = {
  watchAuth(cb) {
    demoWatchers.add(cb);
    Promise.resolve().then(() => cb(kv.get('user', null)));
    return () => demoWatchers.delete(cb);
  },
  async signInGoogle() { return demo._set(demoUserFor('demo.parent@example.com', 'google')); },
  async signInEmail(email) { return demo._set(demoUserFor(email, 'password')); },
  async signUpEmail(email) { return demo._set(demoUserFor(email, 'password')); },
  async resetPassword() { return true; },
  async resendVerification() { return true; },
  async reloadUser() {
    const u = kv.get('user', null);
    if (u) { u.emailVerified = true; kv.set('user', u); }
    return u;
  },
  async reauth() { return true; },
  async signOut() { kv.del('user'); emitDemo(); },
  _set(u) { kv.set('user', u); emitDemo(); return u; },

  async getProfile(uid) { return kv.get(`profile.${uid}`, null); },
  async createProfile(uid, data) {
    const p = { ...data, ageConfirmed: true, createdAt: new Date().toISOString() };
    kv.set(`profile.${uid}`, p);
    kv.set(`notes.${uid}`, [{ id: 'welcome', title: 'Welcome to WhyVerse!', body: 'Your account is ready. Explore For You and My Reading.', link: '/for-you', read: false, createdAt: new Date().toISOString() }]);
    return p;
  },
  async confirmAdult(uid, dob) {
    // Demo only: the real check runs on the server. The date is used and not kept.
    const age = ageOn(dob);
    if (age === null) throw Object.assign(new Error('Please enter your real date of birth.'), { code: 'invalid-argument' });
    if (age < 18) throw Object.assign(new Error('Accounts are for adults (18 and over). You can still read all of WhyVerse without an account.'), { code: 'failed-precondition' });
    return demo.updateProfile(uid, { adultVerifiedAt: new Date().toISOString() });
  },
  async requestAuthor(uid, note) {
    if (String(note).trim().length < 10) throw new Error('Please tell us a little about what you would like to write (at least 10 letters).');
    return demo.updateProfile(uid, { authorStatus: 'approved' }); // demo only: no admin to approve
  },
  async updateProfile(uid, patch) {
    const p = { ...(kv.get(`profile.${uid}`, {})), ...patch };
    kv.set(`profile.${uid}`, p);
    return p;
  },
  async logHistory(uid, ev) {
    const list = kv.get(`history.${uid}`, []);
    list.unshift({ ...ev, at: new Date().toISOString() });
    kv.set(`history.${uid}`, list.slice(0, 200));
  },
  async listHistory(uid, n = 100) {
    return kv.get(`history.${uid}`, []).slice(0, n).map((e) => ({ ...e, at: new Date(e.at) }));
  },
  async clearHistory(uid) { kv.del(`history.${uid}`); },
  async listProgress(uid) {
    const all = kv.get(`progress.${uid}`, {});
    return Object.entries(all).map(([id, d]) => normProgress(id, d)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  async getProgress(uid, pageId) {
    const d = kv.get(`progress.${uid}`, {})[pageId];
    return d ? normProgress(pageId, d) : null;
  },
  async setProgress(uid, pageId, data) {
    const all = kv.get(`progress.${uid}`, {});
    all[pageId] = { ...data, updatedAt: new Date().toISOString() };
    kv.set(`progress.${uid}`, all);
  },
  async listNotifications(uid) {
    return kv.get(`notes.${uid}`, []).map((n) => ({ ...n, createdAt: new Date(n.createdAt) }));
  },
  async markNotificationRead(uid, id) {
    kv.set(`notes.${uid}`, kv.get(`notes.${uid}`, []).map((n) => (n.id === id ? { ...n, read: true } : n)));
  },
  async listMyPages(uid) {
    const rev = (a) => a.map((x) => ({ ...x, updatedAt: x.updatedAt && new Date(x.updatedAt), createdAt: x.createdAt && new Date(x.createdAt) }));
    return { drafts: rev(kv.get(`drafts.${uid}`, [])), submissions: rev(kv.get(`subs.${uid}`, [])) };
  },
  async getDraft(uid, id) { return kv.get(`drafts.${uid}`, []).find((d) => d.id === id) || null; },
  async saveDraft(uid, id, data) {
    const list = kv.get(`drafts.${uid}`, []);
    const rec = { id: id || `d${Date.now().toString(36)}`, title: data.title, category: data.category, ageBand: data.ageBand, body: data.body, updatedAt: new Date().toISOString() };
    kv.set(`drafts.${uid}`, [rec, ...list.filter((d) => d.id !== rec.id)]);
    return rec.id;
  },
  async deleteDraft(uid, id) { kv.set(`drafts.${uid}`, kv.get(`drafts.${uid}`, []).filter((d) => d.id !== id)); },
  async submitDraft(uid, id) {
    // Demo only: a tiny version of the server checks so the screen can be tried without Firebase.
    const d = await demo.getDraft(uid, id);
    if (!d) throw new Error('We could not find that draft.');
    const words = String(d.body).trim().split(/\s+/).filter(Boolean).length;
    if (words < 150) throw new Error(`Your page has ${words} words. Please write at least 150.`);
    const sub = { id: `s${Date.now().toString(36)}`, title: d.title, category: d.category, ageBand: d.ageBand, draftText: d.body, status: 'submitted', adminComment: '', createdAt: new Date().toISOString() };
    kv.set(`subs.${uid}`, [sub, ...kv.get(`subs.${uid}`, [])]);
    await demo.deleteDraft(uid, id);
    return { id: sub.id, status: 'submitted', reasons: [] };
  },
  async reopenSubmission(uid, submissionId) {
    const sub = kv.get(`subs.${uid}`, []).find((x) => x.id === submissionId);
    if (!sub || !['submitted', 'changes_requested'].includes(sub.status)) throw new Error('This page can no longer be edited.');
    kv.set(`subs.${uid}`, kv.get(`subs.${uid}`, []).filter((x) => x.id !== submissionId));
    return demo.saveDraft(uid, null, { title: sub.title, category: sub.category, ageBand: sub.ageBand, body: sub.draftText });
  },
  async exportData(uid) {
    return {
      exportedAt: new Date().toISOString(),
      note: 'Demo mode: this data lives only in this browser.',
      account: kv.get('user', null),
      profile: kv.get(`profile.${uid}`, null),
      history: kv.get(`history.${uid}`, []),
      readingProgress: kv.get(`progress.${uid}`, {}),
      notifications: kv.get(`notes.${uid}`, []),
    };
  },
  async deleteAccount(uid) {
    ['profile', 'history', 'progress', 'notes'].forEach((k) => kv.del(`${k}.${uid}`));
    kv.del('user');
    emitDemo();
  },
};

// ======================================================================= FIREBASE
const fb = {
  watchAuth(cb) {
    let unsub = () => {};
    let cancelled = false;
    authBackend().then(({ auth, authMod }) => {
      if (cancelled) return;
      unsub = authMod.onAuthStateChanged(auth, (u) => cb(u ? fb._user(u) : null));
    });
    return () => { cancelled = true; unsub(); };
  },
  _user(u) {
    return {
      uid: u.uid,
      email: u.email || '',
      emailVerified: u.emailVerified === true,
      provider: (u.providerData[0] && u.providerData[0].providerId) === 'google.com' ? 'google' : 'password',
    };
  },
  async signInGoogle() {
    const { auth, authMod } = await authBackend();
    const provider = new authMod.GoogleAuthProvider();
    try {
      const res = await authMod.signInWithPopup(auth, provider);
      return fb._user(res.user);
    } catch (err) {
      if (err.code === 'auth/popup-blocked') {
        try { localStorage.setItem('whyverse.signedin', '1'); } catch { /* ignore */ }
        await authMod.signInWithRedirect(auth, provider); // page reloads, then onAuthStateChanged fires
        return null;
      }
      throw err;
    }
  },
  async signInEmail(email, password) {
    const { auth, authMod } = await authBackend();
    return fb._user((await authMod.signInWithEmailAndPassword(auth, email, password)).user);
  },
  async signUpEmail(email, password) {
    const { auth, authMod } = await authBackend();
    const cred = await authMod.createUserWithEmailAndPassword(auth, email, password);
    await authMod.sendEmailVerification(cred.user).catch(() => {});
    return fb._user(cred.user);
  },
  async resetPassword(email) {
    const { auth, authMod } = await authBackend();
    await authMod.sendPasswordResetEmail(auth, email);
    return true;
  },
  async resendVerification() {
    const { auth, authMod } = await authBackend();
    if (auth.currentUser) await authMod.sendEmailVerification(auth.currentUser);
    return true;
  },
  async reloadUser() {
    const { auth } = await authBackend();
    if (!auth.currentUser) return null;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true); // so the new email_verified value is in the token
    return fb._user(auth.currentUser);
  },
  /** Fresh sign-in, needed before deleting an account. password is only used for email accounts. */
  async reauth({ password } = {}) {
    const { auth, authMod } = await authBackend();
    const u = auth.currentUser;
    if (!u) throw new Error('Not signed in');
    if (fb._user(u).provider === 'google') await authMod.reauthenticateWithPopup(u, new authMod.GoogleAuthProvider());
    else await authMod.reauthenticateWithCredential(u, authMod.EmailAuthProvider.credential(u.email, password || ''));
    await u.getIdToken(true);
    return true;
  },
  async signOut() {
    const { auth, authMod } = await authBackend();
    await authMod.signOut(auth);
  },

  async getProfile(uid) {
    const { db, fs } = await backend();
    const snap = await fs.getDoc(fs.doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  },
  async createProfile(uid, data) {
    const { db, fs } = await backend();
    const doc = {
      displayName: data.displayName,
      interests: data.interests,
      personalisation: data.personalisation === true,
      ageConfirmed: true,
      privacyAcceptedAt: fs.serverTimestamp(),
      privacyVersion: data.privacyVersion || '1',
      createdAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp(),
    };
    await fs.setDoc(fs.doc(db, 'users', uid), doc);
    return fb.getProfile(uid);
  },
  async confirmAdult(uid, dob) {
    await callFunction('confirmAdult', { dob });
    return fb.getProfile(uid);
  },
  async requestAuthor(uid, note) {
    await callFunction('requestAuthorAccess', { note });
    return fb.getProfile(uid);
  },
  async updateProfile(uid, patch) {
    const { db, fs } = await backend();
    await fs.updateDoc(fs.doc(db, 'users', uid), { ...patch, updatedAt: fs.serverTimestamp() });
    return fb.getProfile(uid);
  },
  async logHistory(uid, ev) {
    const { db, fs } = await backend();
    const clean = { type: ev.type, at: fs.serverTimestamp(), expireAt: fs.Timestamp.fromMillis(Date.now() + HISTORY_DAYS * dayMs) };
    if (ev.pageId) clean.pageId = String(ev.pageId).slice(0, 80);
    if (ev.term) clean.term = String(ev.term).slice(0, 60);
    if (ev.category) clean.category = String(ev.category).slice(0, 40);
    await fs.addDoc(fs.collection(db, 'users', uid, 'history'), clean);
  },
  async listHistory(uid, n = 100) {
    const { db, fs } = await backend();
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'users', uid, 'history'), fs.orderBy('at', 'desc'), fs.limit(n)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data(), at: toDate(d.data().at) }));
  },
  async clearHistory(uid) {
    const { db, fs } = await backend();
    for (;;) {
      const snap = await fs.getDocs(fs.query(fs.collection(db, 'users', uid, 'history'), fs.limit(400)));
      if (snap.empty) return;
      const batch = fs.writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  },
  async listProgress(uid) {
    const { db, fs } = await backend();
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'readingProgress', uid, 'pages'), fs.orderBy('updatedAt', 'desc'), fs.limit(200)));
    return snap.docs.map((d) => normProgress(d.id, d.data()));
  },
  async getProgress(uid, pageId) {
    const { db, fs } = await backend();
    const snap = await fs.getDoc(fs.doc(db, 'readingProgress', uid, 'pages', pageId));
    return snap.exists() ? normProgress(pageId, snap.data()) : null;
  },
  async setProgress(uid, pageId, data) {
    const { db, fs } = await backend();
    // The rules want exactly these fields on every write.
    await fs.setDoc(fs.doc(db, 'readingProgress', uid, 'pages', pageId), {
      progress: Math.max(0, Math.min(100, Math.round(data.progress))),
      state: data.state,
      saved: data.saved === true,
      title: String(data.title || '').slice(0, 120),
      slug: String(data.slug || '').slice(0, 100),
      updatedAt: fs.serverTimestamp(),
    });
  },
  async listNotifications(uid) {
    const { db, fs } = await backend();
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'notifications'), fs.where('recipientUid', '==', uid), fs.orderBy('createdAt', 'desc'), fs.limit(30)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt) }));
  },
  async markNotificationRead(uid, id) {
    const { db, fs } = await backend();
    await fs.updateDoc(fs.doc(db, 'notifications', id), { read: true });
  },
  async listMyPages(uid) {
    const { db, fs } = await backend();
    const [drafts, subs] = await Promise.all([
      fs.getDocs(fs.query(fs.collection(db, 'userDrafts', uid, 'drafts'), fs.orderBy('updatedAt', 'desc'), fs.limit(50))),
      fs.getDocs(fs.query(fs.collection(db, 'userSubmissions'), fs.where('authorUid', '==', uid), fs.orderBy('createdAt', 'desc'), fs.limit(50))),
    ]);
    return {
      drafts: drafts.docs.map((d) => ({ id: d.id, ...d.data(), updatedAt: toDate(d.data().updatedAt) })),
      submissions: subs.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt) })),
    };
  },
  async getDraft(uid, id) {
    const { db, fs } = await backend();
    const snap = await fs.getDoc(fs.doc(db, 'userDrafts', uid, 'drafts', id));
    return snap.exists() ? { id, ...snap.data() } : null;
  },
  async saveDraft(uid, id, data) {
    const { db, fs } = await backend();
    const ref = id ? fs.doc(db, 'userDrafts', uid, 'drafts', id) : fs.doc(fs.collection(db, 'userDrafts', uid, 'drafts'));
    // The rules accept exactly these fields.
    await fs.setDoc(ref, { title: String(data.title).slice(0, 120), category: data.category, ageBand: data.ageBand, body: String(data.body).slice(0, 15000), updatedAt: fs.serverTimestamp() });
    return ref.id;
  },
  async deleteDraft(uid, id) {
    const { db, fs } = await backend();
    await fs.deleteDoc(fs.doc(db, 'userDrafts', uid, 'drafts', id));
  },
  async submitDraft(uid, id) { return callFunction('submitPage', { draftId: id }); },
  async reopenSubmission(uid, submissionId) { return (await callFunction('reopenSubmission', { submissionId })).draftId; },
  async exportData() { return callFunction('exportMyData', {}); },
  async deleteAccount() {
    await callFunction('deleteMyAccount', { confirm: 'DELETE' });
    await fb.signOut().catch(() => {});
  },
};

export const store = config.demo ? demo : fb;
