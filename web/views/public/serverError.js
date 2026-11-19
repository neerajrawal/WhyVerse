import { h } from '../../lib/dom.js';
import { t } from '../../i18n/index.js';

export default async function render() {
  return {
    title: t('error.title'),
    description: t('error.lead'),
    node: h(
      'div',
      { class: 'container section narrow center' },
      h('p', { class: 'state-emoji big', 'aria-hidden': 'true' }, '🛠️'),
      h('h1', {}, t('error.title')),
      h('p', { class: 'lead' }, t('error.lead')),
      h('p', {}, h('button', { type: 'button', class: 'btn btn-big', onclick: () => location.reload() }, t('state.retry')), ' ', h('a', { class: 'btn btn-ghost btn-big', href: '/' }, t('back.home'))),
    ),
  };
}
