import { h } from '../../lib/dom.js';
import { navigate } from '../../router.js';
import { toast } from '../../components/toast.js';
import { getCategories } from '../../lib/data.js';
import { store } from '../../lib/accountStore.js';
import { getAuthState, saveProfile, signOutNow, deleteMyAccount, exportMyData } from '../../state/auth.js';
import { NAME_RE } from './welcome.js';

export default async function render() {
  const { user, profile } = getAuthState();
  const categories = await getCategories().catch(() => []);
  const picked = new Set(profile.interests || []);

  // ---- profile
  const profStatus = h('p', { class: 'form-status', role: 'status' });
  const name = h('input', { type: 'text', id: 's-name', maxlength: 30, minlength: 2, required: true, value: profile.displayName || '' });
  const profForm = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    const nick = name.value.trim();
    if (!NAME_RE.test(nick)) { profStatus.className = 'form-status'; profStatus.textContent = 'Please use 2 to 30 letters or numbers.'; return; }
    const interests = [...profForm.querySelectorAll('input[name="interest"]:checked')].map((i) => i.value).slice(0, 12);
    try {
      await saveProfile({ displayName: nick, interests });
      profStatus.className = 'form-status ok';
      profStatus.textContent = 'Saved.';
    } catch { profStatus.className = 'form-status'; profStatus.textContent = 'Could not save. Please try again.'; }
  } },
  h('div', { class: 'field' }, h('label', { for: 's-name' }, 'Nickname'), name),
  h('fieldset', { class: 'stack fieldset-plain' }, h('legend', {}, 'Topics I like (up to 12)'),
    h('div', { class: 'interest-grid' }, ...categories.map((c) => h('div', { class: 'quiz-opt' },
      h('input', { type: 'checkbox', id: `s-int-${c.id}`, name: 'interest', value: c.id, checked: picked.has(c.id) }),
      h('label', { for: `s-int-${c.id}` }, `${c.emoji} ${c.name}`))))),
  profStatus,
  h('button', { type: 'submit', class: 'btn' }, 'Save changes'));

  // ---- personalisation
  const persBox = h('input', { type: 'checkbox', id: 's-pers', checked: Boolean(profile.personalisation), onchange: async (e) => {
    try { await saveProfile({ personalisation: e.target.checked }); toast(e.target.checked ? 'Suggestions from history are on.' : 'Suggestions from history are off.'); }
    catch { e.target.checked = !e.target.checked; toast('Could not save that.'); }
  } });
  const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: async () => {
    if (!confirm('Delete everything WhyVerse remembered about your searches and reading history?')) return;
    await store.clearHistory(user.uid);
    toast('History cleared.');
  } }, 'Clear my history now');

  // ---- export
  const exportBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: async () => {
    try {
      const data = await exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = h('a', { href: url, download: 'whyverse-my-data.json' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { toast('Could not prepare your data. Please try again.'); }
  } }, 'Download my data');

  // ---- delete
  const delStatus = h('p', { class: 'form-status', role: 'alert' });
  const delConfirm = h('input', { type: 'text', id: 's-del', autocomplete: 'off', 'aria-describedby': 's-del-hint' });
  const delPw = user.provider === 'google' ? null : h('input', { type: 'password', id: 's-delpw', autocomplete: 'current-password' });
  const delForm = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    delStatus.textContent = '';
    if (delConfirm.value.trim() !== 'DELETE') { delStatus.textContent = 'Please type DELETE in capital letters.'; return; }
    try {
      await deleteMyAccount({ password: delPw ? delPw.value : undefined });
      toast('Your account and personal data have been deleted.');
      navigate('/', { replace: true });
    } catch (err) {
      console.error(err);
      delStatus.textContent = err && (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')
        ? 'That password is not right.' : 'We could not delete the account. Please check and try again.';
    }
  } },
  delPw ? h('div', { class: 'field' }, h('label', { for: 's-delpw' }, 'Your password'), delPw) : h('p', { class: 'mode-note' }, 'You will be asked to confirm with Google.'),
  h('div', { class: 'field' }, h('label', { for: 's-del' }, 'Type DELETE to confirm'), delConfirm, h('p', { id: 's-del-hint', class: 'mode-note' }, 'This cannot be undone. Pages you wrote that are published will be taken down.')),
  delStatus,
  h('button', { type: 'submit', class: 'btn btn-danger' }, 'Delete my account'));

  const node = h('div', { class: 'container section narrow stack-lg' },
    h('h1', {}, 'Settings'),
    h('p', {}, 'Signed in as ', h('strong', {}, user.email || 'your account'), '.'),
    h('section', { class: 'stack' }, h('h2', {}, 'Your profile'), profForm),
    h('section', { class: 'stack' }, h('h2', {}, 'Suggestions'),
      h('div', { class: 'quiz-opt' }, persBox, h('label', { for: 's-pers' }, 'Use my searches and the pages I read to suggest pages for me. Kept for 180 days at most.')),
      clearBtn),
    h('section', { class: 'stack' }, h('h2', {}, 'Parent lock'),
      h('p', {}, 'Signed-in adults can switch between Junior and Teen without a PIN. To protect a shared device, set a PIN for when you are signed out.'),
      h('a', { class: 'btn btn-ghost', href: '/parent-lock' }, 'Manage the parent lock')),
    h('section', { class: 'stack' }, h('h2', {}, 'Your data'), h('p', {}, 'You can download a copy of everything WhyVerse holds about you.'), exportBtn),
    h('section', { class: 'stack' }, h('h2', {}, 'Sign out'), h('button', { type: 'button', class: 'btn btn-ghost', onclick: async () => { await signOutNow(); navigate('/', { replace: true }); } }, 'Sign out')),
    h('section', { class: 'stack' }, h('h2', {}, 'Delete my account'), delForm),
  );
  return { node, title: 'Settings', description: 'Your WhyVerse settings.' };
}
