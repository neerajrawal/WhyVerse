import { h, formatDate } from '../../lib/dom.js';
import { navigate } from '../../router.js';
import { toast } from '../../components/toast.js';
import { getAuthState } from '../../state/auth.js';
import { store } from '../../lib/accountStore.js';
import { emptyState } from '../../components/states.js';

const STATUS = {
  draft: ['Draft', 'Only you can see this.'],
  submitted: ['Waiting for review', 'The automatic checks are done. A grown-up will read it soon.'],
  in_review: ['Being reviewed', 'A grown-up is reading it now.'],
  changes_requested: ['Changes needed', 'Please read the comment, edit your page and send it again.'],
  published: ['Published', 'Everyone can read it.'],
  rejected: ['Not accepted', 'It cannot be published. See the reason below.'],
};

export default async function render() {
  const { user } = getAuthState();
  let { drafts, submissions } = await store.listMyPages(user.uid).catch(() => ({ drafts: [], submissions: [] }));
  const root = h('div', { class: 'container section narrow' });

  async function remove(d) {
    if (!confirm(`Delete the draft "${d.title || 'Untitled'}"?`)) return;
    await store.deleteDraft(user.uid, d.id);
    drafts = drafts.filter((x) => x.id !== d.id);
    draw();
  }
  async function editAgain(s) {
    try {
      const draftId = await store.reopenSubmission(user.uid, s.id);
      navigate(`/write?draft=${encodeURIComponent(draftId)}`);
    } catch (err) { toast((err && err.message) || 'Could not open that page.'); }
  }

  function row({ title, status, when, comment, actions }) {
    const [label, help] = STATUS[status] || [status, ''];
    return h('li', { class: 'reading-row' },
      h('div', { class: 'reading-main' },
        h('strong', {}, title || 'Untitled'),
        h('span', { class: `chip status-${status}` }, label),
        h('span', { class: 'mode-note' }, `${help}${when ? ` · ${formatDate(when)}` : ''}`),
        comment ? h('p', { class: 'admin-comment' }, h('strong', {}, status === 'rejected' ? 'Why: ' : 'Comment from the reviewer: '), comment) : null),
      h('div', { class: 'reading-actions' }, ...actions));
  }

  function draw() {
    const rows = [
      ...drafts.map((d) => row({ title: d.title, status: 'draft', when: d.updatedAt, actions: [
        h('a', { class: 'btn btn-small', href: `/write?draft=${encodeURIComponent(d.id)}` }, 'Continue'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => remove(d) }, 'Delete'),
      ] })),
      ...submissions.map((s) => row({
        title: s.title, status: s.status, when: s.createdAt, comment: s.adminComment,
        actions: ['submitted', 'changes_requested'].includes(s.status)
          ? [h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => editAgain(s) }, 'Edit again')]
          : s.status === 'published' && s.slug ? [h('a', { class: 'btn btn-ghost btn-small', href: `/page/${encodeURIComponent(s.slug)}` }, 'Read')] : [],
      })),
    ];
    root.replaceChildren(
      h('h1', {}, 'My Pages'),
      h('p', { class: 'lead' }, 'Pages you have written, and where each one is up to.'),
      h('p', {}, h('a', { class: 'btn', href: '/write' }, '✍️ Write a new page')),
      h('div', { class: 'box box-dyk' }, h('p', {}, 'Every page is checked by the system and read by a grown-up before anyone else can see it. You can send up to 2 pages a day.')),
      rows.length ? h('ul', { class: 'reading-list' }, ...rows) : emptyState('You have not written any pages yet.'),
    );
  }
  draw();
  return { node: root, title: 'My Pages', description: 'Your pages and their status.' };
}
