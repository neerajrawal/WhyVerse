import { h } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { hasPin } from '../state/parentLock.js';
import { getAuthState } from '../state/auth.js';

const KEY = 'whyverse.notice.v1';

function seen() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** Short notice about essential storage only. It does not block anything. */
function needsLockHint() {
  const { user, profile } = getAuthState();
  return !hasPin() && !(user && profile);
}

export function showCookieNotice() {
  if (seen()) return;
  const done = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    box.remove();
  };
  const box = h(
    'section',
    { class: 'cookie-notice', 'aria-label': 'Privacy notice' },
    h('p', {}, t('cookie.text'), ' ', h('a', { href: '/privacy' }, t('cookie.more'))),
    needsLockHint() ? h('p', {}, '👨‍👩‍👧 ', t('cookie.parent'), ' ', h('a', { href: '/parent-lock', onclick: done }, t('cookie.parentLink'))) : null,
    h('button', { type: 'button', class: 'btn btn-small', onclick: done }, t('cookie.ok')),
  );
  document.body.appendChild(box);
}
