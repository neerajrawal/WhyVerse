'use strict';
/** Topic discovery: ask the model for curious, age-appropriate questions, then filter them. */
const { isDuplicateTitle } = require('../lib/slug');
const { bandStyle } = require('./pure');

const SEEDS = {
  space: ['Why does the Moon change shape?', 'How do rockets reach space?'],
  animals: ['How do elephants talk to each other?', 'Why do birds migrate?'],
  nature: ['Why does it rain?', 'How are mountains made?'],
  science: ['Why is the sky blue?', 'What is electricity?'],
  technology: ['How does the internet work?', 'How do solar panels work?'],
  history: ['Who built the Taj Mahal?', 'What was the Indus Valley Civilisation?'],
  india: ['Why does India have so many languages?', 'How do monsoons work in India?'],
  body: ['Why does our heart beat?', 'How do we see colours?'],
  maths: ['What is zero and why did India give it to the world?', 'What are prime numbers?'],
  art: ['How are musical instruments made?', 'What is Rangoli?'],
  sports: ['How did cricket begin?', 'Why do athletes warm up?'],
  food: ['Why do spices grow in India?', 'How is bread made?'],
};

/**
 * @param {object} p
 * @param {{id:string,name:string}} p.category
 * @param {'junior'|'teen'|'all'} p.band
 * @param {string[]} p.existingTitles  titles already published or queued
 * @param {object} p.deps  { llm: {generateJson}, safety: {checkText} }
 * @param {number} [p.want]
 * @returns {Promise<string[]>} approved topic titles, best first
 */
async function discoverTopics({ category, band, existingTitles, deps, want = 3 }) {
  let ideas = [];
  try {
    const s = bandStyle(band);
    const { data } = await deps.llm.generateJson({
      kind: 'check',
      system: 'You suggest safe, educational topics for a children\'s learning website. You output JSON only.',
      prompt: `Suggest 10 page topics in the category "${category.name}" for ${s.who}.
Each must be a curious question or a clear "What is..." title, factual, positive, and answerable from encyclopedia sources. Prefer topics with Indian relevance where natural. Avoid anything violent, scary, political, religious debate, romance, or about living private people.
Do NOT suggest topics similar to these existing ones: ${existingTitles.slice(0, 60).join(' | ') || '(none yet)'}.
Return JSON: { "topics": ["title", "title", ...] }`,
      temperature: 0.9,
      maxOutputTokens: 600,
    });
    ideas = (Array.isArray(data.topics) ? data.topics : []).map((t) => String(t).trim()).filter((t) => t.length >= 8 && t.length <= 90);
  } catch (err) {
    ideas = []; // fall back to seeds
  }
  if (!ideas.length) ideas = SEEDS[category.id] || [];

  const taken = [...existingTitles];
  const out = [];
  for (const title of ideas) {
    if (out.length >= want) break;
    if (isDuplicateTitle(title, taken)) continue;
    const res = await deps.safety.checkText({ text: title, band, kind: 'topic' });
    if (res.verdict !== 'pass' || res.unavailable) continue;
    out.push(title);
    taken.push(title);
  }
  return out;
}

module.exports = { discoverTopics, SEEDS };
