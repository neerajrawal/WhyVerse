'use strict';
/** Kept so every handler can keep calling callableOptions(); the Vercel runtime ignores these options. */
const callableOptions = (extra = {}) => extra;
module.exports = { callableOptions };
