import { h } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { hasPin, setPin, verifyPin, validPin } from '../state/parentLock.js';

/**
 * "Ask a grown-up" pop-up. Resolves true when a grown-up has allowed the change.
 *  - PIN already set on this device: asks for it.
 *  - No PIN yet: a grown-up sets one now (with an 18+ confirmation).
 */
export function askGrownUp() {
  return new Promise((resolve) => {
    const setup = !hasPin();
    const status = h('p', { class: 'report-status', role: 'alert' });
    const pin = h('input', { type: 'password', id: 'gu-pin', name: 'pin', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 6, autocomplete: 'off', required: true });
    const pin2 = setup ? h('input', { type: 'password', id: 'gu-pin2', name: 'pin2', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 6, autocomplete: 'off', required: true }) : null;
    const adult = setup ? h('input', { type: 'checkbox', id: 'gu-adult', required: true }) : null;
    const go = h('button', { type: 'submit', class: 'btn' }, setup ? t('grownup.save') : t('grownup.allow'));

    const form = h(
      'form',
      { class: 'report-form', method: 'dialog' },
      h('h2', { id: 'gu-title' }, '👨‍👩‍👧 ', t('grownup.title')),
      h('p', {}, setup ? t('grownup.setup') : t('grownup.enter')),
      setup ? h('div', { class: 'quiz-opt' }, adult, h('label', { for: 'gu-adult' }, t('grownup.adultBox'))) : null,
      h('div', { class: 'field' }, h('label', { for: 'gu-pin' }, t('grownup.pin')), pin),
      setup ? h('div', { class: 'field' }, h('label', { for: 'gu-pin2' }, t('grownup.pin2')), pin2) : null,
      status,
      h('div', { class: 'quiz-actions' }, go, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => finish(false) }, t('grownup.cancel'))),
      h('p', { class: 'mode-note' }, h('a', { href: '/sign-in', onclick: () => finish(false) }, t('grownup.signin'))),
      setup ? null : h('p', { class: 'mode-note' }, t('grownup.forgot')),
    );
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'gu-title' }, form);
    document.body.appendChild(dlg);

    let done = false;
    function finish(ok) {
      if (done) return;
      done = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      resolve(ok);
    }
    dlg.addEventListener('cancel', () => finish(false));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';
      go.disabled = true;
      try {
        if (setup) {
          if (!validPin(pin.value)) status.textContent = 'The PIN must be 4 to 6 digits.';
          else if (pin.value !== pin2.value) status.textContent = 'The two PINs are different.';
          else { await setPin(pin.value); finish(true); }
        } else {
          const r = await verifyPin(pin.value);
          if (r.ok) finish(true);
          else if (r.lockedMinutes) status.textContent = `Too many wrong tries. Please wait ${r.lockedMinutes} minute${r.lockedMinutes === 1 ? '' : 's'}.`;
          else status.textContent = `That PIN is not right.${r.left != null ? ` ${r.left} tr${r.left === 1 ? 'y' : 'ies'} left.` : ''}`;
          pin.value = '';
        }
      } catch (err) {
        status.textContent = err.message || t('state.error');
      } finally {
        go.disabled = false;
      }
    });
    dlg.showModal();
    pin.focus();
  });
}
