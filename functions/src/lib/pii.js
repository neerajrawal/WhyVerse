'use strict';
/**
 * Personal-information detection (rule-based first pass).
 * Used on: adult submissions, chatbot messages, search terms, anything a visitor can type.
 * Names of private people and home addresses in free prose are harder, so the LLM safety
 * check (safety/filter.js) also looks for those. This file catches the structured kinds.
 */

const PATTERNS = [
  { type: 'email', re: /[A-Za-z0-9._%+-]+\s?(?:@|\(at\)|\[at\])\s?[A-Za-z0-9.-]+\s?(?:\.|\(dot\)|\[dot\])\s?[A-Za-z]{2,}/g },
  // Indian mobile (optionally +91 / 0 prefix) and general international numbers.
  // (?<![\d,.]) stops big ordinary numbers such as "7,800,000,000" or "384400.5" matching.
  { type: 'phone', re: /(?<![\d,.])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d,.]\d)\b/g },
  { type: 'phone', re: /\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g },
  // Aadhaar (12 digits, usually grouped 4-4-4), PAN, passport-like.
  { type: 'id_number', re: /(?<![\d,.])\d{4}[\s-]\d{4}[\s-]\d{4}(?![\d,.]\d)\b/g },
  { type: 'id_number', re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { type: 'url', re: /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi },
  { type: 'social_handle', re: /(?:^|\s)@[A-Za-z0-9_.]{3,30}\b/g },
  // "flat 4B", "house no. 12", "plot 7", street/road/nagar/colony with a number nearby.
  { type: 'address', re: /\b(?:flat|house|plot|door|h\.?\s?no)\.?\s*(?:no\.?)?\s*[#:]?\s*\d+[A-Za-z]?\b/gi },
  { type: 'address', re: /\b\d{1,4}[A-Za-z]?,?\s+[A-Za-z .]{2,30}\s(?:road|rd|street|st|lane|nagar|colony|marg|sector|cross|layout|enclave|apartments?)\b/gi },
  { type: 'address', re: /\b(?:pin|pincode|postal code)\s*[:\-]?\s*[1-9]\d{5}\b/gi },
  // "my name is X", "I live at", "my school is"
  { type: 'self_disclosure', re: /\b(?:my name is|i am called|i live (?:at|in|near)|my address is|my school is|i study at|my phone|my number is|call me on)\b/gi },
];

/**
 * @param {string} text
 * @returns {{ found: boolean, findings: {type: string, sample: string}[] }}
 */
function detectPii(text) {
  const findings = [];
  const input = String(text || '');
  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(input)) !== null) {
      const raw = m[0].trim();
      // Keep only a masked sample so reports never re-store the personal data.
      const sample = raw.length <= 4 ? '****' : `${raw.slice(0, 2)}${'*'.repeat(Math.min(raw.length - 3, 10))}${raw.slice(-1)}`;
      findings.push({ type, sample });
      if (findings.length >= 20) return { found: true, findings };
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
  return { found: findings.length > 0, findings };
}

/** Replace detected personal data with [removed]. Used on chat input before it reaches the LLM. */
function redactPii(text) {
  let out = String(text || '');
  for (const { re, type } of PATTERNS) {
    if (type === 'self_disclosure') continue; // keep the sentence; the model is told to ignore personal details
    re.lastIndex = 0;
    out = out.replace(re, (m) => (m.startsWith(' ') || m.startsWith('\n') ? ' [removed]' : '[removed]'));
  }
  return out;
}

module.exports = { detectPii, redactPii };
