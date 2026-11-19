// Reading mode (All ages / Junior / Teen / Everything). Stored ONLY on this device (localStorage).
// It changes which pages are shown. It is sent to the server only with a Why Bot question (as the word junior or teen, with no identity).
import { BANDS_FOR_MODE } from '../config.js';

const KEY = 'whyverse.mode';
let allowEverything = false; // switched on in Stage 4 for signed-in adults
let mode = 'junior';
const listeners = new Set();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'all' || v === 'junior' || v === 'teen' || (v === 'everything' && allowEverything)) return v;
  } catch { /* storage blocked: use default */ }
  return 'junior';
}

export function initMode() {
  mode = read();
}

export function getMode() {
  return mode;
}

export function bandsForMode(m = mode) {
  return BANDS_FOR_MODE[m] || BANDS_FOR_MODE.junior;
}

export function availableModes() {
  return allowEverything ? ['all', 'junior', 'teen', 'everything'] : ['all', 'junior', 'teen'];
}

/** Called when an adult signs in or out. Restores a saved "Everything" choice on sign-in. */
export function setAllowEverything(flag) {
  allowEverything = Boolean(flag);
  const before = mode;
  if (!allowEverything && mode === 'everything') mode = 'junior'; // not saved, so signing back in restores it
  else if (allowEverything) mode = read();
  if (mode !== before) listeners.forEach((fn) => fn(mode));
}

/**
 * Does changing from `from` to `to` need a grown-up?
 * Switching to Teen, or from Teen to Junior, does. Moving to "All ages" (the most careful mode)
 * is always free, and so is moving between All ages and Junior.
 */
export function needsAdult(from, to) {
  if (from === to) return false;
  if (to === 'all') return false;
  if (to === 'teen' || to === 'everything') return true;
  return from === 'teen' || from === 'everything'; // to === 'junior'
}

export function setMode(next) {
  if (!availableModes().includes(next) || next === mode) return;
  mode = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(mode));
}

export function onModeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
