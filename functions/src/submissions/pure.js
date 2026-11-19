'use strict';
/** Pure rules for adult-written pages (no database, no network), so each rule can be tested. */
const { cleanLine, markdownLiteToBlocks, blocksToPlainText, countWords, readingMinutes } = require('../lib/sanitize');
const { detectPii } = require('../lib/pii');
const { BANDS } = require('../config/defaults');

const MIN_WORDS = 150;
const COPY_REJECT = 0.5; // half the page is runs of 8+ words found in another page: reject
const COPY_FLAG = 0.2;

const PII_WORDS = {
  email: 'an email address', phone: 'a phone number', id_number: 'an ID number', url: 'a web link',
  social_handle: 'a social media handle', address: 'an address', self_disclosure: 'personal details about yourself',
};

/** @returns {{ok:boolean, problems:string[], clean?:object}} */
function validateSubmission(draft, { categoryIds, maxWords }) {
  const problems = [];
  const title = cleanLine(draft && draft.title, 120);
  if (title.length < 5) problems.push('Please give your page a title (at least 5 letters).');
  if (!categoryIds.includes(draft && draft.category)) problems.push('Please choose a category.');
  if (!BANDS.includes(draft && draft.ageBand)) problems.push('Please choose who the page is for.');

  const blocks = markdownLiteToBlocks(draft && draft.body);
  const text = blocksToPlainText(blocks);
  const words = countWords(text);
  if (words < MIN_WORDS) problems.push(`Your page has ${words} words. Please write at least ${MIN_WORDS}.`);
  if (words > maxWords) problems.push(`Your page has ${words} words. The limit is ${maxWords}.`);
  if (!blocks.some((b) => b.type === 'p')) problems.push('Please write at least one paragraph.');

  // Personal information is refused outright; the author is told what kind, never shown the data.
  const pii = detectPii(`${title}\n${text}`);
  if (pii.found) {
    const kinds = [...new Set(pii.findings.map((f) => PII_WORDS[f.type] || 'personal information'))];
    problems.push(`Please remove ${kinds.join(', ')}. WhyVerse pages must not contain personal details or links.`);
  }
  if (problems.length) return { ok: false, problems };
  return { ok: true, problems, clean: { title, category: draft.category, ageBand: draft.ageBand, blocks, text, words, readingMinutes: readingMinutes(text) } };
}

/**
 * Outcome for a checked submission.
 *   'rejected'  clearly unsuitable or copied: the author is told why, the page is not kept for review
 *   'submitted' everything else: waits for an admin (the checks only help the admin decide)
 */
function decideSubmission({ safety, overlap, fact, webChecked }) {
  const reasons = [];
  const flags = [];
  if (safety.verdict === 'reject') reasons.push(...(safety.reasons.length ? safety.reasons : ['The page is not suitable for WhyVerse readers.']));
  if (overlap >= COPY_REJECT) reasons.push('Most of this page matches text that already exists. Please write it in your own words.');
  if (reasons.length) return { status: 'rejected', reasons, flags };

  if (safety.verdict !== 'pass') flags.push(safety.unavailable ? 'Safety check could not run.' : 'Safety check is unsure.', ...safety.reasons);
  if (safety.personalInfo) flags.push('Model suspects personal information.');
  if (overlap >= COPY_FLAG) flags.push(`Parts match existing text (${Math.round(overlap * 100)}%).`);
  if (webChecked === false) flags.push('The whole-web copy check could not run (only a smaller check was done).');
  if (fact && !fact.ok) flags.push(fact.unavailable ? 'No sources found to fact-check against.' : `${fact.unsupported.length} claim(s) not found in sources.`);
  return { status: 'submitted', reasons: [], flags };
}

module.exports = { validateSubmission, decideSubmission, MIN_WORDS, COPY_REJECT, COPY_FLAG };
