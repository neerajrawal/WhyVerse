'use strict';
/**
 * Input sanitising. WhyVerse never stores or renders raw HTML.
 *
 * Page bodies are stored as a list of BLOCKS (plain text only):
 *   { type: 'h2' | 'h3' | 'p', text }
 *   { type: 'ul' | 'ol', items: [text, ...] }
 * Inline emphasis is the markdown-lite pair **bold**, which the frontend turns into <strong>
 * with DOM calls (textContent), so there is no innerHTML anywhere and no XSS surface.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;

/** Remove tags, entities used to smuggle tags, control and bidi-override characters. */
function stripHtml(input) {
  let s = String(input ?? '');
  s = s.replace(CONTROL_CHARS, '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<\/?[a-zA-Z!?][^>]*>/g, ' ');
  s = s.replace(/&lt;|&#0*60;|&#x0*3c;/gi, ' ').replace(/&gt;|&#0*62;|&#x0*3e;/gi, ' ');
  s = s.replace(/javascript\s*:/gi, '').replace(/data\s*:\s*text\/html/gi, '');
  return s;
}

/** One-line text (titles, names, reasons). */
function cleanLine(input, maxLen = 120) {
  return stripHtml(input).replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/** Multi-line text, keeps paragraph breaks. */
function cleanText(input, maxLen = 20000) {
  return stripHtml(input)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen);
}

/** Keep **bold** only; drop any other markdown-ish emphasis characters that could confuse. */
function cleanInline(text) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 2000);
}

/**
 * Parse the simple editor format into safe blocks.
 *   "# " or "## "  -> h2      "### " -> h3
 *   "- " or "* "   -> bullet list     "1. " -> numbered list
 *   anything else  -> paragraph (blank line separates paragraphs)
 */
function markdownLiteToBlocks(raw) {
  const text = cleanText(raw, 30000);
  const blocks = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', text: cleanInline(para.join(' ')) });
      para = [];
    }
  };
  const flushList = () => {
    if (list && list.items.length) blocks.push(list);
    list = null;
  };

  for (const lineRaw of text.split('\n')) {
    const line = lineRaw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    let m;
    if ((m = line.match(/^#{1,2}\s+(.+)$/))) {
      flushPara(); flushList();
      blocks.push({ type: 'h2', text: cleanLine(m[1], 120) });
    } else if ((m = line.match(/^#{3,6}\s+(.+)$/))) {
      flushPara(); flushList();
      blocks.push({ type: 'h3', text: cleanLine(m[1], 120) });
    } else if ((m = line.match(/^[-*•]\s+(.+)$/))) {
      flushPara();
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(cleanInline(m[1]));
    } else if ((m = line.match(/^\d{1,2}[.)]\s+(.+)$/))) {
      flushPara();
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(cleanInline(m[1]));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks.slice(0, 200);
}

/** Validate an already-structured block list (e.g. from the LLM). Returns safe blocks. */
function normaliseBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const out = [];
  for (const b of blocks.slice(0, 200)) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'h2' || b.type === 'h3') {
      const t = cleanLine(b.text, 120);
      if (t) out.push({ type: b.type, text: t });
    } else if (b.type === 'p') {
      const t = cleanInline(stripHtml(b.text));
      if (t) out.push({ type: 'p', text: t });
    } else if (b.type === 'ul' || b.type === 'ol') {
      const items = (Array.isArray(b.items) ? b.items : [])
        .slice(0, 30)
        .map((i) => cleanInline(stripHtml(i)))
        .filter(Boolean);
      if (items.length) out.push({ type: b.type, items });
    }
  }
  return out;
}

function blocksToPlainText(blocks) {
  return (blocks || [])
    .map((b) => (b.items ? b.items.join('\n') : b.text || ''))
    .join('\n\n')
    .replace(/\*\*/g, '');
}

function countWords(text) {
  const t = String(text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Reading time in whole minutes, minimum 1 (about 150 wpm for young readers). */
function readingMinutes(text, wpm = 150) {
  return Math.max(1, Math.round(countWords(text) / wpm));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Only http(s) URLs; anything else is dropped. Used for source links shown on pages. */
function safeUrl(u) {
  try {
    const url = new URL(String(u));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString().slice(0, 500);
  } catch {
    return '';
  }
}

module.exports = {
  stripHtml,
  cleanLine,
  cleanText,
  markdownLiteToBlocks,
  normaliseBlocks,
  blocksToPlainText,
  countWords,
  readingMinutes,
  escapeHtml,
  safeUrl,
};
