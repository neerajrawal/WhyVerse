import { h, inline, formatDate, setMeta } from '../../lib/dom.js';
import { t } from '../../i18n/index.js';
import { getMode, bandsForMode } from '../../state/mode.js';
import { requestModeChange } from '../../components/modeToggle.js';
import { getCategories, getPageBySlug, getRelated, recordView } from '../../lib/data.js';
import { cardGrid, bandChip } from '../../components/pageCard.js';
import { quizSection } from '../../components/quiz.js';
import { reportButton } from '../../components/reportButton.js';
import { navigate } from '../../router.js';
import { isAdult } from '../../state/auth.js';
import { trackOpen, getRecord, toggleSaved } from '../../lib/tracking.js';
import notFound from './notFound.js';

/** Turn stored blocks into DOM. Text only, never HTML. */
export function renderBody(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'h2') out.push(h('h2', {}, b.text));
    else if (b.type === 'h3') out.push(h('h3', {}, b.text));
    else if (b.type === 'p') out.push(h('p', {}, inline(b.text)));
    else if (b.type === 'ul' || b.type === 'ol') out.push(h(b.type, {}, ...(b.items || []).map((i) => h('li', {}, inline(i)))));
  }
  return h('div', { class: 'prose' }, ...out);
}

function creditLine(img) {
  const who = img.creditUrl
    ? h('a', { href: img.creditUrl, target: '_blank', rel: 'noopener noreferrer' }, img.credit)
    : img.credit;
  const where = img.sourceUrl
    ? h('a', { href: img.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, img.provider === 'pexels' ? 'Pexels' : 'source')
    : (img.provider === 'pexels' ? 'Pexels' : '');
  return h('span', {}, 'Photo by ', who, where ? ' on ' : '', where || '', img.licence ? ` · ${img.licence}` : '');
}

export default async function render({ params, query }) {
  const page = await getPageBySlug(params.slug);
  if (!page) return notFound();

  const mode = getMode();
  const categories = await getCategories().catch(() => []);
  const cat = categories.find((c) => c.id === page.category);

  // Soft age gate: pages for another band are not shown in this reading mode.
  if (!bandsForMode(mode).includes(page.ageBand)) {
    const wanted = page.ageBand === 'teen' ? 'teen' : 'junior';
    return {
      title: page.title,
      description: '',
      node: h(
        'div',
        { class: 'container section narrow' },
        h('h1', {}, page.title),
        h('p', { class: 'lead' }, t('page.wrongBand', { band: t(`band.${page.ageBand}`) })),
        h('button', { type: 'button', class: 'btn btn-big', onclick: async () => { if (await requestModeChange(wanted)) navigate(location.pathname, { replace: true }); } }, t('page.switchMode', { mode: t(`mode.${wanted}`) })),
        h('p', {}, h('a', { href: '/library' }, '← ', t('lib.title'))),
      ),
    };
  }

  recordView(page.id);
  const hero = page.images[0];

  const saveBtn = isAdult()
    ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', 'aria-pressed': 'false', onclick: async (e) => {
      const on = await toggleSaved(page);
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.textContent = on ? '★ Saved' : '☆ Save for later';
    } }, '☆ Save for later')
    : null;
  const header = h(
    'header',
    { class: 'page-head' },
    h('div', { class: 'chips' }, bandChip(page.ageBand), cat ? h('a', { class: 'chip', href: `/library?category=${encodeURIComponent(cat.id)}` }, `${cat.emoji} ${cat.name}`) : null),
    h('h1', {}, page.title),
    h('p', { class: 'lead' }, page.summary),
    h(
      'p',
      { class: 'page-meta' },
      t('page.minutes', { n: page.readingMinutes }),
      page.publishedAt ? ` · ${formatDate(page.publishedAt)}` : '',
      page.source === 'user' && page.authorName ? ` · ${t('page.by', { name: page.authorName })}` : '',
    ),
    saveBtn,
  );

  const figure = hero && hero.url
    ? h('figure', { class: 'hero-figure' }, h('img', { src: hero.url, alt: hero.alt || '', width: 1200, height: 675, fetchpriority: 'high' }), h('figcaption', {}, creditLine(hero)))
    : h('div', { class: 'hero-emoji', 'aria-hidden': 'true' }, cat ? cat.emoji : '💡');

  const keyFacts = page.keyFacts.length
    ? h('section', { class: 'box box-facts', 'aria-labelledby': 'kf-h' }, h('h2', { id: 'kf-h' }, '🔑 ', t('page.keyFacts')), h('ul', {}, ...page.keyFacts.map((f) => h('li', {}, inline(f)))))
    : null;

  const dyk = page.didYouKnow.length
    ? h('section', { class: 'box box-dyk', 'aria-labelledby': 'dyk-h' }, h('h2', { id: 'dyk-h' }, '💡 ', t('page.didYouKnow')), ...page.didYouKnow.map((f) => h('p', {}, inline(f))))
    : null;

  const glossary = page.glossary.length
    ? h(
      'section',
      { class: 'box', 'aria-labelledby': 'gl-h' },
      h('h2', { id: 'gl-h' }, '📖 ', t('page.glossary')),
      h('dl', { class: 'glossary' }, ...page.glossary.flatMap((g) => [h('dt', {}, String(g.term || '')), h('dd', {}, String(g.meaning || ''))])),
    )
    : null;

  const sources = page.sources.length
    ? h(
      'section',
      { class: 'box', 'aria-labelledby': 'src-h' },
      h('h2', { id: 'src-h' }, '🔗 ', t('page.sources')),
      h('ul', {}, ...page.sources.map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, String(s.title || s.url))))),
    )
    : null;

  const credits = page.images.filter((i) => i.credit).length
    ? h('section', { class: 'box', 'aria-labelledby': 'ic-h' }, h('h2', { id: 'ic-h' }, '📷 ', t('page.imageCredits')), h('ul', {}, ...page.images.filter((i) => i.credit).map((i) => h('li', {}, creditLine(i)))))
    : null;

  const related = await getRelated(page).catch(() => []);
  const relatedSection = related.length
    ? h('section', { class: 'section', 'aria-labelledby': 'rel-h' }, h('h2', { id: 'rel-h' }, '🧭 ', t('page.related')), cardGrid(related, categories))
    : null;

  const node = h(
    'div',
    { class: 'container section' },
    h('article', { class: 'article narrow' }, header, figure, renderBody(page.body), keyFacts, dyk, glossary, quizSection(page.quiz), sources, credits, h('div', { class: 'article-end' }, reportButton(page))),
    relatedSection,
  );

  setMeta({ title: page.title, description: page.summary, url: location.href, image: hero && hero.url ? hero.url : undefined });
  if (isAdult()) {
    // After the router has put the page on screen: start tracking, show the saved state, resume if asked.
    setTimeout(async () => {
      const article = document.querySelector('.article');
      await trackOpen(page, article);
      const rec = await getRecord(page);
      if (saveBtn && rec && rec.saved) { saveBtn.setAttribute('aria-pressed', 'true'); saveBtn.textContent = '★ Saved'; }
      if (query && query.resume === '1' && rec && rec.progress > 1 && rec.progress < 100 && article) {
        const top = article.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: top + (article.offsetHeight * rec.progress) / 100 - window.innerHeight * 0.5, behavior: 'auto' });
      }
    }, 0);
  }
  return { node, title: page.title, description: page.summary, image: hero && hero.url ? hero.url : undefined };
}
