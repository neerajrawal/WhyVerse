import { h } from '../../lib/dom.js';
import { t } from '../../i18n/index.js';
import { getMode } from '../../state/mode.js';
import { getCategories, getFeatured, listPages } from '../../lib/data.js';
import { cardGrid } from '../../components/pageCard.js';
import { modeToggle } from '../../components/modeToggle.js';
import { emptyState, errorState, loadingBlock } from '../../components/states.js';
import { navigate } from '../../router.js';

export default async function render() {
  const categories = await getCategories().catch(() => []);

  const input = h('input', { type: 'search', id: 'home-search', name: 'q', class: 'search-input', placeholder: t('home.search'), autocomplete: 'off', maxlength: 60, 'aria-label': t('home.search') });
  const form = h(
    'form',
    { class: 'search-form', role: 'search', onsubmit: (e) => {
      e.preventDefault();
      const q = input.value.trim();
      navigate(q ? `/library?q=${encodeURIComponent(q)}` : '/library');
    } },
    input,
    h('button', { type: 'submit', class: 'btn btn-big' }, t('home.searchButton')),
  );

  const hero = h(
    'section',
    { class: 'hero' },
    h('div', { class: 'container hero-inner' },
      h('h1', {}, t('home.title')),
      h('p', { class: 'lead' }, t('home.lead')),
      form,
      modeToggle(),
    ),
  );

  const featured = h('section', { class: 'container section', 'aria-labelledby': 'featured-h' });
  const newest = h('section', { class: 'container section', 'aria-labelledby': 'newest-h' });

  async function fill() {
    const mode = getMode();
    featured.replaceChildren(h('h2', { id: 'featured-h' }, '⭐ ', t('home.featured')), loadingBlock());
    newest.replaceChildren(h('h2', { id: 'newest-h' }, '🆕 ', t('home.newest')), loadingBlock());
    try {
      const [feat, latestAll] = await Promise.all([getFeatured(mode), listPages({ mode, pageSize: 9 })]);
      // Do not repeat featured pages in "Newest".
      const featIds = new Set(feat.map((p) => p.id));
      const latest = { items: latestAll.items.filter((p) => !featIds.has(p.id)).slice(0, 6) };
      featured.replaceChildren(h('h2', { id: 'featured-h' }, '⭐ ', t('home.featured')), feat.length ? cardGrid(feat, categories) : emptyState(t('lib.empty')));
      newest.replaceChildren(
        h('h2', { id: 'newest-h' }, '🆕 ', t('home.newest')),
        latest.items.length ? cardGrid(latest.items, categories) : emptyState(t('lib.empty')),
        h('p', { class: 'center' }, h('a', { class: 'btn btn-ghost', href: '/library' }, t('home.seeAll'), ' →')),
      );
    } catch (err) {
      console.error(err);
      featured.replaceChildren(h('h2', { id: 'featured-h' }, t('home.featured')), errorState(t('state.error'), fill));
      newest.replaceChildren();
    }
  }
  fill();

  const topics = h(
    'section',
    { class: 'container section', 'aria-labelledby': 'topics-h' },
    h('h2', { id: 'topics-h' }, '🧭 ', t('home.topics')),
    h('ul', { class: 'topic-grid' }, ...categories.map((c) => h('li', {}, h('a', { class: 'topic', href: `/library?category=${encodeURIComponent(c.id)}` }, h('span', { class: 'topic-emoji', 'aria-hidden': 'true' }, c.emoji), h('span', {}, c.name))))),
  );

  return { node: h('div', {}, hero, featured, topics, newest), title: '', description: t('home.lead') };
}
