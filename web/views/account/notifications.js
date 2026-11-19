import { h, formatDate } from '../../lib/dom.js';
import { getAuthState, refreshUnread } from '../../state/auth.js';
import { store } from '../../lib/accountStore.js';
import { emptyState } from '../../components/states.js';

export default async function render() {
  const { user } = getAuthState();
  let list = await store.listNotifications(user.uid).catch(() => []);
  const root = h('div', { class: 'container section narrow' });

  async function open(n) {
    if (!n.read) {
      await store.markNotificationRead(user.uid, n.id).catch(() => {});
      list = list.map((x) => (x.id === n.id ? { ...x, read: true } : x));
      refreshUnread();
      draw();
    }
  }
  async function markAll() {
    await Promise.all(list.filter((n) => !n.read).map((n) => store.markNotificationRead(user.uid, n.id).catch(() => {})));
    list = list.map((n) => ({ ...n, read: true }));
    refreshUnread();
    draw();
  }

  function draw() {
    const unread = list.filter((n) => !n.read).length;
    root.replaceChildren(
      h('h1', {}, 'Notifications'),
      unread ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: markAll }, `Mark all ${unread} as read`) : null,
      list.length
        ? h('ul', { class: 'reading-list' }, ...list.map((n) => h('li', { class: `reading-row${n.read ? '' : ' unread'}` },
          h('div', { class: 'reading-main' },
            h('strong', {}, n.read ? '' : '● ', n.title),
            n.body ? h('span', {}, n.body) : null,
            h('span', { class: 'mode-note' }, formatDate(n.createdAt))),
          n.link ? h('a', { class: 'btn btn-ghost btn-small', href: n.link, onclick: () => open(n) }, 'Open') : h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => open(n) }, 'OK'))))
        : emptyState('No notifications yet.'),
    );
  }
  draw();
  return { node: root, title: 'Notifications', description: 'Your WhyVerse notifications.' };
}
