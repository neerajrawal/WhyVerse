import { h } from '../lib/dom.js';
import { t } from '../i18n/index.js';

/** Previous / Next with the current page number. */
export function pagination({ page, hasNext, onPrev, onNext }) {
  if (page === 1 && !hasNext) return null;
  return h(
    'nav',
    { class: 'pagination', 'aria-label': 'Pages of results' },
    h('button', { type: 'button', class: 'btn btn-ghost', disabled: page <= 1, onclick: onPrev }, '← ', t('lib.prev')),
    h('span', { class: 'pagination-page', 'aria-current': 'page' }, `Page ${page}`),
    h('button', { type: 'button', class: 'btn btn-ghost', disabled: !hasNext, onclick: onNext }, t('lib.next'), ' →'),
  );
}
