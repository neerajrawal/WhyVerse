'use strict';
/**
 * Stage 8: the "Why Bot". Guests (children included) can use it with NO sign-in and NOTHING is stored:
 * the conversation lives in the visitor's browser tab and is sent with each question. Rate limiting
 * uses a daily-salted one-way hash of the IP (see lib/rateLimit.js). Signed-in adults are limited by uid.
 *
 * Safety layers, in order: size limits -> personal-information check -> blocked-topic list ->
 * model with a strict system prompt and Gemini's own safety filter -> blocked-topic list and the
 * band safety classifier on the answer. Any failure answers with a safe, fixed message.
 */
const { onCall, HttpsError } = require('../runtime/https');
const { db } = require('../lib/firebase');
const secrets = require('../config/secrets');
const { callableOptions } = require('../lib/options');
const { hit } = require('../lib/rateLimit');
const { detectPii } = require('../lib/pii');
const { getSettings } = require('../lib/settings');
const { generateText } = require('../providers/llm');
const { bannedHits, checkText, isPass } = require('../safety/filter');
const { bandForMode, cleanMessages, pickPages, systemPrompt, formatConversation, REFUSALS } = require('./pure');

const opts = callableOptions({ secrets: [secrets.GEMINI_API_KEY, secrets.RATE_LIMIT_SALT] });

// Titles of recent published pages per band, cached in memory so a chat does not cost many reads.
const titleCache = new Map();
async function titlesFor(band) {
  const hit_ = titleCache.get(band);
  if (hit_ && Date.now() - hit_.at < 10 * 60 * 1000) return hit_.list;
  const bands = band === 'teen' ? ['teen', 'all'] : ['junior', 'all'];
  const snap = await db.collection('pages').where('status', '==', 'published').where('ageBand', 'in', bands).limit(120).get();
  const list = snap.docs.map((d) => ({ slug: d.get('slug'), title: d.get('title'), ageBand: d.get('ageBand') })).filter((p) => p.slug && p.title);
  titleCache.set(band, { at: Date.now(), list });
  return list;
}

/** chat({ messages: [{role, content}], mode }) -> { reply, pages: [{slug,title}], refused? } */
exports.chat = onCall(opts, async (request) => {
  const d = request.data || {};
  const messages = cleanMessages(d.messages);
  if (!messages) throw new HttpsError('invalid-argument', 'Please type a question.');
  const band = bandForMode(d.mode);
  const settings = await getSettings();
  if (settings.chat && settings.chat.enabled === false) return { reply: REFUSALS.busy, pages: [], refused: true };

  const adult = Boolean(request.auth && request.auth.uid);
  const limit = adult ? settings.chat.adultRatePerHour : settings.chat.guestRatePerHour;
  const allowed = await hit({ request, scope: 'chat', salt: secrets.RATE_LIMIT_SALT.value(), limit, windowSec: 3600, key: adult ? request.auth.uid : undefined, silent: true });
  if (!allowed) return { reply: REFUSALS.busy, pages: [], refused: true };

  const question = messages[messages.length - 1].content;
  if (detectPii(question).found) return { reply: REFUSALS.pii, pages: [], refused: true };
  if (bannedHits(question, settings.safety.bannedTopics).length) return { reply: REFUSALS.blocked, pages: [], refused: true };

  let reply;
  try {
    const out = await generateText({ kind: 'write', system: systemPrompt(band), prompt: formatConversation(messages), temperature: 0.5, maxOutputTokens: 400, safety: 'strict' });
    reply = String(out.text || '').trim().slice(0, 1200);
  } catch (err) {
    if (err && err.code !== 'LIMIT_REACHED') console.error('chat model error', err.message);
    return { reply: err && err.code === 'LIMIT_REACHED' ? REFUSALS.busy : REFUSALS.fallback, pages: [], refused: true };
  }
  if (!reply || bannedHits(reply, settings.safety.bannedTopics).length || detectPii(reply).found) return { reply: REFUSALS.fallback, pages: [], refused: true };
  try {
    if (!isPass(await checkText({ text: `Question: ${question}\nAnswer: ${reply}`, band, kind: 'chatbot answer' }))) return { reply: REFUSALS.blocked, pages: [], refused: true };
  } catch { return { reply: REFUSALS.fallback, pages: [], refused: true }; } // fail closed

  const pages = pickPages(question, await titlesFor(band).catch(() => []));
  return { reply, pages };
});
