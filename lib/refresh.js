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
  // Score/status uses the smaller league-wide header payload, so it can run
  // more frequently than full play-by-play without multiplying requests by
  // the number of live games. The caller deduplicates an in-flight header
  // request; 250ms is an attempt cadence, not a freshness guarantee.
  const LIVE_SCORES_INTERVAL_MS = 250;
  // Full game summaries remain at one second: they carry complete
  // play-by-play/box-score payloads and are requested once per live game.
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

    function runLiveScores() {
      if (isVisible() && typeof options.refreshLiveScores === 'function') {
        options.refreshLiveScores();
      }
    }

    function runReviews() {
      if (isVisible()) options.refreshReviews();
    }

    const scoreboardTimer = setEvery(runScoreboard, SCOREBOARD_INTERVAL_MS);
    const liveScoresTimer = typeof options.refreshLiveScores === 'function'
      ? setEvery(runLiveScores, LIVE_SCORES_INTERVAL_MS)
      : null;
    const reviewsTimer = setEvery(runReviews, LIVE_REVIEWS_INTERVAL_MS);
    let stopped = false;

    return {
      refreshNow: function () {
        runScoreboard();
        runLiveScores();
        runReviews();
      },
      stop: function () {
        if (stopped) return;
        stopped = true;
        clearEvery(scoreboardTimer);
        if (liveScoresTimer) clearEvery(liveScoresTimer);
        clearEvery(reviewsTimer);
      }
    };
  }

  return {
    SCOREBOARD_INTERVAL_MS: SCOREBOARD_INTERVAL_MS,
    LIVE_SCORES_INTERVAL_MS: LIVE_SCORES_INTERVAL_MS,
    LIVE_REVIEWS_INTERVAL_MS: LIVE_REVIEWS_INTERVAL_MS,
    NON_REVIEW_RENDER_INTERVAL_MS: NON_REVIEW_RENDER_INTERVAL_MS,
    shouldRenderGameContent: shouldRenderGameContent,
    start: start
  };
});
