// Who is signed in (an adult, 18+) and their profile. Guests never touch this: if there is no
// sign-in hint on the device, Firebase Auth is not even downloaded.
import { config } from '../config.js';
import { store } from '../lib/accountStore.js';
import { setAllowEverything } from './mode.js';

const HINT = 'whyverse.signedin';
const state = { ready: false, user: null, profile: null, unread: 0 };
const subs = new Set();
let started;

const emit = () => subs.forEach((fn) => fn(state));
const hint = {
  has() { try { return localStorage.getItem(HINT) === '1'; } catch { return false; } },
  set(on) { try { on ? localStorage.setItem(HINT, '1') : localStorage.removeItem(HINT); } catch { /* ignore */ } },
};

export const getAuthState = () => state;
export function onAuthChange(fn) { subs.add(fn); return () => subs.delete(fn); }
// "Adult" for permission purposes means the date-of-birth check passed on the server, not just a tick-box.
const verifiedAdult = (p) => Boolean(p && p.ageConfirmed && p.adultVerifiedAt);
export const isAdult = () => Boolean(state.user && verifiedAdult(state.profile));

async function apply(user) {
  state.user = user;
  state.profile = null;
  state.unread = 0;
  if (user) {
    hint.set(true);
    try { state.profile = await store.getProfile(user.uid); } catch (err) { console.error(err); }
  } else {
    hint.set(false);
  }
  setAllowEverything(verifiedAdult(state.profile));
  state.ready = true;
  emit();
  refreshUnread();
}

/** Call once at start-up. Resolves when we know whether someone is signed in. */
export function initAuth() {
  if (started) return started;
  started = new Promise((resolve) => {
    if (!config.demo && !hint.has()) {
      state.ready = true; // plain guest: nothing to load
      emit();
      resolve();
      return;
    }
    let first = true;
    store.watchAuth(async (user) => {
      await apply(user);
      if (first) { first = false; resolve(); }
    });
  });
  return started;
}

export async function refreshUnread() {
  if (!state.user || !state.profile) return;
  try {
    const list = await store.listNotifications(state.user.uid);
    state.unread = list.filter((n) => !n.read).length;
    emit();
  } catch { /* the bell is optional */ }
}

// ---------------------------------------------------------------- actions
async function afterSignIn(user) {
  if (user) await apply(user);
  return user;
}

export const signInWithGoogle = async () => afterSignIn(await store.signInGoogle());
export const signInWithEmail = async (email, password) => afterSignIn(await store.signInEmail(email, password));
export const signUpWithEmail = async (email, password) => afterSignIn(await store.signUpEmail(email, password));
export const sendPasswordReset = (email) => store.resetPassword(email);
export const resendVerification = () => store.resendVerification();

export async function checkVerified() {
  const u = await store.reloadUser();
  if (u) await apply(u);
  return u;
}

export async function signOutNow() {
  await store.signOut();
  await apply(null);
}

/** Create the profile, then let the server check the date of birth. Under 18: the account is removed. */
export async function completeProfile({ dob, ...data }) {
  if (!state.user) throw new Error('Not signed in');
  await store.createProfile(state.user.uid, data);
  try {
    state.profile = await store.confirmAdult(state.user.uid, dob);
  } catch (err) {
    if (err && err.code === 'failed-precondition') await declineAndDelete();
    throw err;
  }
  setAllowEverything(verifiedAdult(state.profile));
  emit();
  refreshUnread();
  return state.profile;
}

/** For accounts made before the date-of-birth check existed. */
export async function confirmAdultNow(dob) {
  state.profile = await store.confirmAdult(state.user.uid, dob);
  setAllowEverything(verifiedAdult(state.profile));
  emit();
  return state.profile;
}

export async function requestAuthorNow(note) {
  state.profile = await store.requestAuthor(state.user.uid, note);
  emit();
  return state.profile;
}

export async function saveProfile(patch) {
  state.profile = await store.updateProfile(state.user.uid, patch);
  emit();
  return state.profile;
}

/** Someone who is not 18+ declines: remove the account that was just created. */
export async function declineAndDelete() {
  try { await store.deleteAccount(state.user.uid); } catch (err) { console.error(err); await store.signOut().catch(() => {}); }
  await apply(null);
}

export async function deleteMyAccount({ password } = {}) {
  await store.reauth({ password });
  await store.deleteAccount(state.user.uid);
  await apply(null);
}

export const exportMyData = () => store.exportData(state.user.uid);
