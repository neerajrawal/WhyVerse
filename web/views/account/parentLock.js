import { h, mount } from '../../lib/dom.js';
import { toast } from '../../components/toast.js';
import { hasPin, setPin, changePin, removePin, validPin, lockedForMinutes } from '../../state/parentLock.js';

export default async function render() {
  const root = h('div', { class: 'container section narrow stack-lg' });

  function pinInput(id, label) {
    return h('div', { class: 'field' }, h('label', { for: id }, label),
      h('input', { type: 'password', id, inputmode: 'numeric', pattern: '\\d{4,6}', maxlength: 6, autocomplete: 'off', required: true }));
  }
  const val = (form, id) => form.querySelector(`#${id}`).value;

  function msgFor(r) {
    if (r.lockedMinutes) return `Too many wrong tries. Please wait ${r.lockedMinutes} minute(s).`;
    return `That PIN is not right. ${r.left} ${r.left === 1 ? 'try' : 'tries'} left.`;
  }

  function draw() {
    const status = h('p', { class: 'form-status', role: 'alert' });
    let body;
    if (!hasPin()) {
      const form = h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        if (!form.querySelector('#pl-adult').checked) { status.textContent = 'Please confirm you are an adult.'; return; }
        const pin = val(form, 'pl-new');
        if (!validPin(pin)) { status.textContent = 'The PIN must be 4 to 6 digits.'; return; }
        if (pin !== val(form, 'pl-new2')) { status.textContent = 'The two PINs do not match.'; return; }
        try { await setPin(pin); toast('Parent lock is on.'); draw(); } catch (err) { status.textContent = err.message; }
      } },
      h('div', { class: 'quiz-opt' }, h('input', { type: 'checkbox', id: 'pl-adult', required: true }), h('label', { for: 'pl-adult' }, 'I am an adult (18 or older).')),
      pinInput('pl-new', 'Choose a PIN (4 to 6 digits)'), pinInput('pl-new2', 'Type it again'), status,
      h('button', { type: 'submit', class: 'btn' }, 'Turn on parent lock'));
      body = [h('p', {}, 'Right now anyone using this device can switch between Junior and Teen. Set a PIN so only a grown-up can.'), form];
    } else {
      const wait = lockedForMinutes();
      const change = h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        const next = val(change, 'pl-n');
        if (!validPin(next)) { status.textContent = 'The new PIN must be 4 to 6 digits.'; return; }
        const r = await changePin(val(change, 'pl-cur'), next);
        if (r.ok) { toast('PIN changed.'); draw(); } else status.textContent = msgFor(r);
      } }, h('h2', {}, 'Change the PIN'), pinInput('pl-cur', 'Current PIN'), pinInput('pl-n', 'New PIN'), h('button', { type: 'submit', class: 'btn btn-ghost' }, 'Change PIN'));
      const remove = h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        const r = await removePin(val(remove, 'pl-rm'));
        if (r.ok) { toast('Parent lock is off.'); draw(); } else status.textContent = msgFor(r);
      } }, h('h2', {}, 'Turn the lock off'), pinInput('pl-rm', 'Current PIN'), h('button', { type: 'submit', class: 'btn btn-ghost' }, 'Turn off'));
      body = [h('p', {}, h('strong', {}, '🔒 Parent lock is on.'), ' A PIN is needed to move between Junior and Teen.'),
        wait ? h('p', { class: 'form-status' }, `The PIN pad is resting for ${wait} minute(s) after too many wrong tries.`) : null,
        change, remove, status];
    }
    mount(root,
      h('h1', {}, 'Parent lock'),
      ...body,
      h('div', { class: 'box box-facts' }, h('h2', {}, 'What this can and cannot do'),
        h('ul', {},
          h('li', {}, 'The PIN is scrambled and kept only on this device. It is never sent to WhyVerse.'),
          h('li', {}, 'WhyVerse cannot check who is an adult, because that would mean collecting ID. This is a family control, like those on other kids\' apps.'),
          h('li', {}, 'Clearing this browser\'s data removes the PIN and puts reading back to Junior. Each device and browser has its own PIN.'),
          h('li', {}, 'All ages pages are always open to everyone.'))),
    );
  }
  draw();
  return { node: root, title: 'Parent lock', description: 'Set a PIN so only a grown-up can change between Junior and Teen.' };
}
