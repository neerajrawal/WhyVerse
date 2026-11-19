import { h } from '../lib/dom.js';
import { t } from '../i18n/index.js';

/**
 * Short quiz. Answers are checked right here in the browser. Nothing is sent or saved.
 * quiz: [{ q, options: [..], answer: index, why }]
 */
export function quizSection(quiz) {
  const questions = (quiz || []).filter((q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2).slice(0, 5);
  if (!questions.length) return null;

  const uid = Math.random().toString(36).slice(2, 7);
  const result = h('p', { class: 'quiz-result', role: 'status', 'aria-live': 'polite' });
  const feedback = [];

  const form = h('form', { class: 'quiz', novalidate: true });
  questions.forEach((q, qi) => {
    const fb = h('p', { class: 'quiz-feedback', 'aria-live': 'polite' });
    feedback.push(fb);
    form.appendChild(
      h(
        'fieldset',
        { class: 'quiz-q' },
        h('legend', {}, `${qi + 1}. ${q.q}`),
        ...q.options.map((opt, oi) => {
          const id = `q${uid}-${qi}-${oi}`;
          return h('div', { class: 'quiz-opt' }, h('input', { type: 'radio', name: `q${uid}-${qi}`, id, value: oi }), h('label', { for: id }, String(opt)));
        }),
        fb,
      ),
    );
  });

  const checkBtn = h('button', { type: 'submit', class: 'btn' }, t('quiz.check'));
  const againBtn = h('button', { type: 'button', class: 'btn btn-ghost', hidden: true }, t('quiz.again'));
  form.append(h('div', { class: 'quiz-actions' }, checkBtn, againBtn), result, h('p', { class: 'quiz-note' }, t('quiz.nothing')));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let score = 0;
    questions.forEach((q, qi) => {
      const chosen = form.querySelector(`input[name="q${uid}-${qi}"]:checked`);
      const right = Number(q.answer);
      const ok = chosen && Number(chosen.value) === right;
      if (ok) score += 1;
      feedback[qi].className = `quiz-feedback ${ok ? 'right' : 'wrong'}`;
      feedback[qi].textContent = chosen
        ? `${ok ? '✅ Correct! ' : '❌ Not quite. '}${q.why || ''}`
        : `Pick an answer. ${q.why ? '' : ''}`.trim();
      if (chosen && !ok) feedback[qi].textContent += ` The answer is: ${q.options[right]}.`;
    });
    result.textContent = t('quiz.score', { n: score, total: questions.length });
    againBtn.hidden = false;
  });

  againBtn.addEventListener('click', () => {
    form.reset();
    feedback.forEach((f) => { f.textContent = ''; f.className = 'quiz-feedback'; });
    result.textContent = '';
    againBtn.hidden = true;
  });

  return h('section', { class: 'box box-quiz', 'aria-labelledby': `quiz-h-${uid}` }, h('h2', { id: `quiz-h-${uid}` }, '🧠 ', t('page.quiz')), form);
}
