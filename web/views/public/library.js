import { h } from '../../lib/dom.js';
import { t } from '../../i18n/index.js';
import { config } from '../../config.js';
import { getMode, bandsForMode } from '../../state/mode.js';
import { getCategories, listPages, searchPages, recordSearch } from '../../lib/data.js';
import { cardGrid } from '../../components/pageCard.js';
import { pagination } from '../../components/pagination.js';
import { emptyState, errorState, loadingBlock } from '../../components/states.js';
import { navigate } from '../../router.js';
import { trackSearch } from '../../lib/tracking.js';

export default async function render({ query }) {
  const mode = getMode();
  const categories = await getCategories().catch(() => []);
  const allowedBands = bandsForMode(mode);

  const state = {
    q: (query.q || '').slice(0, 60),
    category: query.category || '',
    band: allowedBands.includes(query.band) ? query.band : '',
    sort: query.sort === 'popular' ? 'popular' : 'new',
  };

  function go(patch) {
    const next = { ...state, ...patch };
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.category) p.set('category', next.category);
    if (next.band) p.set('band', next.band);
    if (next.sort !== 'new') p.set('sort', next.sort);
    navigate(`/library${p.toString() ? `?${p}` : ''}`);
  }

  const select = (id, label, options, value, onchange) => h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    h('select', { id, onchange: (e) => onchange(e.target.value) }, ...options.map(([v, text]) => h('option', { value: v, selected: v === value ? true : null }, text))),
  );

  const searchInput = h('input', { type: 'search', id: 'lib-q', class: 'search-input', value: state.q, placeholder: t('home.search'), maxlength: 60, autocomplete: 'off', 'aria-label': t('home.search') });
  const searchForm = h(
    'form',
    { class: 'search-form', role: 'search', onsubmit: (e) => { e.preventDefault(); const q = searchInput.value.trim(); if (q) { recordSearch(q); trackSearch(q); } go({ q }); } },
    searchInput,
    h('button', { type: 'submit', class: 'btn' }, t('home.searchButton')),
  );

  const filters = h(
    'div',
    { class: 'filters' },
    select('f-cat', t('lib.category'), [['', t('lib.all')], ...categories.map((c) => [c.id, `${c.emoji} ${c.name}`])], state.category, (v) => go({ category: v })),
    select('f-band', t('lib.band'), [['', t('lib.all')], ...allowedBands.map((b) => [b, t(`band.${b}`)])], state.band, (v) => go({ band: v })),
    select('f-sort', t('lib.sort'), [['new', t('lib.sortNew')], ['popular', t('lib.sortPopular')]], state.sort, (v) => go({ sort: v })),
  );

  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const status = h('p', { class: 'results-status', role: 'status' });

  // ----- loading logic -----
  const cursors = [null]; // cursors[i] = where page i+1 starts (browse mode)
  let pageNo = 1;
  let searchHits = null; // all matches (search mode)

  async function load() {
    results.replaceChildren(loadingBlock());
    try {
      let items;
      let hasNext;
      if (state.q) {
        if (!searchHits) searchHits = await searchPages({ term: state.q, mode, category: state.category, band: state.band, sort: state.sort });
        const start = (pageNo - 1) * config.pageSize;
        items = searchHits.slice(start, start + config.pageSize);
        hasNext = start + config.pageSize < searchHits.length;
        status.textContent = `${searchHits.length} result${searchHits.length === 1 ? '' : 's'} for “${state.q}”`;
      } else {
        const res = await listPages({ mode, category: state.category, band: state.band, sort: state.sort, cursor: cursors[pageNo - 1] });
        items = res.items;
        hasNext = Boolean(res.next);
        if (hasNext) cursors[pageNo] = res.next;
        status.textContent = '';
      }
      const pager = pagination({
        page: pageNo,
        hasNext,
        onPrev: () => { pageNo -= 1; load(); window.scrollTo({ top: 0 }); },
        onNext: () => { pageNo += 1; load(); window.scrollTo({ top: 0 }); },
      });
      results.replaceChildren(items.length ? cardGrid(items, categories) : emptyState(t('lib.empty')), pager);
    } catch (err) {
      console.error(err);
      results.replaceChildren(errorState(t('state.error'), load));
    }
  }
  load();

  const node = h(
    'div',
    { class: 'container section' },
    h('h1', {}, t('lib.title')),
    h('p', { class: 'lead' }, t('lib.lead')),
    searchForm,
    filters,
    status,
    results,
  );
  return { node, title: t('lib.title'), description: t('lib.lead') };
}
