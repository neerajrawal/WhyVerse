import { h } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { REPORT_REASONS } from '../config.js';
import { reportPage } from '../lib/data.js';
import { toast } from './toast.js';

/**
 * "Report this page". Works for everyone without signing in. Sends only the page id and one
 * reason from a fixed list. There is deliberately no free-text box.
 */
export function reportButton(page) {
  const form = h('form', { method: 'dialog', class: 'report-form' });
  const status = h('p', { class: 'report-status', role: 'alert' });
  const send = h('button', { type: 'submit', class: 'btn', value: 'send' }, t('report.send'));
  const cancel = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => dlg.close() }, t('report.cancel'));

  form.append(
    h('h2', { id: 'report-title' }, t('report.title')),
    h('p', {}, t('report.lead')),
    h(
      'div',
      { class: 'report-options', role: 'radiogroup', 'aria-labelledby': 'report-title' },
      ...REPORT_REASONS.map((r, i) => h(
        'div',
        { class: 'quiz-opt' },
        h('input', { type: 'radio', name: 'reason', id: `rr-${r}`, value: r, required: true, checked: i === 0 ? null : null }),
        h('label', { for: `rr-${r}` }, t(`report.${r}`)),
      )),
    ),
    status,
    h('div', { class: 'quiz-actions' }, send, cancel),
  );

  const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'report-title' }, form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chosen = form.querySelector('input[name="reason"]:checked');
    if (!chosen) {
      status.textContent = 'Please pick one.';
      return;
    }
    send.disabled = true;
    try {
      await reportPage(page.id, chosen.value);
      dlg.close();
      toast(t('report.thanks'));
    } catch {
      status.textContent = t('state.error');
    } finally {
      send.disabled = false;
    }
  });

  return h(
    'div',
    { class: 'report' },
    h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { status.textContent = ''; dlg.showModal(); } }, '🚩 ', t('page.report')),
    dlg,
  );
}
