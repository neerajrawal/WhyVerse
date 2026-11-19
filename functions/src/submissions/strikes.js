'use strict';
/**
 * The warning ladder. Each automatic rejection in a row moves the author one step up:
 *   notice -> warning -> final warning (short pause) -> suspension (long pause) -> blocked.
 * An admin approving one of their pages resets the count. Steps and pauses are editable in
 * settings/main.submissions.strikes.
 */
const TEXT = {
  notice: (n) => ({
    title: 'Page not accepted',
    body: 'This page could not be accepted (see the reason below). Nothing else happens. You can write another page whenever you like.',
  }),
  warning: (n) => ({
    title: 'Warning: second page not accepted',
    body: `${n} pages in a row have not been accepted. Please read the reasons and the writing tips before sending another. More rejections will pause your writing.`,
  }),
  final_warning: (n, h) => ({
    title: 'Final warning: writing paused',
    body: `${n} pages in a row have not been accepted. You cannot send pages for ${h} hours. If the next page is rejected too, your writing will be suspended for longer.`,
  }),
  suspended: (n, h) => ({
    title: 'Writing suspended',
    body: `${n} pages in a row have not been accepted. You cannot send pages for ${Math.round(h / 24)} days. One more rejection will turn off writing for your account until an admin reviews it.`,
  }),
  blocked: (n) => ({
    title: 'Writing turned off',
    body: `${n} pages in a row have not been accepted, so writing is turned off for your account. You can still read everything. An admin will look at your account and may turn writing back on.`,
  }),
};

/** @returns {{level, title, body, pauseHours, block, streak}} for the author's new streak. */
function strikeAction(streak, ladder) {
  const steps = [...ladder].sort((a, b) => a.at - b.at);
  const step = steps.filter((s) => s.at <= streak).pop() || steps[0];
  const text = (TEXT[step.level] || TEXT.notice)(streak, step.pauseHours || 0);
  return { level: step.level, ...text, pauseHours: step.pauseHours || 0, block: Boolean(step.block), streak };
}

module.exports = { strikeAction };
