'use strict';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch() with a timeout and retries on 429 / 5xx / network errors (exponential backoff,
 * honouring Retry-After). Returns the parsed JSON body. Throws an Error with .status on failure.
 * API keys are passed in headers, never logged.
 */
async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 30000, maxRetries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.json();

      const retryable = res.status === 429 || res.status >= 500;
      const text = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status} from ${new URL(url).host}: ${text.slice(0, 300)}`);
      err.status = res.status;
      if (!retryable || attempt === maxRetries) throw err;
      lastErr = err;
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : Math.min(1000 * 2 ** attempt, 15000));
    } catch (err) {
      if (err.status && !(err.status === 429 || err.status >= 500)) throw err;
      lastErr = err;
      if (attempt === maxRetries) throw err;
      await sleep(Math.min(1000 * 2 ** attempt, 15000));
    }
  }
  throw lastErr;
}

module.exports = { fetchJson, sleep };
