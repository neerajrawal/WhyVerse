// Safe DOM building. The whole site renders through h(): text always goes in as text nodes,
// never as HTML, so content from the database can never inject markup or scripts.

const BLOCKED_ATTRS = new Set(['innerhtml', 'outerhtml', 'srcdoc', 'style']);

export function safeHref(value) {
  const v = String(value ?? '').trim();
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  if (v.startsWith('#')) return v;
  try {
    const u = new URL(v);
    if (['https:', 'http:', 'mailto:'].includes(u.protocol)) return u.toString();
  } catch { /* fall through */ }
  return '#';
}

export function safeImgSrc(value) {
  const v = String(value ?? '').trim();
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:') return u.toString();
  } catch { /* fall through */ }
  return '';
}

function append(parent, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) child.forEach((c) => append(parent, c));
  else if (child instanceof Node) parent.appendChild(child);
  else parent.appendChild(document.createTextNode(String(child)));
}

/** h('a', { href: '/x', class: 'btn' }, 'Hello', h('b', {}, 'there')) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val == null || val === false) continue;
    const k = key.toLowerCase();
    if (BLOCKED_ATTRS.has(k)) continue;
    if (key === 'class') el.className = val;
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (k.startsWith('on') && typeof val === 'function') el.addEventListener(k.slice(2), val);
    else if (k.startsWith('on')) continue;
    else if (k === 'href') el.setAttribute('href', safeHref(val));
    else if (k === 'src') el.setAttribute('src', safeImgSrc(val));
    else if (val === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(val));
  }
  children.forEach((c) => append(el, c));
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  children.forEach((c) => append(el, c));
  return el;
}

/** Render "plain **bold** text" as safe nodes (the only inline formatting WhyVerse allows). */
export function inline(text) {
  const frag = document.createDocumentFragment();
  String(text ?? '').split('**').forEach((part, i) => {
    if (!part) return;
    frag.appendChild(i % 2 ? h('strong', {}, part) : document.createTextNode(part));
  });
  return frag;
}

export function setMeta({ title, description, image, url } = {}) {
  const full = title ? `${title} · WhyVerse` : 'WhyVerse: curious answers for curious minds';
  document.title = full;
  const set = (attr, name, content) => {
    if (!content) return;
    let m = document.head.querySelector(`meta[${attr}="${name}"]`);
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute(attr, name);
      document.head.appendChild(m);
    }
    m.setAttribute('content', content);
  };
  set('name', 'description', description);
  set('property', 'og:title', full);
  set('property', 'og:description', description);
  set('property', 'og:image', image);
  set('property', 'og:url', url || location.href);
}

export function formatDate(d) {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return '';
  }
}
