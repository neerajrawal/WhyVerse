// Preview-only twin of the server's markdownLiteToBlocks (functions/src/lib/sanitize.js).
// The server re-parses everything on submit and is the one that counts. Text only, no HTML.
const clean = (s, n) => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function markdownLiteToBlocks(raw) {
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', text: clean(para.join(' '), 2000) }); para = []; } };
  const flushList = () => { if (list && list.items.length) blocks.push(list); list = null; };
  for (const lineRaw of String(raw || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = lineRaw.trim();
    let m;
    if (!line) { flushPara(); flushList(); }
    else if ((m = line.match(/^#{1,2}\s+(.+)$/))) { flushPara(); flushList(); blocks.push({ type: 'h2', text: clean(m[1], 120) }); }
    else if ((m = line.match(/^#{3,6}\s+(.+)$/))) { flushPara(); flushList(); blocks.push({ type: 'h3', text: clean(m[1], 120) }); }
    else if ((m = line.match(/^[-*•]\s+(.+)$/))) { flushPara(); if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; } list.items.push(clean(m[1], 2000)); }
    else if ((m = line.match(/^\d{1,2}[.)]\s+(.+)$/))) { flushPara(); if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; } list.items.push(clean(m[1], 2000)); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return blocks;
}

export const countWords = (text) => { const t = String(text || '').trim(); return t ? t.split(/\s+/).length : 0; };
