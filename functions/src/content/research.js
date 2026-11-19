'use strict';
/** Research: search, then read a few of the best sources as plain text. */

/**
 * @returns {Promise<{sources: {title:string,url:string,text:string}[], limited?: boolean, reason?: string}>}
 */
async function research({ topic, deps, maxSources = 4 }) {
  const found = await deps.search.webSearch(topic, { limit: 8 });
  if (found.limited) return { sources: [], limited: true, reason: found.reason };

  const sources = [];
  const seen = new Set();
  for (const r of found.results) {
    if (sources.length >= maxSources) break;
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    const text = await deps.search.fetchPageText(r.url, { maxChars: 12000 });
    if (text && text.trim().length >= 600) {
      sources.push({ title: String(r.title).slice(0, 120), url: r.url, text: text.trim() });
    }
  }
  return { sources };
}

module.exports = { research };
