import { h } from '../../lib/dom.js';
import { navigate } from '../../router.js';
import { toast } from '../../components/toast.js';
import { getAuthState } from '../../state/auth.js';
import { adminStore } from '../../lib/adminStore.js';
import { SECTIONS, renderSection } from './sections.js';

const mins = (ms) => Math.max(1, Math.round((ms - Date.now()) / 60000));

/** /authority — the gate (sign in, admin claim, 6-digit code) and then the portal itself. */
export default async function render({ params }) {
  const { user } = getAuthState();
  const root = h('div', { class: 'container section' });
  const page = (title) => ({ node: root, title, description: 'WhyVerse admin.' });

  if (!user) {
    root.replaceChildren(h('div', { class: 'narrow stack' },
      h('h1', {}, 'Admin'),
      h('p', {}, 'Please sign in with your admin account first.'),
      h('a', { class: 'btn', href: '/sign-in?next=%2Fauthority' }, 'Sign in')));
    return page('Admin');
  }

  let st = await adminStore.status(user).catch(() => ({ isAdmin: false, unlocked: 0 }));
  if (!st.isAdmin) {
    // The same message for everyone, so this page does not confirm that an admin area exists.
    root.replaceChildren(h('div', { class: 'narrow stack' }, h('h1', {}, 'Not available'), h('p', {}, 'This page is for site administrators only.'), h('a', { class: 'btn btn-ghost', href: '/' }, 'Go home')));
    return page('Not available');
  }
  if (!st.unlocked) { codeForm(root, () => navigate('/authority', { replace: true })); return page('Admin sign-in'); }

  const section = SECTIONS.some((s) => s.id === params.section) ? params.section : 'dashboard';
  // If the session runs out while working, every action lands back here.
  const relock = () => { toast('Your admin session ended. Please enter the code again.', 5000); navigate('/authority', { replace: true }); };
  const body = h('div', { class: 'stack' });
  root.replaceChildren(
    h('h1', {}, 'Admin portal'),
    h('p', { class: 'mode-note' }, `Unlocked for about ${mins(st.unlocked)} more minutes. `,
      h('button', { type: 'button', class: 'link-btn', onclick: async () => { await adminStore.endSession().catch(() => {}); navigate('/authority', { replace: true }); } }, 'Lock now')),
    h('nav', { 'aria-label': 'Admin sections', class: 'tab-row' },
      ...SECTIONS.map((s) => h('a', { class: 'tab-btn', href: `/authority/${s.id}`, 'aria-current': s.id === section ? 'page' : null }, s.label))),
    body,
  );
  await renderSection(section, body, { relock, store: adminStore });
  return page(`Admin · ${SECTIONS.find((s) => s.id === section).label}`);
}

function codeForm(root, onDone) {
  const status = h('p', { class: 'form-status', role: 'alert' });
  const input = h('input', { type: 'text', id: 'ac-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '[0-9]{6}', required: true });
  const btn = h('button', { type: 'submit', class: 'btn btn-big' }, 'Unlock');
  root.replaceChildren(h('form', { class: 'narrow stack', onsubmit: async (e) => {
    e.preventDefault();
    status.textContent = '';
    if (!/^\d{6}$/.test(input.value)) { status.textContent = 'The code has 6 digits.'; return; }
    btn.disabled = true;
    try { await adminStore.verifyCode(input.value); onDone(); } catch (err) {
      status.textContent = (err && err.message) || 'That did not work.';
      btn.disabled = false; input.value = ''; input.focus();
    }
  } },
  h('h1', {}, 'Admin'),
  h('div', { class: 'field' }, h('label', { for: 'ac-code' }, 'Your 6-digit code'), input),
  status, btn));
}
