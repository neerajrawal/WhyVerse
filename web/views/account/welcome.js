import { h } from '../../lib/dom.js';
import { navigate } from '../../router.js';
import { toast } from '../../components/toast.js';
import { getCategories } from '../../lib/data.js';
import { completeProfile, declineAndDelete, getAuthState } from '../../state/auth.js';
import { safeNext } from './signIn.js';
import { ageOn } from '../../lib/age.js';

export const NAME_RE = /^[\p{L}\p{N} _.-]{2,30}$/u;

/** First sign-in: confirm 18+, pick a nickname and interests, accept the privacy notice. */
export default async function render({ query }) {
  const next = safeNext(query.next);
  const categories = await getCategories().catch(() => []);
  const status = h('p', { class: 'form-status', role: 'alert' });

  const today = new Date().toISOString().slice(0, 10);
  const dob = h('input', { type: 'date', id: 'w-dob', required: true, max: today, min: '1900-01-01', autocomplete: 'bday', 'aria-describedby': 'w-dob-hint' });
  const privacy = h('input', { type: 'checkbox', id: 'w-priv', required: true });
  const name = h('input', { type: 'text', id: 'w-name', maxlength: 30, minlength: 2, required: true, autocomplete: 'nickname', 'aria-describedby': 'w-name-hint' });
  const personalise = h('input', { type: 'checkbox', id: 'w-pers' });
  const submit = h('button', { type: 'submit', class: 'btn btn-big' }, 'Finish setting up');

  const interestBoxes = categories.map((c) => {
    const id = `w-int-${c.id}`;
    return h('div', { class: 'quiz-opt' }, h('input', { type: 'checkbox', id, value: c.id, name: 'interest' }), h('label', { for: id }, `${c.emoji} ${c.name}`));
  });

  const form = h(
    'form',
    { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      status.textContent = '';
      const nick = name.value.trim();
      if (!NAME_RE.test(nick)) { status.textContent = 'Please use 2 to 30 letters or numbers for your nickname.'; return; }
      const age = ageOn(dob.value);
      if (age === null) { status.textContent = 'Please enter your real date of birth.'; dob.focus(); return; }
      if (age < 18) {
        await declineAndDelete();
        toast('Accounts are for adults (18 and over). You can read all of WhyVerse without one.', 6000);
        navigate('/', { replace: true });
        return;
      }
      const interests = [...form.querySelectorAll('input[name="interest"]:checked')].map((i) => i.value).slice(0, 12);
      submit.disabled = true;
      try {
        await completeProfile({ displayName: nick, interests, personalisation: personalise.checked, privacyVersion: '1', dob: dob.value });
        toast(`Welcome, ${nick}!`);
        navigate(next, { replace: true });
      } catch (err) {
        if (err && err.code === 'failed-precondition') {
          toast('Accounts are for adults (18 and over). You can read all of WhyVerse without one.', 6000);
          navigate('/', { replace: true });
          return;
        }
        console.error(err);
        status.textContent = (err && err.code === 'invalid-argument' && err.message) || 'We could not save that. Please try again.';
        submit.disabled = false;
      }
    } },

    h('fieldset', { class: 'stack fieldset-plain' },
      h('legend', {}, '1. Confirm you are an adult'),
      h('div', { class: 'field' },
        h('label', { for: 'w-dob' }, h('strong', {}, 'Your date of birth')),
        h('p', { id: 'w-dob-hint', class: 'mode-note' }, 'Accounts are for adults (18 and over). We use this once to check your age and then delete it. We keep only the answer "adult".'),
        dob),
      h('button', { type: 'button', class: 'link-btn', onclick: async () => {
        await declineAndDelete();
        toast('Thanks for telling us. You can read all of WhyVerse without an account.');
        navigate('/', { replace: true });
      } }, 'I am under 18'),
    ),

    h('div', { class: 'field' },
      h('label', { for: 'w-name' }, h('strong', {}, '2. Choose a nickname')),
      h('p', { id: 'w-name-hint', class: 'mode-note' }, 'This is shown on pages you write. Please do not use your real name.'),
      name,
    ),

    h('fieldset', { class: 'stack fieldset-plain' },
      h('legend', {}, '3. What are you curious about? (optional)'),
      h('div', { class: 'interest-grid' }, ...interestBoxes),
    ),

    h('fieldset', { class: 'stack fieldset-plain' },
      h('legend', {}, '4. Suggestions from your history (optional)'),
      h('div', { class: 'quiz-opt' }, personalise, h('label', { for: 'w-pers' }, 'Use my searches and the pages I read to suggest pages for me. I can turn this off and clear it any time in Settings.')),
    ),

    h('fieldset', { class: 'stack fieldset-plain' },
      h('legend', {}, '5. Privacy'),
      h('div', { class: 'quiz-opt' }, privacy, h('label', { for: 'w-priv' }, 'I have read the ', h('a', { href: '/privacy', target: '_blank', rel: 'noopener' }, 'Privacy notice'), ' and agree that WhyVerse keeps my email, nickname and interests for my account.')),
    ),
    status,
    submit,
  );

  const who = getAuthState().user;
  const node = h(
    'div',
    { class: 'container section narrow' },
    h('h1', {}, 'Welcome to WhyVerse'),
    h('p', { class: 'lead' }, who && who.email ? `Signed in as ${who.email}. Just a few quick things.` : 'Just a few quick things.'),
    form,
  );
  return { node, title: 'Welcome', description: 'Finish setting up your WhyVerse adult account.' };
}
