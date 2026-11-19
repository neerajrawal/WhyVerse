'use strict';
/**
 * PROVIDER CONFIG: the one file to edit to swap services.
 *
 *  search : which web-search provider the content engine uses.
 *  llm    : which language-model provider and which models.
 *  images : which free-image provider.
 *
 * Models can also be overridden at runtime from the admin portal (settings/main.llm.*), so
 * a retired model name never needs a redeploy.
 */
module.exports = {
  search: {
    // 'wikipedia'  : free, no key, no shutdown date. DEFAULT.
    // 'google_cse' : Google Programmable Search. Closed to new customers (Jan 2026) and shuts down
    //                1 Jan 2027, so it only works if your Google project already had access.
    // To add another (e.g. Brave), put a file in providers/search/ following the contract
    // described in providers/search/index.js and register it there.
    active: 'wikipedia',
  },
  llm: {
    active: 'gemini',
    gemini: {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      // Heavy work (writing, rewriting, fact-check) and light work (safety checks, discovery).
      // "-lite" models have the highest free-tier requests-per-minute.
      writeModel: 'gemini-2.5-flash',
      checkModel: 'gemini-2.5-flash-lite',
      timeoutMs: 60000,
      maxRetries: 4,
    },
  },
  images: {
    active: 'pexels',
    pexels: { endpoint: 'https://api.pexels.com/v1/search', perPage: 8 },
  },
};
