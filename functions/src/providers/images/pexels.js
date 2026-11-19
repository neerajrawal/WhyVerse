'use strict';
const { fetchJson } = require('../http');
const providers = require('../../config/providers');
const { safeUrl } = require('../../lib/sanitize');

/**
 * Pexels (free, no attribution required by licence, but WhyVerse shows credit anyway).
 * Returns normalised images with the credit and licence we must store with each image:
 *   { id, url, thumb, width, height, alt, credit, creditUrl, sourceUrl, licence, provider }
 */
async function searchImages({ query, apiKey, perPage }) {
  const cfg = providers.images.pexels;
  const params = new URLSearchParams({
    query,
    per_page: String(perPage || cfg.perPage),
    orientation: 'landscape',
    size: 'medium',
  });
  const data = await fetchJson(`${cfg.endpoint}?${params}`, {
    headers: { Authorization: apiKey },
    timeoutMs: 20000,
    maxRetries: 2,
  });
  return (data.photos || [])
    .map((p) => ({
      id: String(p.id),
      url: safeUrl(p.src && (p.src.large || p.src.medium)),
      thumb: safeUrl(p.src && (p.src.medium || p.src.small)),
      width: p.width,
      height: p.height,
      alt: String(p.alt || query).slice(0, 200),
      credit: String(p.photographer || 'Unknown').slice(0, 80),
      creditUrl: safeUrl(p.photographer_url),
      sourceUrl: safeUrl(p.url),
      licence: 'Pexels License',
      provider: 'pexels',
    }))
    .filter((p) => p.url && p.url.startsWith('https://images.pexels.com/'));
}

module.exports = { searchImages };
