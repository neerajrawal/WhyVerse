'use strict';
const { db, FieldValue } = require('./firebase');

/** In-app alert for all admins (the bell in the admin portal). */
async function notifyAdmins({ type, title, body = '', link = '' }) {
  try {
    await db.collection('notifications').add({
      audience: 'admin',
      type, // 'review_needed' | 'limit_reached' | 'report' | 'job_failed' | 'submission'
      title: String(title).slice(0, 120),
      body: String(body).slice(0, 300),
      link,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('notifyAdmins failed', err.message);
  }
}

/** In-app notification for one adult user (author feedback, publish confirmations). */
async function notifyUser(uid, { type, title, body = '', link = '' }) {
  try {
    await db.collection('notifications').add({
      recipientUid: uid,
      type,
      title: String(title).slice(0, 120),
      body: String(body).slice(0, 500),
      link,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('notifyUser failed', err.message);
  }
}

module.exports = { notifyAdmins, notifyUser };
