'use strict';
// POST /api/<name>  (rewritten to /api/call?fn=<name> by vercel.json)
const { handleCallable } = require('./_run');
module.exports = handleCallable;
