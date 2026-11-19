import { h } from '../lib/dom.js';

/** Brief message in the live region (read out by screen readers). */
export function toast(message, ms = 4000) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const el = h('div', { class: 'toast' }, message);
  region.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
