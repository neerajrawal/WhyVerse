'use strict';
/** Slugs and title-similarity (used for dedupe so we never write the same topic twice). */

function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'is', 'are', 'why', 'how', 'what',
  'who', 'when', 'where', 'do', 'does', 'did', 'about', 'with', 'from', 'by', 'at', 'as', 'its', 'it',
]);

/** Lower-case word set with stop words removed and crude plural stripping. */
function titleTokens(title) {
  return new Set(
    slugify(title)
      .split('-')
      .filter((w) => w && !STOP_WORDS.has(w))
      .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );
}

/** Jaccard similarity of two titles, 0..1. */
function titleSimilarity(a, b) {
  const A = titleTokens(a);
  const B = titleTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** True when `title` is the same topic as any in `existingTitles` (default threshold 0.6). */
function isDuplicateTitle(title, existingTitles, threshold = 0.6) {
  const slug = slugify(title);
  for (const t of existingTitles) {
    if (slugify(t) === slug) return true;
    if (titleSimilarity(title, t) >= threshold) return true;
  }
  return false;
}

/**
 * Returns a slug that is not yet used by any page.
 * @param {FirebaseFirestore.Firestore} db
 */
async function uniqueSlug(db, title) {
  const base = slugify(title) || 'page';
  let candidate = base;
  for (let i = 2; i < 50; i += 1) {
    const snap = await db.collection('pages').where('slug', '==', candidate).limit(1).get();
    if (snap.empty) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

module.exports = { slugify, titleTokens, titleSimilarity, isDuplicateTitle, uniqueSlug };
