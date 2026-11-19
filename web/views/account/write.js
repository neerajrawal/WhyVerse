import { h, mount } from '../../lib/dom.js';
import { navigate } from '../../router.js';
import { toast } from '../../components/toast.js';
import { getCategories, getPublicSettings } from '../../lib/data.js';
import { store } from '../../lib/accountStore.js';
import { getAuthState, confirmAdultNow, requestAuthorNow } from '../../state/auth.js';
import { ageOn } from '../../lib/age.js';
import { markdownLiteToBlocks, countWords } from '../../lib/markdownLite.js';
import { renderBody } from '../public/pageViewer.js';

const MIN = 150;
const MAX = 1500;
const BANDS = [['all', 'Everyone (written for Junior readers)'], ['junior', 'Junior (ages 6 to 12)'], ['teen', 'Teen (ages 13 to 17)']];

const millis = (v) => (v && v.toMillis ? v.toMillis() : v ? new Date(v).getTime() : 0);

/** Small card shown instead of the editor until the writer has passed a step. */
function gateCard(title, ...children) {
  return h('div', { class: 'container section narrow stack-lg' }, h('h1', {}, title), ...children,
    h('p', {}, h('a', { href: '/my-pages' }, '← Back to My Pages')));
}

function adultGate() {
  const status = h('p', { class: 'form-status', role: 'alert' });
  const dob = h('input', { type: 'date', id: 'ag-dob', required: true, max: new Date().toISOString().slice(0, 10), min: '1900-01-01', autocomplete: 'bday' });
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    status.textContent = '';
    if (ageOn(dob.value) === null) { status.textContent = 'Please enter your real date of birth.'; return; }
    try { await confirmAdultNow(dob.value); navigate('/write', { replace: true }); }
    catch (err) { status.textContent = (err && err.message) || 'We could not check that. Please try again.'; }
  } },
  h('div', { class: 'field' }, h('label', { for: 'ag-dob' }, 'Your date of birth'), dob,
    h('p', { class: 'mode-note' }, 'We use it once to check you are 18 or over, then delete it. We keep only the answer "adult".')),
  status, h('button', { type: 'submit', class: 'btn' }, 'Confirm'));
  return gateCard('Confirm you are an adult', h('p', {}, 'Only adults can write pages. This takes a few seconds.'), form);
}

function authorGate(st) {
  if (st === 'blocked') return gateCard('Writing is turned off', h('p', {}, 'Writing is turned off for your account. You can still read everything. An admin can look at your account and may turn writing back on.'));
  if (st === 'requested') return gateCard('Waiting for approval', h('p', {}, 'Thank you! A grown-up from the WhyVerse team will look at your request. You will get a notification here when you are approved.'));
  const status = h('p', { class: 'form-status', role: 'alert' });
  const note = h('textarea', { id: 'au-note', rows: 4, maxlength: 300, required: true });
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    status.textContent = '';
    try { await requestAuthorNow(note.value); navigate('/write', { replace: true }); }
    catch (err) { status.textContent = (err && err.message) || 'We could not send that. Please try again.'; }
  } },
  h('div', { class: 'field' }, h('label', { for: 'au-note' }, 'What would you like to write about?'), note,
    h('p', { class: 'mode-note' }, 'A sentence or two. Please do not include personal details such as emails, phone numbers or links.')),
  status, h('button', { type: 'submit', class: 'btn' }, 'Ask to become a writer'));
  return gateCard('Become a writer', h('p', {}, 'To keep WhyVerse safe for children, an admin approves each writer once. After that, every page you send is still checked and read before anyone can see it.'), form);
}

