import { h, formatDate } from '../../lib/dom.js';
import { toast } from '../../components/toast.js';
import { emptyState, errorState } from '../../components/states.js';

export const SECTIONS = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'review', label: 'Review' },
  { id: 'submissions', label: 'Written by adults' },
  { id: 'create', label: 'Create AI page' },
  { id: 'reports', label: 'Reports' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'pages', label: 'Pages' },
  { id: 'people', label: 'Writers' },
  { id: 'settings', label: 'Settings' },
  { id: 'activity', label: 'Activity' },
  { id: 'alerts', label: 'Alerts' },
];
const BAND_NAME = { all: 'Everyone', junior: 'Junior', teen: 'Teen' };
const CATEGORIES = [['science', 'Science'], ['space', 'Space'], ['animals', 'Animals'], ['earth', 'Earth'], ['body', 'Human body'], ['history', 'History'], ['tech', 'Technology'], ['maths', 'Maths'], ['arts', 'Arts'], ['world', 'World']];

const band = (b) => h('span', { class: `chip chip-${b}` }, BAND_NAME[b] || b);
const bandSelect = (id, value = 'all') => h('select', { id }, ...Object.entries(BAND_NAME).map(([v, n]) => h('option', { value: v, selected: v === value }, n)));
const field = (id, label, control, hint) => h('div', { class: 'field' }, h('label', { for: id }, label), hint ? h('p', { class: 'mode-note' }, hint) : null, control);
const bodyText = (blocks) => (blocks || []).map((b) => b.text || (b.items || []).join('; ') || '').filter(Boolean).join('\n\n');

