'use strict';
/**
 * Whole-web comparison for copy detection.
 * We pick a few distinctive sentences from the page, ask Gemini+Google Search where that wording
 * appears, read the pages it points to, and later compare 8-word runs (content/pure.overlapRatio).
 * This is a strong signal, not proof: search finds what Google indexes, and some sites block bots.
 */
const { getSettings } = require('../lib/settings');
const { checkLimit } = require('../lib/usage');
const geminiWeb = require('../providers/search/geminiWeb');

/** Up to n medium-length sentences spread through the text (long enough to be distinctive). */
function distinctiveSentences(text, n = 3) {
  const sentences = String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 70 && s.length <= 220);
  if (sentences.length <= n) return sentences;
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(sentences[Math.floor(((i + 0.5) * sentences.length) / n)]);
  return out;
}

/**
 * @returns {Promise<{ refs: {title,url,text}[], checked: boolean, reason?: string }>}
 *   checked=false means the web check could not run (switched off, limit reached, error).
 */
async function webReferences({ title, text, maxPages = 6, impl = geminiWeb, fetchText = geminiWeb.fetchText }) {
  const { sources } = await getSettings();
  if (!sources.webCheck) return { refs: [], checked: false, reason: 'Web check is switched off.' };
  const gate = await checkLimit('search');
  if (!gate.ok) return { refs: [], checked: false, reason: gate.reason };

  const queries = [...distinctiveSentences(text).map((s) => `"${s}"`), String(title)];
  const urls = new Map();
  let anyOk = false;
  for (const q of queries) {
    try {
      const found = await impl.search(q, { limit: 5 });
      anyOk = true;
      found.forEach((r) => { if (!urls.has(r.url)) urls.set(r.url, r.title); });
    } catch { /* keep going with the other queries */ }
  }
  if (!anyOk) return { refs: [], checked: false, reason: 'Web search was not available.' };

  const refs = [];
  for (const [url, t] of [...urls].slice(0, maxPages)) {
    try {
      const body = await fetchText(url);
      if (body && body.length > 300) refs.push({ title: t, url, text: body.slice(0, 20000) });
    } catch { /* unreadable page: skip */ }
  }
  return { refs, checked: true };
}

module.exports = { webReferences, distinctiveSentences };
