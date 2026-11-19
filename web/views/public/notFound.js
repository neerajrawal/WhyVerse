import { h } from '../../lib/dom.js';
import { t } from '../../i18n/index.js';

export default async function render() {
  return {
    title: t('notfound.title'),
    description: t('notfound.lead'),
    node: h(
      'div',
      { class: 'container section narrow center' },
      h('p', { class: 'state-emoji big', 'aria-hidden': 'true' }, '🧭'),
      h('h1', {}, t('notfound.title')),
      h('p', { class: 'lead' }, t('notfound.lead')),
      h('p', {}, h('a', { class: 'btn btn-big', href: '/' }, t('back.home'))),
    ),
  };
}
