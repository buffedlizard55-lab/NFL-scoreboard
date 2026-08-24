/* ------------------------------------------------------------------------- *
 * NFLRefresh — small, testable polling scheduler for the browser app.
 *
 * The selected-day scoreboard stays on a 15-second cadence. The live-header
 * score/status feed and each live game's detail (including the play
 * descriptions used for flags and reviews) share a separate 1-second schedule,
 * so neither waits for the selected-day scoreboard request. The caller can
 * suppress all schedules while hidden.
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
    // Both live booth feeds (all events, and the red-zone subset) repaint on
    // every completed response; the larger tabs keep the 5-second cadence.
    if (activeTab === 'booth' || activeTab === 'redzone') return true;
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
      if (!isVisible()) return;
      // The compact ESPN header score feed and the per-game detail feed run on
      // the same one-second beat. They are intentionally independent: a slow
      // play-by-play response must not delay a score/status update.
      if (typeof options.refreshLiveScores === 'function') options.refreshLiveScores();
      options.refreshReviews();
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
