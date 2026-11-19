'use strict';
// POST /api/cron/<job>  (rewritten to /api/cron?job=<job> by vercel.json)
const { handleCron } = require('./_run');
module.exports = handleCron;
