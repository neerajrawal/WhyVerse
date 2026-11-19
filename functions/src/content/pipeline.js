'use strict';
/**
 * One content job from topic to page. Every dependency is passed in (`deps`), so the same
 * code runs in production (content/engine.js) and in tests with fakes.
 *
 * Steps: researching -> writing -> checking -> images -> publish | review | reject
 *
 * A page goes live automatically ONLY when the safety check, the fact check, the reading
 * level and the copy check are all clean. Anything else waits in the admin Review Queue
 * (status 'ready'), and a clearly unsuitable page is stored as 'rejected' and never shown.
 */
const { research } = require('./research');
const { buildWritePrompt, validateDraft, readingLevel, overlapRatio, decideOutcome } = require('./pure');
const { blocksToPlainText } = require('../lib/sanitize');

const MAX_ATTEMPTS = 3;

class JobError extends Error {
  constructor(message, { retry = true, pause = false } = {}) {
    super(message);
    this.retry = retry;
    this.pause = pause; // a daily limit stopped us: try again later, do not count an attempt
  }
}

/**
 * Runs in two stages so that each server call stays short (Vercel's free plan limits a request to
 * about a minute): stage "write" = research + writing, stage "check" = checks + image + save.
 * If the write stage used up most of the time budget, the draft is parked in the store and the job
 * goes back to the queue marked stage "check"; the next run (minutes later) finishes it.
 *
 * @param {object} [opts]  { budgetMs: time this call may use (default: unlimited), clock: () => ms }
 * @returns {Promise<{outcome: 'publish'|'review'|'reject'|'retry'|'failed'|'continue'}>}
 */
