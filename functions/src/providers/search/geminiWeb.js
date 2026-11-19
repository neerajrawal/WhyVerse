'use strict';
/**
 * Whole-web search through Gemini "Grounding with Google Search", using the Gemini key WhyVerse
 * already has. Gemini searches Google and returns the pages it used; we only need those links.
 *   search(query, {limit}) -> [{ title, url, snippet, domain }]
 * Result links are Google redirect links; htmlText.js follows them hop by hop with SSRF checks.
 * Quota: grounded prompts have their own free allowance on the Gemini API (check Google's current
 * limits). Each call here counts as one search call in WhyVerse's daily limits.
 */
const secrets = require('../../config/secrets');
const providers = require('../../config/providers');
const { generate } = require('../llm/gemini');
const { recordUsage } = require('../../lib/usage');
const { fetchHtmlText } = require('./htmlText');

async function search(query, { limit = 6 } = {}) {
  const cfg = providers.llm.gemini;
  const out = await generate({
    apiKey: secrets.GEMINI_API_KEY.value(),
    model: cfg.checkModel,
    prompt: `Search the web for pages that contain this exact text or are about this subject, and list what you find: ${String(query).slice(0, 400)}`,
    tools: [{ google_search: {} }],
    temperature: 0,
    maxOutputTokens: 300,
    safety: 'none',
  });
  await recordUsage({ llmTokens: out.tokens, llmCalls: 1 });
  const seen = new Set();
  return out.grounding.filter((g) => !seen.has(g.url) && seen.add(g.url)).slice(0, limit)
    .map((g) => ({ title: g.title || 'Web page', url: g.url, snippet: '', domain: g.title || '' }));
}

module.exports = { search, fetchText: fetchHtmlText, name: 'gemini_web', costsPerCall: 0 };
