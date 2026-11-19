// The ONLY place the site reads pages. Everything above this file asks for pages by mode,
// topic and sort; this file talks to Firestore (or the built-in sample pages in demo mode).
//
// Guests read pages straight from Firestore (rules allow published pages only). Every list
// query includes the visitor's bands (`ageBand in [...]`), which is how Junior/Teen mode is applied.
import { config } from '../config.js';
import { bandsForMode } from '../state/mode.js';
import { backend, callFunction } from '../backend.js';
import { demoPages, demoCategories } from '../demo/sample.js';

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Make a Firestore document safe and predictable for the views. */
export function normPage(id, data) {
  return {
    id,
    slug: String(data.slug || id),
    title: String(data.title || 'Untitled'),
    summary: String(data.summary || ''),
    ageBand: ['junior', 'teen', 'all'].includes(data.ageBand) ? data.ageBand : 'all',
    category: String(data.category || ''),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    readingMinutes: Number(data.readingMinutes) || 1,
    featured: data.featured === true,
    viewCount: Number(data.viewCount) || 0,
    publishedAt: toDate(data.publishedAt),
    source: data.source === 'user' ? 'user' : 'ai',
    authorName: data.authorName ? String(data.authorName) : '',
    images: Array.isArray(data.images) ? data.images : [],
    body: Array.isArray(data.body) ? data.body : [],
    keyFacts: Array.isArray(data.keyFacts) ? data.keyFacts.map(String) : [],
    didYouKnow: Array.isArray(data.didYouKnow) ? data.didYouKnow.map(String) : [],
    glossary: Array.isArray(data.glossary) ? data.glossary : [],
    quiz: Array.isArray(data.quiz) ? data.quiz : [],
    sources: Array.isArray(data.sources) ? data.sources : [],
  };
}

// ---------------------------------------------------------------- categories
let categoriesCache = null;

export async function getCategories() {
  if (categoriesCache) return categoriesCache;
  if (config.demo) {
    categoriesCache = demoCategories;
    return categoriesCache;
  }
  const { db, fs } = await backend();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'categories'), fs.orderBy('order')));
  categoriesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return categoriesCache;
}

export function categoryName(categories, id) {
  const c = categories.find((x) => x.id === id);
  return c ? c.name : id;
}

// ---------------------------------------------------------------- listing
function demoSort(list, sort) {
  const copy = [...list];
  if (sort === 'popular') copy.sort((a, b) => b.viewCount - a.viewCount);
  else copy.sort((a, b) => b.publishedAt - a.publishedAt);
  return copy;
}

/**
 * One page of the library.
 * @param {{mode: string, category?: string, band?: string, sort?: 'new'|'popular', cursor?: any}} opts
 * @returns {Promise<{items: object[], next: any|null}>}
 */
export async function listPages({ mode, category = '', band = '', sort = 'new', cursor = null, pageSize = config.pageSize }) {
  let bands = bandsForMode(mode);
  if (band && bands.includes(band)) bands = [band];

  if (config.demo) {
    let list = demoPages.filter((p) => bands.includes(p.ageBand) && (!category || p.category === category));
    list = demoSort(list, sort).map((p) => normPage(p.id, p));
    const start = cursor || 0;
    const items = list.slice(start, start + pageSize);
    return { items, next: start + pageSize < list.length ? start + pageSize : null };
  }

  const { db, fs } = await backend();
  const parts = [
    fs.where('status', '==', 'published'),
    fs.where('ageBand', 'in', bands),
  ];
  if (category) parts.push(fs.where('category', '==', category));
  parts.push(fs.orderBy(sort === 'popular' ? 'viewCount' : 'publishedAt', 'desc'));
  if (cursor) parts.push(fs.startAfter(cursor));
  parts.push(fs.limit(pageSize + 1)); // one extra tells us whether a next page exists
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'pages'), ...parts));
  const docs = snap.docs;
  const hasNext = docs.length > pageSize;
  const shown = hasNext ? docs.slice(0, pageSize) : docs;
  return {
    items: shown.map((d) => normPage(d.id, d.data())),
    next: hasNext ? shown[shown.length - 1] : null,
  };
}

export async function getFeatured(mode, max = 6) {
  const bands = bandsForMode(mode);
  if (config.demo) {
    return demoSort(demoPages.filter((p) => p.featured && bands.includes(p.ageBand)), 'new')
      .slice(0, max)
      .map((p) => normPage(p.id, p));
  }
  const { db, fs } = await backend();
  const snap = await fs.getDocs(fs.query(
    fs.collection(db, 'pages'),
    fs.where('status', '==', 'published'),
    fs.where('featured', '==', true),
    fs.orderBy('publishedAt', 'desc'),
    fs.limit(24),
  ));
  // Band filter is applied here so the query needs no extra index.
  return snap.docs.map((d) => normPage(d.id, d.data())).filter((p) => bands.includes(p.ageBand)).slice(0, max);
}