export async function renderSection(id, body, ctx) {
  const { store, relock } = ctx;
  /** Run an admin action: shows its error, or sends the admin back to the code if the session ended. */
  const act = async (fn, okMsg, after) => {
    try { await fn(); if (okMsg) toast(okMsg); if (after) await after(); } catch (err) {
      if (err && (err.code === 'permission-denied' || err.code === 'unauthenticated')) { relock(); return; }
      toast((err && err.message) || 'That did not work.', 5000);
    }
  };
  const list = async (kind, draw) => {
    let rows;
    try { rows = await store.list(kind); } catch (err) { console.error(err); body.replaceChildren(errorState('Could not load this list.', () => renderSection(id, body, ctx))); return; }
    const redraw = async () => { rows = await store.list(kind); paint(); };
    const paint = () => body.replaceChildren(...draw(rows, redraw));
    paint();
  };
  const row = (main, actions) => h('li', { class: 'reading-row' }, h('div', { class: 'reading-main' }, ...main), h('div', { class: 'reading-actions' }, ...actions));
  const btn = (label, fn, cls = 'btn-ghost') => h('button', { type: 'button', class: `btn ${cls} btn-small`, onclick: fn }, label);

  if (id === 'dashboard') {
    let d;
    try { d = await store.dashboard(); } catch (err) { if (err && err.code === 'permission-denied') return relock(); body.replaceChildren(errorState('Could not load the overview.')); return; }
    const c = d.counts;
    const tile = (n, label, to) => h('li', {}, h('a', { class: 'box admin-tile', href: `/authority/${to}` }, h('strong', { class: 'admin-num' }, String(n)), h('span', {}, label)));
    const use = (label, used, max) => h('li', {}, `${label}: ${used}${max ? ` of ${max}` : ''} today`);
    body.replaceChildren(
      h('h2', {}, 'Needs you'),
      h('ul', { class: 'admin-tiles' },
        tile(c.ready, 'AI pages waiting', 'review'), tile(c.submissions, 'Adult pages waiting', 'submissions'), tile(c.authorRequests, 'Writer requests', 'people'),
        tile(c.reports, 'Open reports', 'reports'), tile(c.jobsFailed, 'Failed jobs', 'jobs'), tile(c.unread, 'New alerts', 'alerts')),
      h('h2', {}, 'Today'),
      h('ul', {}, use('Pages made', d.usage.pages, d.limits.maxPagesPerDay), use('Searches', d.usage.searchCalls, d.limits.maxSearchCallsPerDay), use('AI tokens', d.usage.llmTokens, d.limits.maxLlmTokensPerDay)),
      h('p', {}, `Automatic pages are ${d.auto.enabled ? 'ON' : 'OFF'}${d.auto.enabled ? `: ${d.auto.pagesPerRun || '?'} per run, ${d.auto.schedule || 'daily'}` : ''}. Change this in Settings.`),
    );
    return;
  }

  if (id === 'review') {
    return list('pages', (rows, redraw) => {
      const ready = rows.filter((p) => p.status === 'ready');
      return [h('h2', {}, `AI pages waiting for you (${ready.length})`),
        ready.length ? h('ul', { class: 'reading-list' }, ...ready.map((p) => reviewRow(p, redraw))) : emptyState('Nothing is waiting. Pages that pass every check are published by themselves.')];
    });
    function reviewRow(p, redraw) {
      const sel = bandSelect(`rb-${p.id}`, p.ageBand);
      return h('li', { class: 'reading-row admin-card' },
        h('div', { class: 'reading-main' }, h('strong', {}, p.title), band(p.ageBand), p.reason ? h('p', { class: 'admin-comment' }, h('strong', {}, 'Why it is here: '), p.reason) : null,
          h('p', {}, p.summary || ''),
          h('details', {}, h('summary', {}, 'Read the page'), h('p', { class: 'admin-pre' }, bodyText(p.body) || '(no text)'))),
        h('div', { class: 'reading-actions' },
          h('label', { class: 'sr-only', for: sel.id }, 'Audience'), sel,
          btn('Publish', () => act(async () => { if (sel.value !== p.ageBand) await store.pageAction(p.id, 'edit', { ageBand: sel.value }); await store.pageAction(p.id, 'publish'); }, 'Published.', redraw), 'btn'),
          btn('Reject', () => act(() => store.pageAction(p.id, 'reject'), 'Rejected.', redraw))));
    }
  }

  if (id === 'submissions') {
    return list('submissions', (rows, redraw) => [h('h2', {}, `Pages written by adults (${rows.length})`),
      rows.length ? h('ul', { class: 'reading-list' }, ...rows.map((s) => {
        const sel = bandSelect(`sb-${s.id}`, s.ageBand);
        const note = h('input', { type: 'text', id: `sn-${s.id}`, maxlength: 500, placeholder: 'Comment for the writer' });
        const go = (decision, msg) => () => act(() => store.reviewSubmission(s.id, decision, note.value, sel.value), msg, redraw);
        return h('li', { class: 'reading-row admin-card' },
          h('div', { class: 'reading-main' }, h('strong', {}, s.title), h('span', { class: 'mode-note' }, `by ${s.authorName || 'a writer'} · ${s.words || ''} words · ${formatDate(s.createdAt)}`),
            h('p', {}, h('strong', {}, 'Safety: '), String(s.safety || (s.safetyReport && s.safetyReport.verdict) || 'checked'), ' · ', h('strong', {}, 'Copying: '), typeof s.plagiarism === 'string' ? s.plagiarism : (s.plagiarism && s.plagiarism.summary) || 'checked', ' · ', h('strong', {}, 'Facts: '), typeof s.factCheck === 'string' ? s.factCheck : (s.factCheck && s.factCheck.summary) || 'checked'),
            (s.flags || []).length ? h('p', { class: 'admin-comment' }, h('strong', {}, 'Notes: '), s.flags.map((f) => (typeof f === 'string' ? f : f.message || f.type)).join('; ')) : null,
            h('details', {}, h('summary', {}, 'Read the page'), h('p', { class: 'admin-pre' }, bodyText(s.bodyBlocks) || s.bodyText || '(open in the writer\'s view)'))),
          h('div', { class: 'reading-actions admin-stack' },
            field(note.id, 'Comment', note), field(sel.id, 'Audience if approved', sel),
            btn('Approve and publish', go('approve', 'Published.'), 'btn'), btn('Ask for changes', go('changes', 'Sent back to the writer.')), btn('Reject', go('reject', 'Rejected.'))));
      })) : emptyState('No pages are waiting.')]);
  }

  if (id === 'create') {
    const topic = h('input', { type: 'text', id: 'ai-topic', maxlength: 120, required: true, placeholder: 'For example: Why do cats purr?' });
    const cat = h('select', { id: 'ai-cat' }, ...CATEGORIES.map(([v, n]) => h('option', { value: v }, n)));
    const sel = bandSelect('ai-band');
    const now = h('input', { type: 'checkbox', id: 'ai-now', checked: true });
    const out = h('p', { class: 'form-status', role: 'status' });
    const go = h('button', { type: 'submit', class: 'btn btn-big' }, 'Create the page');
    body.replaceChildren(h('form', { class: 'stack narrow-left', onsubmit: async (e) => {
      e.preventDefault(); out.textContent = ''; go.disabled = true;
      await act(async () => {
        const r = await store.generate({ topic: topic.value, category: cat.value, band: sel.value, runNow: now.checked });
        out.textContent = r.status === 'queued' ? 'Added to the queue. It will be written in the next 30 minutes.' : r.outcome === 'continue' || r.status === 'continue' ? 'Still writing. The timer will finish it. Check Jobs and Review soon.' : 'Done. Look in Review. Pages you ask for always wait for you to publish them.';
        topic.value = '';
      });
      go.disabled = false;
    } },
    h('h2', {}, 'Create an AI page'),
    h('p', {}, 'The page goes through the same safety, fact and image checks as the automatic ones. It always waits in Review for you to publish.'),
    field('ai-topic', 'Topic', topic), field('ai-cat', 'Category', cat), field('ai-band', 'Who is it for?', sel),
    h('div', { class: 'quiz-opt' }, now, h('label', { for: 'ai-now' }, 'Write it now (about a minute). Untick to add it to the queue.')),
    out, go));
    return;
  }

  if (id === 'reports') {
    return list('reports', (rows, redraw) => [h('h2', {}, `Reports (${rows.length})`),
      rows.length ? h('ul', { class: 'reading-list' }, ...rows.map((r) => row([h('strong', {}, r.pageTitle || r.pageId), h('span', {}, r.reason), h('span', { class: 'mode-note' }, formatDate(r.createdAt))],
        [btn('Dismiss', () => act(() => store.resolveReport(r.id, 'dismiss'), 'Dismissed.', redraw)), btn('Take the page down', () => act(() => store.resolveReport(r.id, 'unpublish'), 'Page unpublished.', redraw), 'btn')]))) : emptyState('No open reports.')]);
  }

  if (id === 'jobs') {
    return list('jobs', (rows, redraw) => [h('h2', {}, 'Page jobs'),
      rows.length ? h('ul', { class: 'reading-list' }, ...rows.map((j) => row([h('strong', {}, (j.params && j.params.topic) || j.id), h('span', { class: `chip status-${j.status}` }, j.status), h('span', { class: 'mode-note' }, `${j.type || ''} · ${formatDate(j.createdAt)}`), j.error ? h('p', { class: 'admin-comment' }, String(j.error)) : null],
        [j.status === 'failed' ? btn('Try again', () => act(() => store.jobAction(j.id, 'retry'), 'Queued again.', redraw)) : null, j.status === 'queued' ? btn('Cancel', () => act(() => store.jobAction(j.id, 'cancel'), 'Cancelled.', redraw)) : null]))) : emptyState('No jobs yet.')]);
  }

  if (id === 'pages') {
    return list('pages', (rows, redraw) => [h('h2', {}, 'Pages'),
      rows.filter((p) => p.status !== 'ready').length ? h('ul', { class: 'reading-list' }, ...rows.filter((p) => p.status !== 'ready').map((p) => row(
        [h('strong', {}, p.title), band(p.ageBand), h('span', { class: `chip status-${p.status}` }, p.status), p.featured ? h('span', { class: 'chip' }, '★ featured') : null],
        p.status === 'published'
          ? [btn(p.featured ? 'Unfeature' : 'Feature', () => act(() => store.pageAction(p.id, p.featured ? 'unfeature' : 'feature'), 'Done.', redraw)), btn('Unpublish', () => act(() => store.pageAction(p.id, 'unpublish'), 'Unpublished.', redraw))]
          : p.status === 'unpublished' ? [btn('Publish again', () => act(() => store.pageAction(p.id, 'publish'), 'Published.', redraw), 'btn')] : []))) : emptyState('No pages yet.')]);
  }

  if (id === 'people') {
    return list('users', (rows, redraw) => {
      const set = (u, status, msg) => () => act(() => store.setAuthor(u.id, status, ''), msg, redraw);
      return [h('h2', {}, 'Writers'), h('p', { class: 'mode-note' }, 'Adults must be approved by you before they can write pages.'),
        rows.length ? h('ul', { class: 'reading-list' }, ...rows.map((u) => row(
          [h('strong', {}, u.displayName || u.id), h('span', { class: `chip status-${u.authorStatus}` }, u.authorStatus), h('span', { class: 'mode-note' }, `${u.rejectionStreak || 0} rejections in a row${u.authorNote ? ` · "${u.authorNote}"` : ''}`)],
          u.authorStatus === 'requested' ? [btn('Approve', set(u, 'approved', 'Approved.'), 'btn'), btn('Not now', set(u, 'declined', 'Declined.'))]
            : u.authorStatus === 'approved' ? [btn('Turn writing off', set(u, 'blocked', 'Writing turned off.'))]
              : [btn('Allow again', set(u, 'approved', 'Approved.'))]))) : emptyState('No writer requests yet.')];
    });
  }

  if (id === 'settings') return settingsView(body, ctx, act);

  if (id === 'activity') {
    return list('activity', (rows) => [h('h2', {}, 'Recent activity'), rows.length ? h('ul', { class: 'reading-list' }, ...rows.map((a) => row([h('strong', {}, a.action), h('span', { class: 'mode-note' }, `${a.actorLabel || ''}${a.target ? ` · ${a.target}` : ''} · ${formatDate(a.createdAt)}`)], []))) : emptyState('Nothing yet.')]);
  }

  if (id === 'alerts') {
    return list('notifications', (rows, redraw) => [h('h2', {}, 'Alerts'),
      rows.some((n) => !n.read) ? btn('Mark all as read', () => act(() => store.markRead(), null, redraw)) : null,
      rows.length ? h('ul', { class: 'reading-list' }, ...rows.map((n) => row([h('strong', {}, `${n.read ? '' : '● '}${n.title}`), n.body ? h('span', {}, n.body) : null, h('span', { class: 'mode-note' }, formatDate(n.createdAt))],
        [n.link ? h('a', { class: 'btn btn-ghost btn-small', href: n.link }, 'Open') : null, n.read ? null : btn('Read', () => act(() => store.markRead(n.id), null, redraw))]))) : emptyState('No alerts.')]);
  }
}

