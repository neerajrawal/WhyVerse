import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePages } from '../src/recommend/score.js';

const NOW = new Date('2026-11-10T00:00:00Z').getTime();
const mk = (id, category, o = {}) => ({ id, title: o.title || id, summary: '', tags: o.tags || [], category, viewCount: o.views || 0, publishedAt: new Date(o.date || '2026-10-01'), ...o });
const pages = [mk('space1', 'space'), mk('animal1', 'animals'), mk('nature1', 'nature')];
const ids = (r) => r.map((x) => x.page.id);

test('interests lift matching topics to the top', () => {
  assert.equal(ids(scorePages({ pages, interests: ['animals'], now: NOW }))[0], 'animal1');
});

test('finished pages sink, part-read pages drop a little', () => {
  const r = scorePages({ pages, interests: ['space'], progress: [{ pageId: 'space1', state: 'finished' }], now: NOW });
  assert.equal(ids(r).at(-1), 'space1');
  const r2 = scorePages({ pages, interests: ['space'], progress: [{ pageId: 'space1', state: 'reading' }], now: NOW });
  assert.notEqual(ids(r2).at(-1), 'space1');
});

test('history raises the topic the reader keeps opening, and fades with time', () => {
  const recent = [{ type: 'finish', category: 'nature', at: new Date(NOW - DAY(1)) }, { type: 'open', category: 'nature', at: new Date(NOW - DAY(2)) }];
  assert.equal(ids(scorePages({ pages, history: recent, now: NOW }))[0], 'nature1');
  const old = [{ type: 'finish', category: 'nature', at: new Date(NOW - DAY(200)) }];
  const aff = scorePages({ pages, history: old, now: NOW }).find((x) => x.page.id === 'nature1');
  assert.ok(aff.score < 3.5);
});

test('searches match titles and tags, only when all words appear', () => {
  const p = [mk('a', 'x', { title: 'Why do volcanoes erupt', tags: ['lava'] }), mk('b', 'x', { title: 'Honey bees' })];
  const r = scorePages({ pages: p, history: [{ type: 'search', term: 'volcanoes lava', at: new Date(NOW - DAY(1)) }], now: NOW });
  assert.equal(r[0].page.id, 'a');
  assert.ok(r[0].reasons.some((x) => x.includes('searched')));
  const r2 = scorePages({ pages: p, history: [{ type: 'search', term: 'volcanoes dinosaurs', at: new Date(NOW - DAY(1)) }], now: NOW });
  assert.ok(!r2[0].reasons.some((x) => x.includes('searched')));
});

test('newer and more popular pages win ties', () => {
  const p = [mk('old', 'x', { date: '2025-01-01', views: 0 }), mk('new', 'x', { date: '2026-11-08', views: 500 })];
  assert.equal(ids(scorePages({ pages: p, now: NOW }))[0], 'new');
});

function DAY(n) { return n * 86400000; }
