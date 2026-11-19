import { h } from '../../lib/dom.js';
import { config } from '../../config.js';

const row = (a, b, c) => h('tr', {}, h('td', {}, a), h('td', {}, b), h('td', {}, c));

export default async function render() {
  const contact = config.contactEmail
    ? h('p', {}, 'Questions or requests about your data: ', h('a', { href: `mailto:${config.contactEmail}` }, config.contactEmail), '.')
    : h('p', {}, 'Questions or requests about your data: please contact the person who runs this site.');

  const node = h(
    'div',
    { class: 'container section narrow' },
    h('h1', {}, 'Privacy'),
    h('p', { class: 'lead' }, 'The short version: WhyVerse collects nothing about children, shows no ads, and asks adults for as little as possible.'),

    h('h2', {}, 'If you are reading as a guest (including all children)'),
    h('p', {}, 'You do not sign in and we do not ask who you are. We do not log which pages you read, what you search for or how far you scroll, and we do not build a profile of you. There are no ads and no third-party trackers.'),
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('caption', {}, 'Everything that is stored when you are a guest'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'What'), h('th', { scope: 'col' }, 'Where'), h('th', { scope: 'col' }, 'Why and for how long'))),
        h('tbody', {},
          row('Your Junior / Teen choice and "I saw the privacy notice"', 'On your device only', 'So the site remembers your choice. Clear your browser data to remove it.'),
          row('If a grown-up sets a parent lock: a one-way scrambled PIN', 'On your device only, never sent to us', 'So Junior and Teen cannot be switched without a grown-up. Clearing your browser data removes it.'),
          row('A total count of views for each page', 'Our database, as plain numbers', 'To show popular pages. No way to tell who viewed.'),
          row('Search words (letters only, no personal-looking text) with a running count', 'Our database', 'To see what readers want more of. Not linked to any person or device.'),
          row('A one-way scrambled code made from your internet address, mixed with a secret that changes daily', 'Our database', 'Only to stop spam and repeated reports. It cannot be turned back into your address, changes every day, and is deleted automatically within hours.'),
          row('If you ask Why Bot: your question and the last few messages of that chat, plus the word Junior or Teen', 'Sent to Google\'s Gemini service to write the answer. We do not save it', 'Only to answer you. We check it for personal details first and do not keep it. Please never type your name, school, address or phone number.'),
          row('If you press "Report this page": the page, the reason you picked, and the time', 'Our database', 'So a grown-up can check the page. Nothing about you is stored.'),
        ),
      ),
    ),

    h('h2', {}, 'If you are an adult with an account (18 and over)'),
    h('p', {}, 'Accounts are only for people aged 18 or over. You confirm this when you sign up. We keep your email address (through Firebase Authentication), a display name you choose (please do not use your real name), your chosen interests, and the pages you write, save or are reading.'),
    h('p', {}, 'If you switch on "personalise for me", we also keep your recent searches and the pages you open and finish, to make suggestions. It is off until you turn it on, you can turn it off at any time, and "Clear history" deletes it. If you choose to save chats with the chat helper, they are kept in your account and you can delete them.'),
    h('p', {}, 'You can download your data or delete your account and everything linked to it from Settings.'),

    h('h2', {}, 'AI and other services'),
    h('p', {}, 'Pages are written and checked with AI (Google Gemini). Only public topic information and web sources are sent for that, never anything about readers. When you use the chat helper, your message is sent to the same AI service to write a reply, after we try to remove personal details. Please do not type personal details into chat. The site runs on Google Firebase, in India (Mumbai), and uses Google reCAPTCHA to tell people from automated programs. Pictures come from Pexels.'),

    h('h2', {}, 'Cookies and device storage'),
    h('p', {}, 'We use only what is strictly needed: your reading-mode choice and notice flag on your device, and, for adults who sign in, the sign-in session. No advertising or analytics cookies.'),

    h('h2', {}, 'Your rights'),
    h('p', {}, 'Under India\'s Digital Personal Data Protection Act, 2023, adults can ask to see, correct or delete their data and can withdraw consent at any time. Most of this you can do yourself in Settings.'),
    contact,
  );
  return { node, title: 'Privacy', description: 'What WhyVerse stores, why, and how long. No data is collected from children.' };
}
