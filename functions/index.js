'use strict';
/**
 * WhyVerse server entry point. Every export is a callable or a scheduled job; api/[fn].js and
 * api/cron/[job].js (Vercel, free) look them up by name. See src/runtime/.
 *
 * Stage 2: admin gate, public counters/reports, backups. Stage 4: account export/delete.
 * Later stages add: content engine (stage 5), submissions (6), admin actions (7), chat (8),
 * account helpers (4). Each is exported from here as it is delivered.
 */

// ----- Admin gate (6-digit code, server-side) -----
const accessCode = require('./src/admin/accessCode');
exports.adminVerifyCode = accessCode.adminVerifyCode;
exports.adminEndSession = accessCode.adminEndSession;
exports.adminRotateCode = accessCode.adminRotateCode;

// ----- Public (guest) functions: anonymous counters and reports -----
const publicApi = require('./src/public/publicApi');
exports.recordView = publicApi.recordView;
exports.recordSearch = publicApi.recordSearch;
exports.reportPage = publicApi.reportPage;

// ----- Adult accounts: data export and deletion -----
const accountApi = require('./src/account/accountApi');
exports.exportMyData = accountApi.exportMyData;
exports.deleteMyAccount = accountApi.deleteMyAccount;
exports.confirmAdult = require('./src/account/adult').confirmAdult;

// ----- Content engine (stage 5): scheduled, auto mode is OFF until an admin enables it -----
const engine = require('./src/content/engine');
exports.contentQueueRunner = engine.contentQueueRunner;
exports.contentAutoPlanner = engine.contentAutoPlanner;

// ----- Adult submissions (stage 6): every page waits for an admin -----
const submitApi = require('./src/submissions/submitApi');
exports.submitPage = submitApi.submitPage;
exports.reopenSubmission = submitApi.reopenSubmission;
exports.requestAuthorAccess = submitApi.requestAuthorAccess;

// ----- Admin actions (stage 7): every change an admin makes goes through these -----
const adminApi = require('./src/admin/adminApi');
for (const name of ['adminPageAction', 'adminReviewSubmission', 'adminResolveReport', 'adminUpdateSettings', 'adminGeneratePage', 'adminJobAction', 'adminSetAuthorStatus', 'adminMarkRead']) {
  exports[name] = adminApi[name];
}


// ----- Stage 8: the chatbot (guests allowed, nothing stored) -----
exports.chat = require('./src/chat/chatApi').chat;
