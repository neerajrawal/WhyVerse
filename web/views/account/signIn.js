import { h } from '../../lib/dom.js';
import { navigate } from '../../router.js';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset } from '../../state/auth.js';

export function safeNext(v) {
  const s = String(v || '');
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/sign-in') ? s : '/for-you';
}

function friendly(err) {
  switch (err && err.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'That email and password do not match.';
    case 'auth/invalid-email': return 'That email address does not look right.';
    case 'auth/email-already-in-use': return 'There is already an account with that email. Try signing in instead.';
    case 'auth/weak-password': return 'Please choose a password with at least 8 characters.';
    case 'auth/too-many-requests': return 'Too many tries. Please wait a few minutes and try again.';
    case 'auth/network-request-failed': return 'No internet connection. Please try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return '';
    default: return 'Something went wrong. Please try again.';
  }
}

export default async function render({ query }) {
  const next = safeNext(query.next);
  let view = 'signin'; // 'signin' | 'signup' | 'reset'
  const root = h('div', { class: 'container section narrow' });

  function draw() {
    const status = h('p', { class: 'form-status', role: 'alert' });
    const email = h('input', { type: 'email', id: 'si-email', name: 'email', autocomplete: 'email', required: true });
    const pw = h('input', { type: 'password', id: 'si-pw', name: 'password', autocomplete: view === 'signup' ? 'new-password' : 'current-password', required: view !== 'reset', minlength: view === 'signup' ? 8 : null });
    const submit = h('button', { type: 'submit', class: 'btn btn-big' }, view === 'signup' ? 'Create my account' : view === 'reset' ? 'Send reset email' : 'Sign in');
    const busy = (on) => { submit.disabled = on; };

    const form = h(
      'form',
      { class: 'stack', novalidate: false, onsubmit: async (e) => {
        e.preventDefault();
        status.textContent = '';
        status.className = 'form-status';
        busy(true);
        try {
          if (view === 'reset') {
            await sendPasswordReset(email.value.trim());
            status.className = 'form-status ok';
            status.textContent = 'If there is an account with that email, we have sent a link to reset the password.';
          } else {
            const fn = view === 'signup' ? signUpWithEmail : signInWithEmail;
            await fn(email.value.trim(), pw.value);
            navigate(next);
          }
        } catch (err) {
          status.textContent = friendly(err);
        } finally {
          busy(false);
        }
      } },
      h('div', { class: 'field' }, h('label', { for: 'si-email' }, 'Email'), email),
      view === 'reset' ? null : h('div', { class: 'field' }, h('label', { for: 'si-pw' }, view === 'signup' ? 'Password (at least 8 characters)' : 'Password'), pw),
      status,
      submit,
    );

    const google = h('button', { type: 'button', class: 'btn btn-ghost btn-big', onclick: async () => {
      status.textContent = '';
      try { await signInWithGoogle(); navigate(next); } catch (err) { status.textContent = friendly(err); }
    } }, 'Continue with Google');

    const links = h(
      'p',
      { class: 'form-links' },
      view !== 'signin' ? h('button', { type: 'button', class: 'link-btn', onclick: () => { view = 'signin'; draw(); } }, 'I already have an account') : null,
      view !== 'signup' ? h('button', { type: 'button', class: 'link-btn', onclick: () => { view = 'signup'; draw(); } }, 'Make a new account') : null,
      view === 'signin' ? h('button', { type: 'button', class: 'link-btn', onclick: () => { view = 'reset'; draw(); } }, 'Forgot my password') : null,
    );

    root.replaceChildren(
      h('h1', {}, view === 'signup' ? 'Make an account' : view === 'reset' ? 'Reset your password' : 'Adults: sign in'),
      h('div', { class: 'box box-facts' }, h('p', {}, h('strong', {}, 'Accounts are for adults (18 and over). '), 'Children do not need an account. Everyone can read all of WhyVerse without signing in.')),
      form,
      view === 'reset' ? null : h('p', { class: 'center or' }, 'or'),
      view === 'reset' ? null : google,
      links,
      h('p', { class: 'mode-note' }, 'By continuing you agree to the ', h('a', { href: '/terms' }, 'Terms'), ' and have read the ', h('a', { href: '/privacy' }, 'Privacy notice'), '.'),
    );
  }
  draw();
  return { node: root, title: 'Sign in', description: 'Sign in to WhyVerse (adults only).' };
}
