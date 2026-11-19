'use strict';
/**
 * Search provider: Google Programmable Search (Custom Search JSON API).
 *
 * WARNING (checked Nov 2026): Google closed this API to new customers, and it stops working for
 * everyone on 1 January 2027. It also allows only ~100 free queries/day. It works only if your Google
 * Cloud project already had access. Kept here so existing keys continue to work until then; the default
 * provider is Wikipedia (no key, no shutdown).
 */
const secrets = require('../../config/secrets');

async function search(query, { limit = 10 } = {}) {
  const u = new URL('https://www.googleapis.com/customsearch/v1');
  u.search = new URLSearchParams({
    key: secrets.GOOGLE_CSE_KEY.value(),
    cx: secrets.GOOGLE_CSE_CX.value(),
    q: query,
    num: String(Math.min(limit, 10)),
    safe: 'active', // Google SafeSearch on
  }).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Google CSE ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.items || []).map((i) => ({
    title: i.title,
    url: i.link,
    snippet: i.snippet || '',
    domain: i.displayLink || new URL(i.link).hostname,
  }));
}

/** Fetch a page and reduce it to plain text (used by the research step; allow-listed domains only). */
async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WhyVerseBot/1.0 (educational site for children)' },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  });
  if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return '';
  const html = (await res.text()).slice(0, 2_000_000);
  return html
    .replace(/<(script|style|nav|header|footer|aside|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { search, fetchText, name: 'google_cse', costsPerCall: 1 };
