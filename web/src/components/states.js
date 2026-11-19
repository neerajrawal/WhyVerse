import { h } from '../lib/dom.js';
import { t } from '../i18n/index.js';

export function loadingBlock(label = t('lib.loading')) {
  return h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', {}, label));
}

export function emptyState(message, action) {
  return h('div', { class: 'state state-empty' }, h('p', { class: 'state-emoji', 'aria-hidden': 'true' }, '🔍'), h('p', {}, message), action || null);
}

export function errorState(message = t('state.error'), onRetry) {
  return h(
    'div',
    { class: 'state state-error', role: 'alert' },
    h('p', { class: 'state-emoji', 'aria-hidden': 'true' }, '😕'),
    h('p', {}, message),
    onRetry ? h('button', { type: 'button', class: 'btn', onclick: onRetry }, t('state.retry')) : null,
  );
}
