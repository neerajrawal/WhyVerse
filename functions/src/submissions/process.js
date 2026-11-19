'use strict';
/** Runs the automatic checks on a validated submission. Dependencies are injected for testing. */
const { overlapRatio } = require('../content/pure');
const { decideSubmission } = require('./pure');

/**
 * @param {object} p
 * @param {{title,category,ageBand,text}} p.clean
 * @param {object} p.deps { safety:{checkText}, factCheck, references(title, category) -> [{url,title,text}] }
 */
async function checkSubmission({ clean, deps }) {
  const safety = await deps.safety.checkText({ text: `${clean.title}\n${clean.text}`, band: clean.ageBand, kind: 'submission' });

  let refs = [];
  try { refs = await deps.references(clean.title, clean.category); } catch { refs = []; }
  // Whole-web check (Gemini + Google Search). If it cannot run, an admin is told.
  let webChecked;
  if (deps.webReferences) {
    try {
      const w = await deps.webReferences({ title: clean.title, text: clean.text });
      webChecked = w.checked;
      refs = refs.concat(w.refs);
    } catch { webChecked = false; }
  }
  const overlap = refs.length ? overlapRatio(clean.text, refs.map((r) => r.text)) : 0;

  // Only fact-check pages that are not already going to be rejected (saves model calls).
  let fact = { ok: false, unsupported: [], unavailable: true, summary: 'Skipped.' };
  const early = decideSubmission({ safety, overlap, fact: null, webChecked });
  if (early.status !== 'rejected') {
    fact = await deps.factCheck({ title: clean.title, pageText: clean.text, sources: refs.filter((r) => !r.url.includes('whyverse.invalid')) })
      .catch(() => ({ ok: false, unsupported: [], unavailable: true, summary: 'Fact check failed.' }));
  }
  const decision = decideSubmission({ safety, overlap, fact, webChecked });
  return {
    decision,
    safetyReport: { verdict: safety.verdict, reasons: safety.reasons, categories: safety.categories, suggestedBand: safety.suggestedBand, personalInfo: safety.personalInfo, unavailable: Boolean(safety.unavailable) },
    plagiarism: { overlap: Math.round(overlap * 1000) / 1000, comparedWith: refs.map((r) => r.url).slice(0, 12), webChecked: webChecked === undefined ? null : webChecked },
    factCheck: { ok: fact.ok, unsupported: fact.unsupported, summary: fact.summary, unavailable: Boolean(fact.unavailable) },
  };
}

module.exports = { checkSubmission };