export default async function render({ query }) {
  const { user, profile } = getAuthState();
  if (!profile.adultVerifiedAt) return { node: adultGate(), title: 'Confirm you are an adult', description: 'Confirm your age.' };
  const pub = await getPublicSettings();
  if (pub.authorApprovalRequired !== false && profile.authorStatus !== 'approved') {
    return { node: authorGate(profile.authorStatus), title: 'Become a writer', description: 'Ask to write pages for WhyVerse.' };
  }
  const pausedMs = millis(profile.submitBlockedUntil) - Date.now();
  const categories = await getCategories().catch(() => []);
  let id = query.draft || null;
  const existing = id ? await store.getDraft(user.uid, id).catch(() => null) : null;
  if (id && !existing) id = null;

  const status = h('p', { class: 'form-status', role: 'alert' });
  const title = h('input', { type: 'text', id: 'wr-title', maxlength: 120, value: existing ? existing.title : '', required: true });
  const cat = h('select', { id: 'wr-cat' }, ...categories.map((c) => h('option', { value: c.id, selected: existing && existing.category === c.id }, `${c.emoji} ${c.name}`)));
  const band = h('select', { id: 'wr-band' }, ...BANDS.map(([v, l]) => h('option', { value: v, selected: (existing ? existing.ageBand : 'all') === v }, l)));
  const body = h('textarea', { id: 'wr-body', rows: 16, maxlength: 15000, 'aria-describedby': 'wr-help wr-count' }, existing ? existing.body : '');
  const count = h('p', { id: 'wr-count', class: 'mode-note', 'aria-live': 'polite' });
  const preview = h('div', { class: 'preview-pane', hidden: true });
  const saveBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Save draft');
  const prevBtn = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-pressed': 'false' }, 'Preview');
  const sendBtn = h('button', { type: 'button', class: 'btn' }, 'Send for review');

  const words = () => countWords(markdownLiteToBlocks(body.value).map((b) => b.text || b.items.join(' ')).join(' '));
  const updateCount = () => {
    const w = words();
    count.textContent = `${w} words (write ${MIN} to ${MAX})`;
    count.className = `mode-note${w && (w < MIN || w > MAX) ? ' warn' : ''}`;
  };
  body.addEventListener('input', updateCount);
  updateCount();

  const data = () => ({ title: title.value.trim(), category: cat.value, ageBand: band.value, body: body.value });
  async function save() {
    if (!title.value.trim()) { status.textContent = 'Please give your page a title first.'; title.focus(); return false; }
    id = await store.saveDraft(user.uid, id, data());
    history.replaceState({}, '', `/write?draft=${encodeURIComponent(id)}`);
    return true;
  }
  const lock = (on) => [saveBtn, sendBtn].forEach((b) => { b.disabled = on; });

  saveBtn.addEventListener('click', async () => {
    status.className = 'form-status'; status.textContent = '';
    lock(true);
    try { if (await save()) toast('Draft saved.'); } catch { status.textContent = 'Could not save. Please try again.'; } finally { lock(false); }
  });

  prevBtn.addEventListener('click', () => {
    const on = preview.hidden;
    preview.hidden = !on;
    prevBtn.setAttribute('aria-pressed', String(on));
    prevBtn.textContent = on ? 'Hide preview' : 'Preview';
    if (on) mount(preview, h('h2', {}, title.value || 'Your title'), renderBody(markdownLiteToBlocks(body.value)));
  });

  sendBtn.addEventListener('click', async () => {
    status.className = 'form-status'; status.textContent = '';
    lock(true);
    try {
      if (!(await save())) return;
      const res = await store.submitDraft(user.uid, id);
      if (res.status === 'rejected') {
        toast('This page could not be accepted. See My Pages for why.', 6000);
      } else {
        toast('Sent! A grown-up will review it.', 5000);
      }
      navigate('/my-pages');
    } catch (err) {
      status.textContent = (err && err.message) || 'Something went wrong. Your draft is saved. Please try again.';
    } finally { lock(false); }
  });

  const node = h('div', { class: 'container section narrow stack-lg' },
    h('h1', {}, existing ? 'Edit your page' : 'Write a page'),
    pausedMs > 0 ? h('div', { class: 'box box-warn', role: 'status' }, h('p', {}, h('strong', {}, 'Sending is paused for about '), `${Math.max(1, Math.ceil(pausedMs / 3600000))} hour(s). `, 'You can keep writing and saving drafts. This happened because several pages in a row were not accepted.')) : null,
    !pausedMs || pausedMs <= 0 ? (profile.rejectionStreak ? h('div', { class: 'box box-dyk', role: 'status' }, h('p', {}, `${profile.rejectionStreak} of your last pages in a row were not accepted. Please read the reasons in My Pages before sending the next one.`)) : null) : null,
    pub.submissionsOpen === false ? h('div', { class: 'box box-warn', role: 'status' }, h('p', {}, 'Sending pages is switched off for now. You can still write and save drafts.')) : null,
    h('div', { class: 'box box-facts' }, h('p', {}, 'Write in your own words, for readers of WhyVerse. ', h('strong', {}, 'Do not include personal details'), ' (names of private people, addresses, phone numbers, emails) or web links. Every page is checked by the system and then read by a grown-up before anyone else can see it.')),
    h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() },
      h('div', { class: 'field' }, h('label', { for: 'wr-title' }, 'Title'), title),
      h('div', { class: 'two-col' },
        h('div', { class: 'field' }, h('label', { for: 'wr-cat' }, 'Category'), cat),
        h('div', { class: 'field' }, h('label', { for: 'wr-band' }, 'Who is it for?'), band)),
      h('div', { class: 'field' }, h('label', { for: 'wr-body' }, 'Your page'),
        h('p', { id: 'wr-help', class: 'mode-note' }, 'Start a heading with ## and a list item with -. Put **two stars** around a word to make it bold. Leave a blank line between paragraphs.'),
        body, count),
      status,
      h('div', { class: 'quiz-actions' }, saveBtn, prevBtn, sendBtn),
      preview,
    ),
    h('p', {}, h('a', { href: '/my-pages' }, '← Back to My Pages')),
    profile.displayName ? h('p', { class: 'mode-note' }, `It will be shown as written by "${profile.displayName}".`) : null,
  );
  return { node, title: 'Write a page', description: 'Write a page for WhyVerse.' };
}
