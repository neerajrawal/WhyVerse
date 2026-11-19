import { h } from '../../lib/dom.js';
import { getMode } from '../../state/mode.js';
import { config } from '../../config.js';
import { callFunction } from '../../backend.js';

const MAX = 500;
const STARTERS = ['Why is the sky blue?', 'How do aeroplanes stay up?', 'Why do we have seasons in India?', 'How do bees make honey?'];

/** The Why Bot. The conversation lives only in this tab: close it and it is gone. Nothing is saved. */
export default async function render() {
  let history = []; // [{role, content}]
  let busy = false;

  const log = h('ol', { class: 'chat-log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
  const status = h('p', { class: 'form-status', role: 'status' });
  const input = h('input', { type: 'text', id: 'chat-q', maxlength: MAX, required: true, autocomplete: 'off', placeholder: 'Ask me why or how…' });
  const send = h('button', { type: 'submit', class: 'btn' }, 'Ask');

  const bubble = (role, text, pages = []) => h('li', { class: `chat-msg chat-${role}` },
    h('strong', { class: 'sr-only' }, role === 'user' ? 'You said: ' : 'Why Bot said: '), h('p', {}, text),
    pages.length ? h('p', { class: 'chat-pages' }, 'Read more: ', ...pages.flatMap((p, i) => [i ? ', ' : '', h('a', { href: `/page/${encodeURIComponent(p.slug)}` }, p.title)])) : null);

  async function ask(question) {
    if (busy) return;
    const q = question.trim();
    if (!q) return;
    busy = true; send.disabled = true; status.textContent = 'Thinking…';
    log.appendChild(bubble('user', q));
    history.push({ role: 'user', content: q });
    input.value = '';
    try {
      let res;
      if (config.demo) res = { reply: 'This is the demo, so I can only pretend! On the real site, I answer using Gemini, with safety checks.', pages: [] };
      else res = await callFunction('chat', { messages: history, mode: getMode() });
      log.appendChild(bubble('bot', res.reply, res.pages));
      history.push({ role: 'assistant', content: res.reply });
      status.textContent = '';
    } catch (err) {
      history.pop();
      status.textContent = (err && err.message) || 'I could not answer. Please try again.';
    }
    busy = false; send.disabled = false; input.focus();
    log.lastElementChild && log.lastElementChild.scrollIntoView({ block: 'nearest' });
  }

  const node = h('div', { class: 'container section narrow' },
    h('h1', {}, 'Ask Why Bot'),
    h('p', { class: 'lead' }, 'Ask a question about science, nature, space, history or how things work.'),
    h('div', { class: 'box box-dyk' }, h('p', {}, 'Why Bot is a computer program, so it can make mistakes. Check important things with a grown-up or a page on WhyVerse. Please do not type your name, school, address or phone number. Nothing you type is saved: when you close this page, it is gone.')),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Example questions' }, ...STARTERS.map((s) => h('button', { type: 'button', class: 'tab-btn', onclick: () => ask(s) }, s))),
    log,
    h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); ask(input.value); } }, h('label', { for: 'chat-q', class: 'sr-only' }, 'Your question'), input, send),
    status,
    h('p', { class: 'mode-note' }, `Answers follow your reading mode (${getMode() === 'teen' || getMode() === 'everything' ? 'Teen' : 'Junior'}). `, h('button', { type: 'button', class: 'link-btn', onclick: () => { history = []; log.replaceChildren(); status.textContent = 'Cleared.'; } }, 'Start a new chat')),
  );
  return { node, title: 'Ask Why Bot', description: 'Ask Why Bot a question about how the world works.' };
}
