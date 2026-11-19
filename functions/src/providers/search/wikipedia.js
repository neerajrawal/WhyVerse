'use strict';
/**
 * Search provider: Wikipedia (free, no API key).
 * Contract for every search provider:
 *   search(query, { limit }) -> [{ title, url, snippet, domain }]
 *   fetchText(url)           -> plain text of the page (or '' if not possible)
 */
const UA = 'WhyVerseBot/1.0 (educational site for children; contact via site owner)';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
  return res.json();
}

async function search(query, { limit = 10 } = {}) {
  const u = new URL('https://en.wikipedia.org/w/api.php');
  u.search = new URLSearchParams({
    action: 'query', list: 'search', srsearch: query, srlimit: String(Math.min(limit, 20)),
    srprop: 'snippet', format: 'json', origin: '*',
  }).toString();
  const data = await getJson(u);
  return (data.query?.search || []).map((r) => ({
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    snippet: String(r.snippet || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    domain: 'en.wikipedia.org',
  }));
}

/** Wikipedia's plain-text "extract" is far cleaner than scraping HTML. */
async function fetchText(url) {
  const m = String(url).match(/^https:\/\/en\.wikipedia\.org\/wiki\/([^?#]+)/);
  if (!m) return '';
  const u = new URL('https://en.wikipedia.org/w/api.php');
  u.search = new URLSearchParams({
    action: 'query', prop: 'extracts', explaintext: '1', exsectionformat: 'plain',
    titles: decodeURIComponent(m[1]).replace(/_/g, ' '), format: 'json', origin: '*',
  }).toString();
  const data = await getJson(u);
  const pages = Object.values(data.query?.pages || {});
  return pages[0]?.extract || '';
}

/** Random-ish good topic ideas ("surprise me"): Wikipedia's most-linked "Vital articles" lists are too big,
 *  so we sample the search API with a short list of kid-friendly seeds in the engine instead. */
module.exports = { search, fetchText, name: 'wikipedia', costsPerCall: 0 };
