'use strict';
const { db, FieldValue } = require('./firebase');
const { dayKey } = require('./time');
const { getSettings } = require('./settings');
const { notifyAdmins } = require('./notify');

/**
 * Daily cost counters in usage/{YYYY-MM-DD} (IST day):
 *   pages, searchCalls, llmTokens, llmCalls, imageCalls
 * Per-job usage is stored on the job document by the content engine.
 */

const LIMIT_FIELD = {
  pages: { counter: 'pages', setting: 'maxPagesPerDay', label: 'pages generated' },
  search: { counter: 'searchCalls', setting: 'maxSearchCallsPerDay', label: 'search calls' },
  llm: { counter: 'llmTokens', setting: 'maxLlmTokensPerDay', label: 'language-model tokens' },
};

async function recordUsage({ pages = 0, searchCalls = 0, llmTokens = 0, llmCalls = 0, imageCalls = 0 }) {
  const inc = {};
  if (pages) inc.pages = FieldValue.increment(pages);
  if (searchCalls) inc.searchCalls = FieldValue.increment(searchCalls);
  if (llmTokens) inc.llmTokens = FieldValue.increment(llmTokens);
  if (llmCalls) inc.llmCalls = FieldValue.increment(llmCalls);
  if (imageCalls) inc.imageCalls = FieldValue.increment(imageCalls);
  if (!Object.keys(inc).length) return;
  await db.doc(`usage/${dayKey()}`).set({ day: dayKey(), ...inc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function todaysUsage() {
  const snap = await db.doc(`usage/${dayKey()}`).get();
  return snap.exists ? snap.data() : {};
}

/**
 * Check whether another unit of `kind` ('pages' | 'search' | 'llm') is still allowed today.
 * The first time a limit is hit, admins get an in-app alert.
 * @returns {Promise<{ok: boolean, used: number, limit: number, reason?: string}>}
 */
async function checkLimit(kind) {
  const def = LIMIT_FIELD[kind];
  const [settings, usage] = await Promise.all([getSettings(), todaysUsage()]);
  const limit = settings.limits[def.setting];
  const used = usage[def.counter] || 0;
  if (used < limit) return { ok: true, used, limit };

  const alertKey = `alert_${def.counter}`;
  if (!usage[alertKey]) {
    await db.doc(`usage/${dayKey()}`).set({ [alertKey]: true }, { merge: true });
    await notifyAdmins({
      type: 'limit_reached',
      title: `Daily limit reached: ${def.label}`,
      body: `Used ${used} of ${limit} today. The content queue is paused until tomorrow or until you raise the limit in Settings.`,
      link: '/authority/settings',
    });
  }
  return { ok: false, used, limit, reason: `Daily limit for ${def.label} reached (${used}/${limit}).` };
}

module.exports = { recordUsage, todaysUsage, checkLimit };