async function settingsView(body, ctx, act) {
  const { store } = ctx;
  const { main, pub } = await store.getSettings().catch(() => ({ main: {}, pub: {} }));
  const get = (p, d) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), main) ?? d;
  const num = (id, label, path, d, hint) => { const i = h('input', { type: 'number', id, value: String(get(path, d)), min: '0' }); i.dataset.path = path; i.dataset.kind = 'int'; return field(id, label, i, hint); };
  const chk = (id, label, path, d) => { const i = h('input', { type: 'checkbox', id, checked: Boolean(get(path, d)) }); i.dataset.path = path; i.dataset.kind = 'bool'; return h('div', { class: 'quiz-opt' }, i, h('label', { for: id }, label)); };
  const pubChk = (id, label, key) => { const i = h('input', { type: 'checkbox', id, checked: Boolean(pub[key]) }); i.dataset.pub = key; return h('div', { class: 'quiz-opt' }, i, h('label', { for: id }, label)); };
  const sched = h('select', { id: 'st-sched' }, ...['daily', 'weekly'].map((v) => h('option', { value: v, selected: get('automation.schedule', 'daily') === v }, v === 'daily' ? 'Every day' : 'Every week')));
  sched.dataset.path = 'automation.schedule'; sched.dataset.kind = 'str';
  const dband = bandSelect('st-band', get('automation.defaultBand', 'all')); dband.dataset.path = 'automation.defaultBand'; dband.dataset.kind = 'str';
  const topics = h('textarea', { id: 'st-topics', rows: 4 }, (get('safety.bannedTopics', []) || []).join('\n')); topics.dataset.path = 'safety.bannedTopics'; topics.dataset.kind = 'lines';
  const domains = h('textarea', { id: 'st-domains', rows: 3 }, (get('sources.blockedDomains', []) || []).join('\n')); domains.dataset.path = 'sources.blockedDomains'; domains.dataset.kind = 'lines';
  const form = h('form', { class: 'stack narrow-left', onsubmit: async (e) => {
    e.preventDefault();
    const patch = {}; const pubPatch = {};
    form.querySelectorAll('[data-path]').forEach((el) => {
      const k = el.dataset.kind;
      patch[el.dataset.path] = k === 'int' ? Number(el.value) : k === 'bool' ? el.checked : k === 'lines' ? el.value.split('\n').map((x) => x.trim()).filter(Boolean) : el.value;
    });
    form.querySelectorAll('[data-pub]').forEach((el) => { pubPatch[el.dataset.pub] = el.checked; });
    await act(() => store.updateSettings(patch, pubPatch), 'Settings saved.');
  } },
  h('h2', {}, 'Automatic pages'),
  chk('st-auto', 'Make pages automatically', 'automation.enabled', true), field('st-sched', 'How often', sched), num('st-ppr', 'Pages each time (1 to 5)', 'automation.pagesPerRun', 2), field('st-band', 'Default audience', dband),
  h('h2', {}, 'Daily limits (keep these low to stay inside the free plans)'),
  num('st-mpd', 'Most pages per day', 'limits.maxPagesPerDay', 10), num('st-msc', 'Most searches per day', 'limits.maxSearchCallsPerDay', 200), num('st-tok', 'Most AI tokens per day', 'limits.maxLlmTokensPerDay', 2000000),
  h('h2', {}, 'Pages written by adults'),
  chk('st-appr', 'Adults need my approval before they can write', 'submissions.requireAuthorApproval', true), num('st-spd', 'Pages one adult can send each day', 'submissions.maxPerDay', 2), num('st-spend', 'Most pages waiting at once', 'submissions.maxPending', 10),
  pubChk('st-open', 'Adults can send pages in', 'submissionsOpen'),
  h('h2', {}, 'Safety and sources'),
  chk('st-web', 'Check pages for copying against the whole web', 'sources.webCheck', true),
  field('st-topics', 'Blocked words and topics (one per line)', topics), field('st-domains', 'Websites never to use (one per line)', domains),
  h('h2', {}, 'Whole site'), pubChk('st-maint', 'Maintenance mode (shows a notice to visitors)', 'maintenance'),
  h('button', { type: 'submit', class: 'btn btn-big' }, 'Save settings'));

  const cur = h('input', { type: 'password', id: 'rc-cur', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
  const nw = h('input', { type: 'password', id: 'rc-new', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
  const rot = h('form', { class: 'stack narrow-left', onsubmit: async (e) => {
    e.preventDefault();
    await act(() => store.rotateCode(cur.value, nw.value), 'Code changed.');
    cur.value = ''; nw.value = '';
  } }, h('h2', {}, 'Change my 6-digit code'), field('rc-cur', 'Current code', cur), field('rc-new', 'New code', nw, 'Six digits that are not all the same or in a row.'), h('button', { type: 'submit', class: 'btn' }, 'Change code'));
  body.replaceChildren(form, rot);
}
