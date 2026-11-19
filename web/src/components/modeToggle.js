import { h } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { getMode, setMode, availableModes, onModeChange, needsAdult } from '../state/mode.js';
import { isAdult } from '../state/auth.js';
import { askGrownUp } from './grownUpDialog.js';

/**
 * Change the reading mode. Switching to or from Teen needs a grown-up: a signed-in adult, or
 * the parent PIN set on this device. Returns true when the mode was changed.
 */
export async function requestModeChange(next) {
  const from = getMode();
  if (next === from) return true;
  if (needsAdult(from, next) && !isAdult()) {
    const ok = await askGrownUp();
    if (!ok) return false;
  }
  setMode(next);
  return true;
}

/**
 * Reading-mode switch (All ages / Junior / Teen). Saved on this device only.
 * Built as a radio group so it works with keyboard and screen readers.
 */
export function modeToggle({ compact = false } = {}) {
  const name = `mode-${Math.random().toString(36).slice(2, 7)}`;
  const wrap = h('fieldset', { class: `mode-toggle${compact ? ' compact' : ''}` });
  const legend = h('legend', { class: compact ? 'sr-only' : 'mode-legend' }, t('mode.label'));
  wrap.appendChild(legend);

  const group = h('div', { class: 'mode-options' });
  wrap.appendChild(group);

  function draw() {
    group.replaceChildren(
      ...availableModes().map((m) => {
        const id = `${name}-${m}`;
        const input = h('input', {
          type: 'radio', name, id, value: m, checked: getMode() === m,
          onchange: async () => { if (!(await requestModeChange(m))) draw(); },
        });
        return h('span', { class: 'mode-option' }, input, h('label', { for: id }, t(compact ? `mode.short.${m}` : `mode.${m}`)));
      }),
    );
  }
  draw();
  onModeChange(draw); // keeps every toggle on screen in sync
  if (!compact) wrap.appendChild(h('p', { class: 'mode-note' }, t('mode.note')));
  return wrap;
}
