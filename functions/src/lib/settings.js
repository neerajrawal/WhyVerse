'use strict';
const { db } = require('./firebase');
const { DEFAULT_SETTINGS } = require('../config/defaults');

let cache = null;
let cacheAt = 0;
const TTL_MS = 60 * 1000;

/** Recursively merge `over` onto `base`. Arrays are replaced, not merged. */
function deepMerge(base, over) {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base) || Array.isArray(over) || typeof base !== 'object' || typeof over !== 'object') {
    return over;
  }
  const out = { ...base };
  for (const key of Object.keys(over)) {
    out[key] = key in base ? deepMerge(base[key], over[key]) : over[key];
  }
  return out;
}

/** Settings = defaults overlaid with settings/main from Firestore. Cached for 60 s. */
async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < TTL_MS) return cache;
  const snap = await db.doc('settings/main').get();
  cache = deepMerge(DEFAULT_SETTINGS, snap.exists ? snap.data() : {});
  cacheAt = Date.now();
  return cache;
}

function clearSettingsCache() {
  cache = null;
}

module.exports = { getSettings, clearSettingsCache, deepMerge };
