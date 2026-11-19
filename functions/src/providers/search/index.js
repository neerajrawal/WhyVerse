'use strict';
const providers = require('../../config/providers');
const { getSettings } = require('../../lib/settings');
const { checkLimit, recordUsage } = require('../../lib/usage');

/**
 * Search provider contract (every file in this folder follows it):
 *   search(query, { limit }) -> [{ title, url, snippet, domain }]
 *   fetchText(url)           -> plain text of the page, or '' if it cannot be read
 *   name, costsPerCall
 *
 * Active provider is chosen in config/providers.js. To add one (Brave, Bing...), drop a file
 * here with that contract and register it below.
 *
 * The content engine must declare the secrets of the ACTIVE provider only (Wikipedia needs none).
 */
const impls = {
  wikipedia: () => require('./wikipedia'),
  google_cse: () => require('./googleCse'), // legacy: closed to new customers, ends 1 Jan 2027
};

function active() {
  const load = impls[providers.search.active];
  if (!load) throw new Error(`Unknown search provider: ${providers.search.active}`);
  return load();
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function endsWithDomain(host, d) {
  return host === d || host.endsWith(`.${d}`);
}

const { isSafeFetchUrl } = require('./safeUrl');

/**
 * Search the web, drop blocked domains, rank preferred/reputable domains first.
 * Counts every call in the daily usage totals and respects the daily search limit.
 *
 * @returns {Promise<{results: object[], limited?: boolean, reason?: string}>}
 */
async function webSearch(query, { limit = 10 } = {}) {
  const gate = await checkLimit('search');
  if (!gate.ok) return { results: [], limited: true, reason: gate.reason };

  const settings = await getSettings();
  const raw = await active().search(query, { limit });
  await recordUsage({ searchCalls: 1 });

  const { blockedDomains, preferredDomains, preferredSuffixes } = settings.sources;
  const score = (r) => {
    const host = r.domain || domainOf(r.url);
    if (preferredDomains.some((d) => endsWithDomain(host, d))) return 2;
    if (preferredSuffixes.some((s) => host.endsWith(s))) return 1;
    return 0;
  };
  const results = raw
    .filter((r) => r.url && !blockedDomains.some((d) => endsWithDomain(r.domain || domainOf(r.url), d)))
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
  return { results };
}

/** Read a source page as plain text (capped), only if the URL passes the safety checks. */
async function fetchPageText(url, { maxChars = 20000 } = {}) {
  if (!isSafeFetchUrl(url)) return '';
  const host = domainOf(url);
  const { sources } = await getSettings();
  if (sources.blockedDomains.some((d) => endsWithDomain(host, d))) return '';
  try {
    return String(await active().fetchText(url)).slice(0, maxChars);
  } catch {
    return '';
  }
}

module.exports = { webSearch, fetchPageText, isSafeFetchUrl, domainOf };
