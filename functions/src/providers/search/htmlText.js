'use strict';
/**
 * Read any public web page as plain text, for COMPARISON only (copy checks). The text is never
 * shown to anyone and never stored.
 * Safety: https + public hostnames only, every redirect hop re-checked (SSRF), small size cap,
 * HTML or plain text only, short timeout.
 */
const { isSafeFetchUrl } = require('./safeUrl');

const UA = 'WhyVerseBot/1.0 (+copy and fact check for a children\'s learning site)';
const MAX_BYTES = 1_500_000;
const MAX_HOPS = 5;

function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|nav|header|footer|aside|noscript|svg|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Read at most MAX_BYTES of the body. */
async function readCapped(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    chunks.push(value);
    if (total >= MAX_BYTES) { await reader.cancel().catch(() => {}); break; }
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchHtmlText(startUrl, { fetchImpl = fetch } = {}) {
  let url = String(startUrl);
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    if (!isSafeFetchUrl(url)) return '';
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).toString();
      continue;
    }
    if (!res.ok) return '';
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain/.test(type)) return '';
    const body = await readCapped(res);
    return /text\/plain/.test(type) ? body.replace(/\s+/g, ' ').trim() : htmlToText(body);
  }
  return '';
}

module.exports = { fetchHtmlText, htmlToText };
