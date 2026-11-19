'use strict';
/**
 * Single place that initialises the Admin SDK and exports shared handles.
 * On Vercel the service-account key arrives as FIREBASE_SERVICE_ACCOUNT_B64 (base64 of the JSON file
 * from Firebase console > Project settings > Service accounts). Locally, scripts use
 * GOOGLE_APPLICATION_CREDENTIALS or the emulator.
 */
const admin = require('firebase-admin');

function credentialOptions() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) return {};
  const key = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return { credential: admin.credential.cert(key), projectId: key.project_id };
}

if (!admin.apps.length) admin.initializeApp(credentialOptions());

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

module.exports = {
  admin,
  db,
  auth: admin.auth(),
  appCheck: () => admin.appCheck(),
  FieldValue: admin.firestore.FieldValue,
  Timestamp: admin.firestore.Timestamp,
};
