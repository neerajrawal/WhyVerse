'use strict';
const { fetchJson } = require('../http');
const providers = require('../../config/providers');

/**
 * Google Gemini (Generative Language API, free tier from Google AI Studio).
 * Key goes in the x-goog-api-key header, never in the URL, so it cannot leak into logs.
 *
 * Returns { text, tokens, blocked, finishReason }.
 */

const CATEGORIES = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
];

/**
 * @param {object} p
 * @param {string} p.apiKey
 * @param {string} p.model
 * @param {string} [p.system]       system instruction
 * @param {string} p.prompt         user content
 * @param {number} [p.temperature]
 * @param {number} [p.maxOutputTokens]
 * @param {boolean} [p.json]        ask for a JSON response
 * @param {object[]} [p.tools]      e.g. [{ google_search: {} }] to let Gemini search the web
 * @param {'strict'|'none'} [p.safety]  'strict' blocks harmful OUTPUT (writing).
 *                                      'none' lets the model look at bad text so it can classify it.
 */
async function generate({ apiKey, model, system, prompt, temperature = 0.4, maxOutputTokens = 4096, json = false, safety = 'strict', tools }) {
  const cfg = providers.llm.gemini;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
    safetySettings: CATEGORIES.map((category) => ({
      category,
      threshold: safety === 'none' ? 'BLOCK_NONE' : 'BLOCK_LOW_AND_ABOVE',
    })),
  };
  if (tools) body.tools = tools;
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const data = await fetchJson(`${cfg.endpoint}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey },
    body,
    timeoutMs: cfg.timeoutMs,
    maxRetries: cfg.maxRetries,
  });

  const cand = data.candidates && data.candidates[0];
  const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
  const tokens = (data.usageMetadata && data.usageMetadata.totalTokenCount) || 0;
  const blocked = Boolean(data.promptFeedback && data.promptFeedback.blockReason)
    || (cand && cand.finishReason === 'SAFETY');
  const chunks = (cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
  const grounding = chunks.map((c) => c.web).filter((w) => w && w.uri).map((w) => ({ url: w.uri, title: w.title || '' }));
  return { text, tokens, blocked, finishReason: cand ? cand.finishReason : 'NO_CANDIDATE', grounding };
}

module.exports = { generate };
