// Tiny translation layer. English now; to add Hindi, create hi.json with the same keys,
// add it to LOADERS below, and call setLanguage('hi'). Missing keys fall back to English.
import en from './en.json';

const LOADERS = {
  en: async () => en,
  // hi: () => import('./hi.json').then((m) => m.default),
};

let lang = 'en';
let dict = en;

export async function setLanguage(code) {
  if (!LOADERS[code]) return;
  dict = await LOADERS[code]();
  lang = code;
  document.documentElement.lang = code;
}

export function getLanguage() {
  return lang;
}

/** t('page.minutes', { n: 3 }) -> "3 min read" */
export function t(key, vars) {
  let s = dict[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
