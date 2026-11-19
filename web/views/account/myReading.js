import { h } from '../../lib/dom.js';
import { getAuthState } from '../../state/auth.js';
import { store } from '../../lib/accountStore.js';
import { emptyState } from '../../components/states.js';

const TABS = [
  { id: 'reading', label: 'Currently reading', empty: 'You are not reading anything right now. Open any page and it will appear here.' },
  { id: 'finished', label: 'Finished', empty: 'Pages you finish reading will appear here.' },
  { id: 'saved', label: 'Saved', empty: 'Press "Save for later" on a page to keep it here.' },
];

export default async function render({ query }) {
  const { user } = getAuthState();
  let items = await store.listProgress(user.uid).catch(() => []);
  let tab = TABS.some((t) => t.id === query.tab) ? query.tab : 'reading';
  const root = h('div', { class: 'container section narrow' });

  const filter = (id) => items.filter((i) => i.title && (id === 'reading' ? i.state === 'reading' : id === 'finished' ? i.state === 'finished' : i.saved));

  async function setSaved(item, saved) {
    await store.setProgress(user.uid, item.pageId, { progress: item.progress, state: item.state, saved, title: item.title, slug: item.slug });
    items = items.map((i) => (i.pageId === item.pageId ? { ...i, saved } : i));
    draw();
  }

  function row(item) {
    const href = `/page/${encodeURIComponent(item.slug)}`;
    return h(
      'li',
      { class: 'reading-row' },
      h('div', { class: 'reading-main' },
        h('a', { href: tab === 'reading' ? `${href}?resume=1` : href, class: 'reading-title' }, item.title),
        tab === 'reading'
          ? h('div', { class: 'progress-line' }, h('progress', { max: 100, value: item.progress, 'aria-label': `${item.title}: ${item.progress}% read` }), h('span', {}, `${item.progress}%`))
          : null,
      ),
      h('div', { class: 'reading-actions' },
        tab === 'reading' ? h('a', { class: 'btn btn-small', href: `${href}?resume=1` }, 'Resume') : null,
        tab === 'saved' ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => setSaved(item, false) }, 'Remove') : null,
      ),
    );
  }

  function draw() {
    const list = filter(tab);
    root.replaceChildren(
      h('h1', {}, 'My Reading'),
      h('div', { class: 'tab-row', role: 'group', 'aria-label': 'Reading lists' },
        ...TABS.map((t) => h('button', { type: 'button', class: 'tab-btn', 'aria-pressed': String(t.id === tab), onclick: () => { tab = t.id; draw(); } }, `${t.label} (${filter(t.id).length})`))),
      list.length ? h('ul', { class: 'reading-list' }, ...list.map(row)) : emptyState(TABS.find((t) => t.id === tab).empty),
    );
  }
  draw();
  return { node: root, title: 'My Reading', description: 'Pages you are reading, have finished, or saved.' };
}
