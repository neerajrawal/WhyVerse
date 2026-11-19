'use strict';
/**
 * Functions used by GUESTS (children included). Rules for everything in this file:
 *   - no sign-in needed, no identifier of the visitor is ever stored;
 *   - rate limiting uses a daily-salted one-way hash of the IP, kept for minutes, never linked to content;
 *   - only anonymous aggregate counters are written.
 */
const { onCall, HttpsError } = require('../runtime/https');
const { db, FieldValue } = require('../lib/firebase');
const secrets = require('../config/secrets');
const { callableOptions } = require('../lib/options');
const { hit } = require('../lib/rateLimit');
const { dayKey } = require('../lib/time');
const { detectPii } = require('../lib/pii');
const { slugify } = require('../lib/slug');
const { notifyAdmins } = require('../lib/notify');
const { REPORT_REASONS } = require('../config/defaults');

const opts = callableOptions({ secrets: [secrets.RATE_LIMIT_SALT] });

function cleanPageId(v) {
  const id = String(v || '');
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(id)) throw new HttpsError('invalid-argument', 'Bad page.');
  return id;
}

async function publishedPage(pageId) {
  const snap = await db.doc(`pages/${pageId}`).get();
  if (!snap.exists || snap.data().status !== 'published') {
    throw new HttpsError('not-found', 'Page not found.');
  }
  return snap.data();
}

/**
 * recordView({ pageId })
 * Adds 1 to the page's public view counter and to the day's anonymous totals.
 * A visitor refreshing the page repeatedly is counted at most 3 times an hour.
 */
exports.recordView = onCall(opts, async (request) => {
  const pageId = cleanPageId(request.data && request.data.pageId);
  const page = await publishedPage(pageId);

  const counted = await hit({
    request,
    scope: `view:${pageId}`,
    salt: secrets.RATE_LIMIT_SALT.value(),
    limit: 3,
    windowSec: 3600,
    silent: true,
  });
  if (!counted) return { counted: false };

  const day = dayKey();
  const cat = slugify(page.category || 'other') || 'other';
  await Promise.all([
    db.doc(`pages/${pageId}`).update({ viewCount: FieldValue.increment(1) }),
    db.doc(`stats/${day}`).set(
      {
        day,
        views: FieldValue.increment(1),
        byCategory: { [cat]: FieldValue.increment(1) },
        byBand: { [page.ageBand || 'all']: FieldValue.increment(1) },
      },
      { merge: true },
    ),
  ]);
  return { counted: true };
});

/**
 * recordSearch({ term })
 * Aggregate "top searches" for the admin analytics. Stores ONLY the search words and a
 * running count, no identifier, no time-ordered log. Terms that look personal, are long,
 * or contain digits/symbols are ignored, because children may type anything.
 */
exports.recordSearch = onCall(opts, async (request) => {
  const raw = String((request.data && request.data.term) || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (raw.length < 3 || raw.length > 40) return { stored: false };
  if (!/^[\p{L} ]+$/u.test(raw)) return { stored: false }; // letters and spaces only
  if (raw.split(' ').length > 4) return { stored: false };
  if (detectPii(raw).found) return { stored: false };

  const allowed = await hit({
    request,
    scope: 'search',
    salt: secrets.RATE_LIMIT_SALT.value(),
    limit: 20,
    windowSec: 3600,
    silent: true,
  });
  if (!allowed) return { stored: false };

  const id = slugify(raw);
  if (!id) return { stored: false };
  await db.doc(`searchStats/${id}`).set(
    { term: raw, count: FieldValue.increment(1), lastDay: dayKey() },
    { merge: true },
  );
  return { stored: true };
});

/**
 * reportPage({ pageId, reason })
 * "Report this page" works without sign-in. Stored: page id, reason, timestamp. Nothing else.
 * There is deliberately NO free-text field, because children could type personal details.
 */
exports.reportPage = onCall(opts, async (request) => {
  const pageId = cleanPageId(request.data && request.data.pageId);
  const reason = String((request.data && request.data.reason) || '');
  if (!REPORT_REASONS.includes(reason)) throw new HttpsError('invalid-argument', 'Please pick a reason.');

  const page = await publishedPage(pageId);

  await hit({
    request,
    scope: 'report',
    salt: secrets.RATE_LIMIT_SALT.value(),
    limit: 5,
    windowSec: 3600,
  });
  // The same visitor cannot report the same page more than once a day.
  const first = await hit({
    request,
    scope: `report:${pageId}`,
    salt: secrets.RATE_LIMIT_SALT.value(),
    limit: 1,
    windowSec: 86400,
    silent: true,
  });
  if (!first) return { ok: true, duplicate: true };

  await db.collection('reports').add({
    pageId,
    pageTitle: String(page.title || '').slice(0, 120),
    reason,
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
  });
  await notifyAdmins({
    type: 'report',
    title: 'A page was reported',
    body: `"${String(page.title || '').slice(0, 80)}": ${reason}`,
    link: '/authority/reports',
  });
  return { ok: true };
});
