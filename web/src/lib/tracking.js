// Reading progress and (opt-in) history for signed-in adults. Guests are never tracked: every
// function here does nothing unless an adult is signed in.
import { getAuthState, isAdult } from '../state/auth.js';
import { store } from './accountStore.js';

let active = null;

function me() {
  const s = getAuthState();
  return { uid: s.user.uid, personalise: s.profile && s.profile.personalisation === true };
}

/** Stop watching the current page and save where the reader got to. */
export function stopTracking() {
  if (!active) return;
  active.flush();
  window.removeEventListener('scroll', active.onScroll);
  window.removeEventListener('pagehide', active.flush);
  document.removeEventListener('whyverse:route', stopTracking);
  active = null;
}

/** Start tracking an open page: marks it "reading", follows scrolling, marks it "finished" near the end. */
export async function trackOpen(page, articleEl) {
  stopTracking();
  if (!isAdult() || !articleEl) return;
  const { uid, personalise } = me();
  const rec = await store.getProgress(uid, page.id).catch(() => null);
  const data = {
    progress: rec ? rec.progress : 0,
    state: rec && rec.state !== 'none' ? rec.state : 'reading',
    saved: rec ? rec.saved : false,
    title: page.title,
    slug: page.slug,
  };
  let dirty = !rec || rec.state === 'none';
  let lastSave = 0;

  const flush = () => {
    if (!dirty) return;
    dirty = false;
    lastSave = Date.now();
    store.setProgress(uid, page.id, data).catch(() => {});
  };

  const onScroll = () => {
    const rect = articleEl.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const pct = Math.max(0, Math.min(100, ((window.scrollY + window.innerHeight - top) / Math.max(1, rect.height)) * 100));
    if (data.state !== 'finished' && pct > data.progress + 2) {
      data.progress = Math.round(pct);
      dirty = true;
    }
    if (data.state !== 'finished' && pct >= 90) {
      data.state = 'finished';
      data.progress = 100;
      dirty = true;
      if (personalise) store.logHistory(uid, { type: 'finish', pageId: page.id, category: page.category }).catch(() => {});
      flush();
      return;
    }
    if (dirty && Date.now() - lastSave > 4000) flush();
  };

  active = { flush, onScroll };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pagehide', flush);
  document.addEventListener('whyverse:route', stopTracking);
  flush();
  if (personalise) store.logHistory(uid, { type: 'open', pageId: page.id, category: page.category }).catch(() => {});
}

/** Current saved/progress record for a page (or null). */
export async function getRecord(page) {
  if (!isAdult()) return null;
  return store.getProgress(me().uid, page.id).catch(() => null);
}

/** Save / un-save a page for later. Returns the new saved value. */
export async function toggleSaved(page) {
  const { uid } = me();
  const rec = (await store.getProgress(uid, page.id).catch(() => null)) || { progress: 0, state: 'none', saved: false };
  const next = !rec.saved;
  await store.setProgress(uid, page.id, { progress: rec.progress, state: rec.state, saved: next, title: page.title, slug: page.slug });
  if (active && active.sync) active.sync(next);
  return next;
}

export function trackSearch(term) {
  if (!isAdult()) return;
  const { uid, personalise } = me();
  if (personalise && term) store.logHistory(uid, { type: 'search', term }).catch(() => {});
}
