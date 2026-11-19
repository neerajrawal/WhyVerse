'use strict';
const { db, FieldValue } = require('./firebase');

/**
 * Admin audit trail: who did what and when (admin portal "Activity log" tab).
 * Never put guest/child information in here. Only admin and adult-account actions.
 */
async function logActivity({ actorUid = 'system', actorLabel = '', action, target = '', meta = {} }) {
  try {
    await db.collection('activityLog').add({
      ts: FieldValue.serverTimestamp(),
      actorUid,
      actorLabel,
      action,
      target,
      meta,
    });
  } catch (err) {
    // Logging must never break the request that triggered it.
    console.error('logActivity failed', err.message);
  }
}

/** Timestamped line for one step of a content job (jobLogs collection). */
async function jobLog(jobId, step, level, message, data = {}) {
  try {
    await db.collection('jobLogs').add({
      jobId,
      step,
      level, // 'info' | 'warn' | 'error'
      message: String(message).slice(0, 1000),
      data,
      ts: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('jobLog failed', err.message);
  }
}

module.exports = { logActivity, jobLog };
