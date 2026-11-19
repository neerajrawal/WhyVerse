import { h } from '../../lib/dom.js';
import { getMode } from '../../state/mode.js';
import { getAuthState } from '../../state/auth.js';
import { getCategories, getPool } from '../../lib/data.js';
import { store } from '../../lib/accountStore.js';
import { scorePages } from '../../recommend/score.js';
import { pageCard } from '../../components/pageCard.js';
import { emptyState } from '../../components/states.js';

export default async function render() {
  const { user, profile } = getAuthState();
  const mode = getMode();
  const [pool, categories, progress, history] = await Promise.all([
    getPool(mode),
    getCategories().catch(() => []),
    store.listProgress(user.uid).catch(() => []),
    profile.personalisation ? store.listHistory(user.uid, 100).catch(() => []) : Promise.resolve([]),
  ]);
  const names = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const ranked = scorePages({ pages: pool, interests: profile.interests || [], history, progress, categoryNames: names })
    .filter((r) => r.score > -50)
    .slice(0, 12);

  const cards = ranked.map((r) => {
    const card = pageCard(r.page, categories);
    if (r.reasons.length) card.querySelector('.card-body').prepend(h('p', { class: 'card-reason' }, '✨ ', r.reasons.join(' · ')));
    return card;
  });

  const node = h(
    'div',
    { class: 'container section' },
    h('h1', {}, 'For You'),
    h('p', { class: 'lead' }, profile.personalisation
      ? 'Picked using your interests, and the pages and searches you chose to let WhyVerse remember.'
      : 'Picked using the topics you chose.'),
    profile.personalisation ? null : h('div', { class: 'box box-dyk' }, h('p', {}, 'Want better suggestions? You can let WhyVerse use your own searches and reading history. It is off right now. ', h('a', { href: '/settings' }, 'Open Settings'), '.')),
    (profile.interests || []).length || profile.personalisation ? null : h('p', {}, 'Tip: choose some topics you like in ', h('a', { href: '/settings' }, 'Settings'), ' for better suggestions.'),
    cards.length ? h('div', { class: 'card-grid' }, ...cards) : emptyState('Nothing to suggest yet. Browse the Library to get started.', h('a', { class: 'btn', href: '/library' }, 'Open the Library')),
    h('details', { class: 'how-details' }, h('summary', {}, 'How are these chosen?'), h('p', {}, 'Each page gets points: +5 if it is about a topic you like; up to +6 for topics you have read a lot lately (only if you switched on suggestions from history); up to +3 for pages matching your recent searches; up to +2 for new pages; up to +1.5 for popular pages. Pages you have already finished are left out. There is no hidden profile: this is all worked out on your device.')),
  );
  return { node, title: 'For You', description: 'Pages picked for you.' };
}
