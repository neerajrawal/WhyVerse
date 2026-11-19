'use strict';
const providers = require('../../config/providers');
const secrets = require('../../config/secrets');
const { getSettings } = require('../../lib/settings');
const { checkLimit, recordUsage } = require('../../lib/usage');
const gemini = require('./gemini');

/**
 * Model-agnostic wrapper. Everything else in WhyVerse calls generateText / generateJson and
 * never talks to Gemini directly, so switching provider = add a file + change config.
 *
 * Callers must declare the GEMINI_API_KEY secret in their function options.
 * Every call is counted against the daily token limit.
 *
 * `kind`: 'write' uses the stronger model, 'check' uses the cheaper, faster one.
 */
async function run({ kind = 'check', system, prompt, json = false, temperature, maxOutputTokens, safety }) {
  const limit = await checkLimit('llm');
  if (!limit.ok) {
    const err = new Error(limit.reason);
    err.code = 'LIMIT_REACHED';
    throw err;
  }
  const settings = await getSettings();
  const cfg = providers.llm[providers.llm.active];
  const model = kind === 'write'
    ? settings.llm.writeModel || cfg.writeModel
    : settings.llm.checkModel || cfg.checkModel;

  const out = await gemini.generate({
    apiKey: secrets.GEMINI_API_KEY.value(),
    model,
    system,
    prompt,
    json,
    temperature,
    maxOutputTokens,
    safety: safety || (kind === 'write' ? 'strict' : 'none'),
  });
  await recordUsage({ llmTokens: out.tokens, llmCalls: 1 });
  return { ...out, model };
}

async function generateText(opts) {
  return run({ ...opts, json: false });
}

/** Strip ```json fences some models add, then parse. */
function parseJsonLoose(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Model did not return valid JSON');
  }
}

/** Returns { data, tokens, model }. Retries once if the JSON is malformed. */
async function generateJson(opts) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const out = await run({ ...opts, json: true, temperature: attempt ? 0 : opts.temperature });
    if (out.blocked && !out.text) throw new Error('Model blocked the request for safety reasons');
    try {
      return { data: parseJsonLoose(out.text), tokens: out.tokens, model: out.model };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

module.exports = { generateText, generateJson, parseJsonLoose };