// ---------------------------------------------------------------- search
// Firestore has no text search, so the visitor's most recent pages are fetched once and
// matched in the browser. Fine for hundreds of pages; a search index is a later upgrade.
const searchCache = new Map(); // key: bands joined -> pages[]

/** The newest published pages for a reading mode (also used by For You). */
export async function getPool(mode) {
  const bands = bandsForMode(mode);
  const key = bands.join(',');
  if (searchCache.has(key)) return searchCache.get(key);
  let pool;
  if (config.demo) {
    pool = demoPages.filter((p) => bands.includes(p.ageBand)).map((p) => normPage(p.id, p));
  } else {
    const { db, fs } = await backend();
    const snap = await fs.getDocs(fs.query(
      fs.collection(db, 'pages'),
      fs.where('status', '==', 'published'),
      fs.where('ageBand', 'in', bands),
      fs.orderBy('publishedAt', 'desc'),
      fs.limit(60),
    ));
    pool = snap.docs.map((d) => normPage(d.id, d.data()));
  }
  searchCache.set(key, pool);
  return pool;
}

export function clearSearchCache() {
  searchCache.clear();
}

/** Plain-words match over title, summary, topic and tags. Title matches rank first. */
export async function searchPages({ term, mode, category = '', band = '', sort = 'new' }) {
  const words = String(term).toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const pool = await getPool(mode);
  const scored = [];
  for (const p of pool) {
    if (category && p.category !== category) continue;
    if (band && p.ageBand !== band) continue;
    const title = p.title.toLowerCase();
    const rest = `${p.summary} ${p.tags.join(' ')} ${p.category}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 3;
      else if (rest.includes(w)) score += 1;
      else { score = 0; break; } // every word must match somewhere
    }
    if (score > 0) scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || (sort === 'popular' ? b.p.viewCount - a.p.viewCount : b.p.publishedAt - a.p.publishedAt));
  return scored.map((s) => s.p);
}

// ---------------------------------------------------------------- single page
export async function getPageBySlug(slug) {
  if (config.demo) {
    const p = demoPages.find((x) => x.slug === slug);
    return p ? normPage(p.id, p) : null;
  }
  const { db, fs } = await backend();
  const snap = await fs.getDocs(fs.query(
    fs.collection(db, 'pages'),
    fs.where('status', '==', 'published'),
    fs.where('slug', '==', slug),
    fs.limit(1),
  ));
  return snap.empty ? null : normPage(snap.docs[0].id, snap.docs[0].data());
}

export async function getRelated(page, max = 4) {
  if (config.demo) {
    return demoPages
      .filter((p) => p.id !== page.id && p.ageBand === page.ageBand)
      .slice(0, max)
      .map((p) => normPage(p.id, p));
  }
  const { db, fs } = await backend();
  const snap = await fs.getDocs(fs.query(
    fs.collection(db, 'pages'),
    fs.where('status', '==', 'published'),
    fs.where('ageBand', '==', page.ageBand),
    fs.where('category', '==', page.category),
    fs.orderBy('publishedAt', 'desc'),
    fs.limit(max + 1),
  ));
  return snap.docs.filter((d) => d.id !== page.id).slice(0, max).map((d) => normPage(d.id, d.data()));
}

// ---------------------------------------------------------------- anonymous calls
// None of these send anything that identifies the visitor. They never block the page.

export function recordView(pageId) {
  if (config.demo) return;
  callFunction('recordView', { pageId }).catch(() => {});
}

export function recordSearch(term) {
  if (config.demo) return;
  callFunction('recordSearch', { term }).catch(() => {});
}

export async function reportPage(pageId, reason) {
  if (config.demo) return { ok: true };
  return callFunction('reportPage', { pageId, reason });
}

/** World-readable site flags (settings/public). Falls back to safe defaults if unreachable. */
export async function getPublicSettings() {
  const fallback = { submissionsOpen: true, authorApprovalRequired: true };
  if (config.demo) return fallback;
  try {
    const { db, fs } = await backend();
    const snap = await fs.getDoc(fs.doc(db, 'settings', 'public'));
    return snap.exists() ? { ...fallback, ...snap.data() } : fallback;
  } catch { return fallback; }
}
