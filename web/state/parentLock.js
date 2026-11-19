// Parent lock: a PIN, set by a grown-up, that is needed to switch between Junior and Teen.
//
// The PIN is scrambled (PBKDF2, 150,000 rounds, random salt) and kept ONLY in this browser's
// storage. It is never sent to a server. Wrong guesses are slowed down: 5 wrong tries lock the
// PIN pad for 5 minutes.
//
// Honest limit: WhyVerse cannot check who is an adult (that would mean collecting ID, which a
// service for children should not do). This is a parental control, like those on kids' apps.
// Clearing the site's browser data resets it, and also resets reading mode to Junior.

const KEY = 'whyverse.parentlock';
const FAILS = 'whyverse.parentlock.fails';
const ROUNDS = 150000;
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin, saltBytes) {
  if (!globalThis.crypto || !crypto.subtle) throw new Error('This browser cannot keep a secure PIN (it needs https).');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: ROUNDS }, key, 256);
}

export const validPin = (pin) => /^\d{4,6}$/.test(String(pin));
export const hasPin = () => Boolean(read(KEY));

export function lockedForMinutes() {
  const f = read(FAILS);
  if (f && f.until && f.until > Date.now()) return Math.ceil((f.until - Date.now()) / 60000);
  return 0;
}

export async function setPin(pin) {
  if (!validPin(pin)) throw new Error('The PIN must be 4 to 6 digits.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(String(pin), salt);
  if (!write(KEY, { salt: b64(salt), hash: b64(hash), rounds: ROUNDS })) throw new Error('Could not save the PIN on this device.');
  try { localStorage.removeItem(FAILS); } catch { /* ignore */ }
}

/** @returns {Promise<{ok: boolean, lockedMinutes?: number, left?: number}>} */
export async function verifyPin(pin) {
  const mins = lockedForMinutes();
  if (mins) return { ok: false, lockedMinutes: mins };
  const rec = read(KEY);
  if (!rec) return { ok: false };
  const got = new Uint8Array(await derive(String(pin), unb64(rec.salt)));
  const want = unb64(rec.hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i += 1) diff |= got[i] ^ (want[i] || 0);
  if (diff === 0) {
    try { localStorage.removeItem(FAILS); } catch { /* ignore */ }
    return { ok: true };
  }
  const f = read(FAILS) || { n: 0 };
  const n = (f.until && f.until <= Date.now() ? 0 : f.n) + 1;
  write(FAILS, n >= MAX_FAILS ? { n: 0, until: Date.now() + LOCK_MS } : { n });
  return { ok: false, left: Math.max(0, MAX_FAILS - n), lockedMinutes: n >= MAX_FAILS ? 5 : 0 };
}

export async function removePin(currentPin) {
  const r = await verifyPin(currentPin);
  if (r.ok) { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
  return r;
}

export async function changePin(currentPin, newPin) {
  const r = await verifyPin(currentPin);
  if (r.ok) await setPin(newPin);
  return r;
}