async function runJob(job, deps, { budgetMs = Infinity, clock = Date.now } = {}) {
  const { store } = deps;
  const { topic, category, band } = job.params;
  const log = (step, level, msg, data) => store.log(job.id, step, level, msg, data);
  const started = clock();
  let usage = { tokens: 0, searches: 0 };

  try {
    let r;
    let draft;
    if (job.stage === 'check') {
      const work = await store.loadWork(job.id);
      if (!work) throw new JobError('Parked draft was lost; starting again.', { retry: true });
      ({ sources: r, draft } = work);
      r = { sources: r };
      usage = work.usage || usage;
    } else {
      // ---- 1. research
      await store.updateJob(job.id, { step: 'researching', progress: 15 });
      r = await research({ topic, deps });
      if (r.limited) throw new JobError(r.reason, { pause: true });
      usage.searches += 1;
      if (r.sources.length < 2) throw new JobError(`Only ${r.sources.length} usable source(s) found for "${topic}"`, { retry: false });
      await log('researching', 'info', `Read ${r.sources.length} sources`, { urls: r.sources.map((s) => s.url) });

      // ---- 2. write (one retry if the draft fails validation)
      await store.updateJob(job.id, { step: 'writing', progress: 35 });
      let lastProblems = [];
      for (let attempt = 0; attempt < 2 && !draft; attempt += 1) {
        const prompt = buildWritePrompt({ topic, category, band, sources: r.sources })
          + (lastProblems.length ? `\n\nYour previous draft had these problems, fix them: ${lastProblems.join('; ')}.` : '');
        const out = await deps.llm.generateJson({ kind: 'write', system: 'You are a careful children\'s educational writer. You output JSON only.', prompt, temperature: 0.5, maxOutputTokens: 6000 });
        usage.tokens += out.tokens || 0;
        const v = validateDraft(out.data, band);
        if (v.ok) draft = v.page; else lastProblems = v.problems;
      }
      if (!draft) throw new JobError(`Draft failed validation: ${lastProblems.join('; ')}`);
      await log('writing', 'info', `Wrote "${draft.title}" (${draft.words} words)`);

      // Little time left for the slow checks? Park the draft and let the next run finish.
      if (clock() - started > budgetMs * 0.45) {
        await store.saveWork(job.id, { sources: r.sources, draft, usage });
        await store.updateJob(job.id, { status: 'queued', stage: 'check', step: 'checking', progress: 55, usage });
        return { outcome: 'continue' };
      }
    }
    const text = blocksToPlainText(draft.body);

    // ---- 3. checks
    await store.updateJob(job.id, { step: 'checking', progress: 60 });
    const safety = await deps.safety.checkText({ text: `${draft.title}\n${draft.summary}\n${text}`, band, kind: 'page' });
    usage.tokens += safety.tokens || 0;
    const fact = await deps.factCheck({ title: draft.title, pageText: text, sources: r.sources });
    usage.tokens += fact.tokens || 0;
    const level = readingLevel(text, band);
    // Copy check against the wider web too (Gemini + Google Search). If it cannot run, a person looks.
    let webRefs = [];
    let webChecked;
    if (deps.webReferences) {
      try { const w = await deps.webReferences({ title: draft.title, text }); webRefs = w.refs; webChecked = w.checked; } catch { webChecked = false; }
    }
    const overlap = overlapRatio(text, r.sources.map((s) => s.text).concat(webRefs.map((w) => w.text)));
    let decision = decideOutcome({ safety, fact, level, overlap, band, webChecked });
    // Pages an admin asked for are always left for that admin to publish.
    if (job.params.forceReview && decision.outcome === 'publish') decision = { outcome: 'review', why: ['You asked for this page, so it is waiting for your approval.'] };
    await log('checking', decision.outcome === 'publish' ? 'info' : 'warn', `Decision: ${decision.outcome}`, { why: decision.why });

    // ---- 4. images (never blocks the page)
    let images = [];
    if (decision.outcome !== 'reject') {
      await store.updateJob(job.id, { step: 'images', progress: 80 });
      try {
        const found = await deps.images.imageSearch(draft.imageQuery, { perPage: 4 });
        images = found.slice(0, 2).map(({ url, thumb, alt, credit, creditUrl, licence, provider }) => ({ url, thumb, alt, credit, creditUrl, licence, provider }));
      } catch (err) {
        await log('images', 'warn', `No image: ${err.message}`);
      }
    }

    // ---- 5. save
    const status = { publish: 'published', review: 'ready', reject: 'rejected' }[decision.outcome];
    const pageId = await store.createPage({
      page: {
        title: draft.title, summary: draft.summary, ageBand: band, category, tags: draft.tags,
        body: draft.body, keyFacts: draft.keyFacts, didYouKnow: draft.didYouKnow, glossary: draft.glossary, quiz: draft.quiz,
        images, sources: r.sources.map((s) => ({ title: s.title, url: s.url })), readingMinutes: draft.readingMinutes,
        source: 'ai', featured: false, viewCount: 0, version: 1,
      },
      status,
      report: { safety, fact, level, overlap, webChecked: webChecked === undefined ? null : webChecked, webComparedWith: webRefs.map((w) => w.url).slice(0, 10), decision, jobId: job.id },
    });
    await store.recordPage();
    await store.updateJob(job.id, {
      status: decision.outcome === 'publish' ? 'done' : decision.outcome === 'review' ? 'needs_review' : 'rejected',
      step: 'finished', stage: null, progress: 100, pageId, usage, error: null,
    });
    if (store.clearWork) await store.clearWork(job.id);
    if (decision.outcome === 'review') {
      await store.notifyReview({ title: draft.title, why: decision.why, pageId });
    }
    return { outcome: decision.outcome, pageId };
  } catch (err) {
    const attempts = (job.attempts || 0) + (err.pause ? 0 : 1);
    const giveUp = err.pause ? false : err.retry === false || attempts >= MAX_ATTEMPTS;
    await log('error', 'error', err.message);
    await store.updateJob(job.id, {
      status: giveUp ? 'failed' : 'queued', stage: null, step: giveUp ? 'failed' : 'waiting', attempts, error: String(err.message).slice(0, 300), usage,
    });
    if (giveUp) await store.notifyFailure({ topic, error: err.message });
    return { outcome: giveUp ? 'failed' : 'retry', error: err.message };
  }
}

module.exports = { runJob, JobError, MAX_ATTEMPTS };
