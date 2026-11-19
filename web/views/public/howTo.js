import { h } from '../../lib/dom.js';
import { t } from '../../i18n/index.js';

const step = (n, title, ...body) => h('li', { class: 'howto-step' }, h('span', { class: 'step-num', 'aria-hidden': 'true' }, n), h('div', {}, h('h3', {}, title), ...body));

export default async function render() {
  const node = h(
    'div',
    { class: 'container section narrow' },
    h('h1', {}, t('nav.howTo')),
    h('p', { class: 'lead' }, 'WhyVerse is a library of friendly pages that explain how and why things work. Here is everything you need to know.'),

    h('section', { 'aria-labelledby': 'h-what' },
      h('h2', { id: 'h-what' }, '🌍 What is WhyVerse?'),
      h('p', {}, 'WhyVerse has pages about space, animals, nature, science, history, India and more. Each page has easy explanations, key facts, a glossary, a quick quiz and a list of where the facts came from.'),
    ),

    h('section', { 'aria-labelledby': 'h-made' },
      h('h2', { id: 'h-made' }, '🛠️ How are the pages made?'),
      h('p', {}, 'Most pages are researched and written by a computer program (an AI), using reliable sources. Then another check compares what it wrote with those sources to catch mistakes, and a safety check makes sure it suits the age group. Grown-ups who look after WhyVerse can read and change any page.'),
      h('p', {}, 'Some pages are written by adult readers. Those are always checked by the system and approved by a grown-up before anyone can read them. The author\'s display name is shown, never their real name.'),
      h('p', {}, 'AI can still make mistakes. If something looks wrong, use the ', h('strong', {}, 'Report this page'), ' button at the bottom of the page.'),
    ),

    h('section', { 'aria-labelledby': 'h-read' },
      h('h2', { id: 'h-read' }, '📖 How to read as a guest'),
      h('p', {}, 'You do not need to sign in or give your name. Just start reading.'),
      h('ol', { class: 'howto-steps' },
        step(1, 'Pick your reading mode', 'Use the switch at the top: ', h('strong', {}, 'All ages'), ' (pages suitable for everyone), ', h('strong', {}, 'Junior (6–12)'), ' or ', h('strong', {}, 'Teen (13–17)'), '. Junior shows Junior pages plus All ages pages. Teen shows Teen pages plus All ages pages. Anyone can switch to All ages. Moving between Junior and Teen needs a grown-up: a signed-in adult, or a PIN a parent sets on this device (see Parent lock in the footer). WhyVerse remembers your choice on this device only.'),
        step(2, 'Find something', 'Type what you are curious about in the search box, or pick a topic on the home page, or browse the Library.'),
        step(3, 'Read, then try the quiz', 'Quiz answers are checked on your device. Nothing you answer is saved or sent anywhere.'),
        step(4, 'Tell us if something is wrong', 'Press Report this page and choose a reason. You do not need to tell us who you are.'),
      ),
    ),

    h('section', { 'aria-labelledby': 'h-adults' },
      h('h2', { id: 'h-adults' }, '🧑 For adults (18 and over)'),
      h('p', {}, 'Adults can make a free account, with Google or an email and password. You will be asked to confirm that you are 18 or older. Children cannot have accounts.'),
      h('ul', {},
        h('li', {}, h('strong', {}, 'For You: '), 'suggestions based on the topics you pick. If you choose to turn it on, WhyVerse can also use your own searches and reading history. You can turn it off and clear it any time.'),
        h('li', {}, h('strong', {}, 'My Reading: '), 'pages you are reading, finished and saved.'),
        h('li', {}, h('strong', {}, 'Write a page: '), 'share what you know. Pages are read by children, so they must be accurate, kind and free of personal details. Use headings, bold and lists only. No links or pictures yet. You can send up to 2 pages a day. Every page is checked and approved by a grown-up before it is published.'),
        h('li', {}, h('strong', {}, 'Your data: '), 'in Settings you can change your details, download your data or delete your account.'),
      ),
    ),

    h('section', { 'aria-labelledby': 'h-chat' },
      h('h2', { id: 'h-chat' }, '💬 The chat helper'),
      h('p', {}, 'The round chat button in the corner can help you find pages ("show me space pages"), explain the page you are reading in simpler words, and answer questions about WhyVerse. In Junior mode it is extra careful and friendly.'),
      h('p', {}, h('strong', {}, 'Please never type your name, address, school, phone number or email into the chat.'), ' The helper will ignore personal details and politely say no to unsafe topics. For guests, the conversation is not saved and disappears when you close the tab.'),
    ),

    h('section', { 'aria-labelledby': 'h-safe' },
      h('h2', { id: 'h-safe' }, '🛡️ Safety'),
      h('ul', {},
        h('li', {}, 'No ads, ever.'),
        h('li', {}, 'No tracking of what you read, search or click.'),
        h('li', {}, 'Every page is checked for its age group before it is shown.'),
        h('li', {}, 'If you see something that worries or upsets you, tell a trusted grown-up and use the Report button.'),
      ),
    ),

    h('section', { class: 'box', 'aria-labelledby': 'h-parents' },
      h('h2', { id: 'h-parents' }, '👨‍👩‍👧 For parents'),
      h('p', {}, 'WhyVerse collects no data from children. Children read as guests: there are no accounts, no sign-up, no names, no ads and no behavioural tracking. The only things kept on your child\'s device are their Junior/Teen choice and a note that they have seen our privacy message. Our counters count page views as plain totals with no way to tell who looked. Read the ', h('a', { href: '/privacy' }, 'Privacy page'), ' for details.'),
    ),
  );
  return { node, title: t('nav.howTo'), description: 'How WhyVerse works: how pages are made, how to read as a guest, how adults can sign in and write pages, the chat helper, safety and privacy.' };
}
