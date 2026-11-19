'use strict';
/**
 * Only https pages on a real public hostname may be fetched. Blocks localhost, internal names,
 * raw IP addresses (including cloud metadata 169.254.169.254) and non-standard ports, so a
 * malicious search result can never make our server read something internal (SSRF).
 */
function isSafeFetchUrl(u) {
  let url;
  try { url = new URL(String(u)); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  if (url.port && url.port !== '443') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.')) return false; // "localhost", "metadata", single-label internal names
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || host.startsWith('[')) return false; // IP literals
  if (/\.(local|internal|localhost|lan|intranet|corp|home)$/.test(host)) return false;
  return true;
}


module.exports = { isSafeFetchUrl };
