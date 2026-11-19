'use strict';
/** Stand-in for firebase-functions/v2/scheduler. The schedule itself is set in .github/workflows/cron.yml. */
function onSchedule(options, handler) {
  return { __kind: 'schedule', handler: typeof options === 'function' ? options : handler };
}
module.exports = { onSchedule };
