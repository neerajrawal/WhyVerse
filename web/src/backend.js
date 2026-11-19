// Loads Firebase lazily (so the demo build never downloads it) and exposes handles.
import { config } from './config.js';

let ready;

export function backend() {
  if (!ready) ready = init();
  return ready;
}

async function init() {
  const [{ initializeApp }, fs] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
  ]);
  const app = initializeApp(config.firebase);

  let appCheck = null;
  let appCheckMod = null;
  if (config.appCheckKey) {
    appCheckMod = await import('firebase/app-check');
    if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    appCheck = appCheckMod.initializeAppCheck(app, {
      provider: new appCheckMod.ReCaptchaV3Provider(config.appCheckKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  const db = fs.getFirestore(app);
  if (config.useEmulators) fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, db, fs, appCheck, appCheckMod };
}

/**
 * Call a server function (Vercel route /api/<name>). Guests send no identity at all; signed-in
 * adults and admins send their Firebase ID token. Throws Error(message) with .code like "permission-denied".
 */
export async function callFunction(name, data) {
  const headers = { 'Content-Type': 'application/json' };
  if (authReady) {
    const { auth } = await authReady;
    if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  if (config.appCheckKey) {
    try {
      const b = await backend();
      const t = await b.appCheckMod.getToken(b.appCheck, false);
      if (t && t.token) headers['X-Firebase-AppCheck'] = t.token;
    } catch { /* the server decides whether this is acceptable */ }
  }
  let res;
  try {
    res = await fetch(`/api/${encodeURIComponent(name)}`, { method: 'POST', headers, body: JSON.stringify({ data }) });
  } catch {
    throw Object.assign(new Error('No internet connection. Please try again.'), { code: 'unavailable' });
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !body || body.error) {
    const e = (body && body.error) || {};
    throw Object.assign(new Error(e.message || 'Something went wrong. Please try again.'), { code: e.status || 'internal' });
  }
  return body.result;
}

let authReady;

/** Firebase Auth, loaded only when needed (guests never download it). */
export function authBackend() {
  if (!authReady) {
    authReady = (async () => {
      const [b, mod] = await Promise.all([backend(), import('firebase/auth')]);
      const auth = mod.getAuth(b.app);
      if (config.useEmulators) mod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      return { ...b, auth, authMod: mod };
    })();
  }
  return authReady;
}
