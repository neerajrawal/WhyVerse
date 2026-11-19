import { h } from '../../lib/dom.js';

export default async function render() {
  const node = h(
    'div',
    { class: 'container section narrow' },
    h('h1', {}, 'Terms of use'),
    h('p', { class: 'lead' }, 'Simple rules for using WhyVerse.'),

    h('h2', {}, '1. Using the site'),
    h('p', {}, 'WhyVerse is free to read. You can read as a guest without signing in. Please use it kindly and do not try to break it, overload it or get into parts that are not meant for you.'),

    h('h2', {}, '2. Accounts are for adults'),
    h('p', {}, 'You must be 18 or older to make an account, and you confirm this when you sign up. If we learn that someone under 18 has an account, we may delete it.'),

    h('h2', {}, '3. Pages written with AI'),
    h('p', {}, 'Most pages are written by AI from public sources and checked automatically and by people. We work hard to be accurate, but mistakes can happen. Pages are for learning and fun. They are not medical, legal or safety advice. If something looks wrong, please use "Report this page".'),

    h('h2', {}, '4. Pages written by adults'),
    h('p', {}, 'If you write a page, you promise that it is your own work, that it is accurate and suitable for children, and that it has no personal information about anyone, no links and no copied text. Every page is checked and must be approved before it is published. We may reject, change or remove any page at any time. You can unpublish or delete your own pages. Your display name is shown with your page.'),

    h('h2', {}, '5. Pictures and sources'),
    h('p', {}, 'Pictures are free-to-use images with credit shown on the page. Facts are written in our own words from the sources listed at the bottom of each page.'),

    h('h2', {}, '6. No promises'),
    h('p', {}, 'We try to keep WhyVerse available and correct, but we provide it as it is, without guarantees, and we are not responsible for decisions made using it.'),

    h('h2', {}, '7. Changes'),
    h('p', {}, 'We may update these terms. The version on this page is the current one.'),

    h('p', {}, 'See also: ', h('a', { href: '/privacy' }, 'Privacy'), '.'),
  );
  return { node, title: 'Terms of use', description: 'The simple rules for using WhyVerse.' };
}
