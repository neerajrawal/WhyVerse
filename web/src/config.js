// Public site configuration (all values are safe to expose).
const env = import.meta.env;

export const config = {
  demo: env.VITE_DEMO === '1' || !env.VITE_FIREBASE_PROJECT_ID,
  useEmulators: env.VITE_USE_EMULATORS === '1',
  region: 'asia-south1',
  contactEmail: (env.VITE_CONTACT_EMAIL || '').trim(),
  appCheckKey: (env.VITE_APPCHECK_SITE_KEY || '').trim(),
  firebase: {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  },
  pageSize: 12,
};

export const BANDS = ['junior', 'teen', 'all'];

// Which page bands each reading mode may see.
export const BANDS_FOR_MODE = {
  all: ['all'], // "All ages": only pages that are safe and suitable for everyone
  junior: ['junior', 'all'],
  teen: ['teen', 'all'],
  everything: ['junior', 'teen', 'all'], // adults only (enabled in Stage 4)
};

export const REPORT_REASONS = ['inaccurate', 'unsuitable', 'scary', 'copyright', 'broken', 'other'];
