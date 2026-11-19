import { h, formatDate } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { categoryName } from '../lib/data.js';

const EMOJI_FALLBACK = '💡';

export function bandChip(band) {
  return h('span', { class: `chip chip-band chip-${band}` }, t(`band.${band}`));
}

/** One page in a grid. `categories` is the loaded category list (for names and emoji). */
export function pageCard(page, categories = []) {
  const cat = categories.find((c) => c.id === page.category);
  const img = page.images && page.images[0];
  const thumb = img && (img.thumb || img.url)
    ? h('img', { src: img.thumb || img.url, alt: img.alt || '', loading: 'lazy', width: 400, height: 225 })
    : h('span', { class: 'card-emoji', 'aria-hidden': 'true' }, cat ? cat.emoji : EMOJI_FALLBACK);

  return h(
    'article',
    { class: 'card' },
    h('div', { class: 'card-thumb' }, thumb),
    h(
      'div',
      { class: 'card-body' },
      h('div', { class: 'chips' }, bandChip(page.ageBand), cat ? h('span', { class: 'chip' }, cat.name) : null),
      h('h3', { class: 'card-title' }, h('a', { href: `/page/${encodeURIComponent(page.slug)}`, class: 'card-link' }, page.title)),
      h('p', { class: 'card-summary' }, page.summary),
      h(
        'p',
        { class: 'card-meta' },
        t('page.minutes', { n: page.readingMinutes }),
        page.source === 'user' && page.authorName ? ` · ${t('page.by', { name: page.authorName })}` : '',
        page.publishedAt ? ` · ${formatDate(page.publishedAt)}` : '',
      ),
    ),
  );
}

export function cardGrid(pages, categories) {
  return h('div', { class: 'card-grid' }, ...pages.map((p) => pageCard(p, categories)));
}

export { categoryName };
