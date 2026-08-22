/* ------------------------------------------------------------------------- *
 * NFLRefresh — small, testable polling scheduler for the browser app.
 *
 * Score/status data stays on the existing 15-second cadence. Live game detail
 * (including the play descriptions used for flags and reviews) has a separate
 * 1-second schedule, so booth updates do not have to wait for the scoreboard
 * request to finish first. The caller can suppress both schedules while hidden.
 * ------------------------------------------------------------------------- */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NFLRefresh = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCOREBOARD_INTERVAL_MS = 15000;
  // One second is the selected floor for this browser polling client.
  // In-flight request dedupe prevents a slow response from creating overlap.
  const LIVE_REVIEWS_INTERVAL_MS = 1000;
  const NON_REVIEW_RENDER_INTERVAL_MS = 5000;

  function shouldRenderGameContent(activeTab, lastRenderedAt, now) {
    if (activeTab === 'booth') return true;
    const currentTime = now == null ? Date.now() : Number(now);
    const previousTime = Number(lastRenderedAt) || 0;
    return previousTime === 0 || currentTime - previousTime >= NON_REVIEW_RENDER_INTERVAL_MS;
  }

  function start(options) {
    options = options || {};
    if (typeof options.refreshScoreboard !== 'function') {
      throw new TypeError('refreshScoreboard must be a function');
    }
    if (typeof options.refreshReviews !== 'function') {
      throw new TypeError('refreshReviews must be a function');
    }

    const setEvery = options.setInterval || setInterval;
    const clearEvery = options.clearInterval || clearInterval;
    const isVisible = typeof options.isVisible === 'function'
      ? options.isVisible
      : function () { return true; };

    function runScoreboard() {
      if (isVisible()) options.refreshScoreboard();
    }

    function runReviews() {
      if (isVisible()) options.refreshReviews();
    }

    const scoreboardTimer = setEvery(runScoreboard, SCOREBOARD_INTERVAL_MS);
    const reviewsTimer = setEvery(runReviews, LIVE_REVIEWS_INTERVAL_MS);
    let stopped = false;

    return {
      refreshNow: function () {
        runScoreboard();
        runReviews();
      },
      stop: function () {
        if (stopped) return;
        stopped = true;
        clearEvery(scoreboardTimer);
        clearEvery(reviewsTimer);
      }
    };
  }

  return {
    SCOREBOARD_INTERVAL_MS: SCOREBOARD_INTERVAL_MS,
    LIVE_REVIEWS_INTERVAL_MS: LIVE_REVIEWS_INTERVAL_MS,
    NON_REVIEW_RENDER_INTERVAL_MS: NON_REVIEW_RENDER_INTERVAL_MS,
    shouldRenderGameContent: shouldRenderGameContent,
    start: start
  };
});
