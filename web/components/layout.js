import { h, mount } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { modeToggle } from './modeToggle.js';
import { getAuthState, onAuthChange, signOutNow, resendVerification, checkVerified } from '../state/auth.js';
import { navigate } from '../router.js';
import { toast } from './toast.js';

const NAV = [
  { href: '/', key: 'nav.home' },
  { href: '/library', key: 'nav.library' },
  { href: '/ask', key: 'nav.ask' },
  { href: '/how-to-use', key: 'nav.howTo' },
];

function isCurrent(href, path) {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

function accountArea() {
  const box = h('div', { class: 'header-account' });
  function draw() {
    const { ready, user, profile, unread } = getAuthState();
    if (!ready) { mount(box); return; }
    if (!user || !profile) {
      mount(box, h('a', { class: 'btn btn-small btn-ghost', href: user ? '/welcome' : '/sign-in' }, user ? 'Finish sign-up' : 'Adults: sign in'));
      return;
    }
    mount(box,
      h('a', { class: 'bell', href: '/notifications', 'aria-label': unread ? `Notifications, ${unread} unread` : 'Notifications' }, '🔔', unread ? h('span', { class: 'bell-badge', 'aria-hidden': 'true' }, String(Math.min(unread, 99))) : null),
      h('details', { class: 'user-menu' },
        h('summary', {}, h('span', { class: 'sr-only' }, 'Account menu: '), profile.displayName || 'Me'),
        h('ul', {},
          ...[['/for-you', 'For You'], ['/my-reading', 'My Reading'], ['/my-pages', 'My Pages'], ['/write', 'Write a page'], ['/settings', 'Settings']].map(([href, label]) => h('li', {}, h('a', { href, onclick: (e) => e.target.closest('details').removeAttribute('open') }, label))),
          h('li', {}, h('button', { type: 'button', class: 'link-btn', onclick: async () => { await signOutNow(); navigate('/', { replace: true }); } }, 'Sign out')))));
  }
  draw();
  onAuthChange(draw);
  return box;
}

export function verifyBanner() {
  const bar = h('div', { class: 'verify-banner', role: 'status', hidden: true });
  function draw() {
    const { user, profile } = getAuthState();
    const show = Boolean(user && profile && user.emailVerified === false);
    bar.hidden = !show;
    if (!show) { mount(bar); return; }
    mount(bar, h('div', { class: 'container' }, 'Please check your email and open the link we sent, to confirm it is yours. ',
      h('button', { type: 'button', class: 'link-btn', onclick: async () => { try { await resendVerification(); toast('Sent again.'); } catch { toast('Could not send. Try later.'); } } }, 'Send again'), ' · ',
      h('button', { type: 'button', class: 'link-btn', onclick: async () => { await checkVerified(); } }, 'I have confirmed')));
  }
  draw();
  onAuthChange(draw);
  return bar;
}

export function renderHeader(el) {
  const nav = h('nav', { class: 'main-nav', 'aria-label': t('nav.main') });

  function drawNav() {
    const path = location.pathname;
    mount(
      nav,
      h('ul', {}, ...NAV.map((n) => h('li', {}, h('a', { href: n.href, 'aria-current': isCurrent(n.href, path) ? 'page' : null }, t(n.key))))),
    );
  }
  drawNav();
  document.addEventListener('whyverse:route', drawNav);

  mount(
    el,
    h(
      'div',
      { class: 'container header-inner' },
      h('a', { class: 'logo', href: '/', 'aria-label': 'WhyVerse home' }, h('span', { class: 'logo-mark', 'aria-hidden': 'true' }, '?'), h('span', { class: 'logo-text' }, t('site.name'))),
      nav,
      h('div', { class: 'header-mode' }, modeToggle({ compact: true })),
      accountArea(),
    ),
    verifyBanner(),
  );
}

export function renderFooter(el) {
  mount(
    el,
    h(
      'div',
      { class: 'container footer-inner' },
      h('p', { class: 'footer-parents' }, '👨‍👩‍👧 ', t('footer.parents')),
      h(
        'ul',
        { class: 'footer-links' },
        h('li', {}, h('a', { href: '/how-to-use' }, t('nav.howTo'))),
        h('li', {}, h('a', { href: '/terms' }, t('footer.terms'))),
        h('li', {}, h('a', { href: '/privacy' }, t('footer.privacy'))),
        h('li', {}, h('a', { href: '/parent-lock' }, 'Parent lock')),
      ),
      h('p', { class: 'footer-small' }, `© ${new Date().getFullYear()} ${t('site.name')}`),
    ),
  );
}
