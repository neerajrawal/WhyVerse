'use strict';
/** Pure helpers for the admin functions (validation and page building), so they can be tested. */
const { BANDS } = require('../config/defaults');
const { blocksToPlainText, cleanLine } = require('../lib/sanitize');

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const domainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const modelRe = /^[a-z0-9][a-z0-9.\-]{1,59}$/;

/**
 * Settings an admin may change from the portal. Anything not listed here (the access-code
 * rules, backups, rate limits for guests) cannot be changed from the browser.
 * Returns { ok, problems, nested } where nested is safe to merge into settings/main.
 */
function validateSettingsPatch(patch) {
  const problems = [];
  const nested = {};
  const put = (path, value) => { let o = nested; const k = path.split('.'); k.slice(0, -1).forEach((p) => { o = o[p] = o[p] || {}; }); o[k.at(-1)] = value; };
  const rules = {
    'limits.maxPagesPerDay': (v) => int(v, 0, 200),
    'limits.maxSearchCallsPerDay': (v) => int(v, 0, 5000),
    'limits.maxLlmTokensPerDay': (v) => int(v, 0, 20000000),
    'submissions.maxPerDay': (v) => int(v, 0, 20),
    'submissions.maxPending': (v) => int(v, 0, 100),
    'submissions.maxWords': (v) => int(v, 150, 5000),
    'submissions.requireAuthorApproval': (v) => typeof v === 'boolean',
    'automation.enabled': (v) => typeof v === 'boolean',
    'chat.enabled': (v) => typeof v === 'boolean',
    'chat.guestRatePerHour': (v) => int(v, 1, 500),
    'automation.pagesPerRun': (v) => int(v, 1, 5),
    'automation.schedule': (v) => ['daily', 'weekly'].includes(v),
    'automation.defaultBand': (v) => BANDS.includes(v),
    'sources.webCheck': (v) => typeof v === 'boolean',
    'sources.blockedDomains': (v) => Array.isArray(v) && v.length <= 200 && v.every((d) => typeof d === 'string' && domainRe.test(d.trim().toLowerCase())),
    'safety.bannedTopics': (v) => Array.isArray(v) && v.length <= 400 && v.every((t) => typeof t === 'string' && t.trim().length >= 2 && t.length <= 40),
    'llm.writeModel': (v) => v === '' || modelRe.test(v),
    'llm.checkModel': (v) => v === '' || modelRe.test(v),
  };
  for (const [path, value] of Object.entries(patch || {})) {
    if (!rules[path]) { problems.push(`"${path}" cannot be changed here.`); continue; }
    if (!rules[path](value)) { problems.push(`"${path}" has an invalid value.`); continue; }
    put(path, Array.isArray(value) ? value.map((x) => String(x).trim().toLowerCase()) : value);
  }
  return { ok: problems.length === 0, problems, nested };
}

const PUBLIC_FLAGS = { submissionsOpen: (v) => typeof v === 'boolean', maintenance: (v) => typeof v === 'boolean' };
function validatePublicPatch(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) if (PUBLIC_FLAGS[k] && PUBLIC_FLAGS[k](v)) out[k] = v;
  return out;
}

/** Turn an approved adult submission into a page document (the caller adds slug and timestamps). */
function pageFromSubmission(sub, { ageBand }) {
  const text = blocksToPlainText(sub.bodyBlocks);
  const firstPara = (sub.bodyBlocks.find((b) => b.type === 'p') || {}).text || text;
  return {
    title: sub.title, summary: cleanLine(firstPara.replace(/\*\*/g, ''), 220), ageBand: BANDS.includes(ageBand) ? ageBand : sub.ageBand,
    category: sub.category, tags: [], body: sub.bodyBlocks, keyFacts: [], didYouKnow: [], glossary: [], quiz: [],
    images: [], sources: [], readingMinutes: sub.readingMinutes || 1,
    source: 'user', authorUid: sub.authorUid, authorName: sub.authorName, featured: false, viewCount: 0, version: 1,
  };
}

/** Allowed page transitions for admin actions. */
const TRANSITIONS = {
  publish: { from: ['ready', 'unpublished'], to: 'published' },
  unpublish: { from: ['published'], to: 'unpublished' },
  reject: { from: ['ready', 'unpublished'], to: 'rejected' },
};

module.exports = { validateSettingsPatch, validatePublicPatch, pageFromSubmission, TRANSITIONS };
