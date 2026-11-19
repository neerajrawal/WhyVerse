#!/usr/bin/env node
'use strict';
/**
 * Queue one topic for the content engine (until the admin portal does this for you).
 *   node scripts/enqueue-topic.js "Why does it rain?" nature all
 *   args: <topic> <category-id> <band: junior|teen|all>
 * The page is written within about 10 minutes by the scheduled queue runner, then checked.
 */
const { init } = require('./_init');
const admin = init();
const [topic, category, band = 'all'] = process.argv.slice(2);
const { DEFAULT_CATEGORIES, BANDS, DEFAULT_SETTINGS } = require('../functions/src/config/defaults');
const { bannedHits } = require('../functions/src/safety/filter');

(async () => {
  if (!topic || !category) throw new Error('Usage: node scripts/enqueue-topic.js "<topic>" <category-id> <junior|teen|all>');
  if (!DEFAULT_CATEGORIES.some((c) => c.id === category)) throw new Error(`Unknown category. Use one of: ${DEFAULT_CATEGORIES.map((c) => c.id).join(', ')}`);
  if (!BANDS.includes(band)) throw new Error('Band must be junior, teen or all');
  const hits = bannedHits(topic, DEFAULT_SETTINGS.safety.bannedTopics);
  if (hits.length) throw new Error(`Topic contains blocked terms (${hits.join(', ')}).`);
  const { createJob } = require('../functions/src/content/store');
  const id = await createJob({ type: 'manual', params: { topic: topic.slice(0, 120), category, band } });
  console.log(`Queued job ${id}: "${topic}" (${category}, ${band})`);
})().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => admin.app().delete().catch(() => {}));
