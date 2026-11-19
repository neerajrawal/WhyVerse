'use strict';
/** Date helpers. "Day" always means the calendar day in India (IST, UTC+05:30). */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** @returns {string} YYYY-MM-DD in IST */
function dayKey(date = new Date()) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole seconds since epoch. */
function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

module.exports = { dayKey, nowSeconds, IST_OFFSET_MS };
