'use strict';
/**
 * Scheduled content engine.
 *  - contentQueueRunner : every 10 minutes, works through queued jobs (up to 3 per run)
 *  - contentAutoPlanner : once a day, when auto mode is ON, queues new topics
 * Auto mode is OFF until an admin switches it on (settings/main automation.enabled).
 */
const { onSchedule } = require('../runtime/scheduler');
const { getSettings } = require('../lib/settings');
const { checkLimit } = require('../lib/usage');
const { logActivity } = require('../lib/logger');
const { chooseCategory } = require('./pure');
const { runJob } = require('./pipeline');
const { discoverTopics } = require('./topics');
const store = require('./store');

function realDeps() {
  return {
    store,
    llm: require('../providers/llm'),
    search: require('../providers/search'),
    images: require('../providers/images'),
    safety: require('../safety/filter'),
    factCheck: require('../safety/factcheck').factCheck,
    webReferences: require('../safety/webCheck').webReferences,
  };
}

const MAX_JOBS_PER_RUN = 3;
const BUDGET_MS = 48 * 1000; // Vercel's free plan: stay well under a 60 s request

async function processQueue(deps = realDeps()) {
  const started = Date.now();
  let done = 0;
  while (done < MAX_JOBS_PER_RUN && Date.now() - started < BUDGET_MS) {
    const gate = await checkLimit('pages');
    if (!gate.ok) return { done, stopped: gate.reason };
    const job = await deps.store.claimNextJob();
    if (!job) break;
    const res = await runJob(job, deps, { budgetMs: Math.max(5000, BUDGET_MS - (Date.now() - started)) });
    done += 1;
    if (res.outcome === 'continue' && Date.now() - started > BUDGET_MS * 0.7) break;
    if (res.outcome === 'retry' && /limit/i.test(res.error || '')) break; // paused by a daily limit
  }
  return { done };
}

/** Queue up to `count` new topics, favouring the category with the fewest pages. */
async function planTopics({ count, band, deps = realDeps() }) {
  const [cats, counts, titles, queued] = await Promise.all([deps.store.categories(), deps.store.categoryCounts(), deps.store.existingTitles(), deps.store.queuedCount()]);
  if (!cats.length) return { queued: 0, reason: 'no categories' };
  let made = 0;
  const used = new Set();
  for (let i = 0; i < count && queued + made < 10; i += 1) {
    const category = chooseCategory(cats.filter((c) => !used.has(c.id)), counts) || chooseCategory(cats, counts);
    used.add(category.id);
    const topics = await discoverTopics({ category, band, existingTitles: titles, deps, want: 1 });
    if (!topics.length) continue;
    await deps.store.createJob({ type: 'auto', params: { topic: topics[0], category: category.id, band } });
    titles.push(topics[0]);
    made += 1;
  }
  return { queued: made };
}

const common = {};

exports.contentQueueRunner = onSchedule({ ...common, schedule: 'every 10 minutes', timeoutSeconds: 540, retryCount: 0 }, async () => {
  const res = await processQueue();
  if (res.done) console.log(`content queue: ${res.done} job(s) processed`);
  return res;
});

exports.contentAutoPlanner = onSchedule({ ...common, schedule: '0 6 * * *', timeoutSeconds: 300, retryCount: 0 }, async () => {
  const { automation } = await getSettings({ fresh: true });
  if (!automation.enabled) return { skipped: 'auto mode is off' };
  const weekday = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCDay(); // IST
  if (automation.schedule === 'weekly' && weekday !== 1) return { skipped: 'not Monday' };
  const res = await planTopics({ count: automation.pagesPerRun, band: automation.defaultBand });
  await logActivity({ action: 'content.auto_planned', meta: res });
  return res;
});

exports._deps = realDeps;
exports._test = { processQueue, planTopics };
