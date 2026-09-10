/* ------------------------------------------------------------------------- *
 * NFLRefresh — small, testable polling scheduler for the browser app.
 *
 * The selected-day scoreboard stays on a 15-second cadence. The compact
 * live-header score/status feed has a separate fast schedule (100 ms), while
 * each live game's full detail (including the play descriptions used for
 * scoring-ruling context) runs every 500 ms. Neither waits for the selected-
 * day scoreboard request, and the caller can suppress all schedules while
 * hidden.
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
  // Score/status uses a single league-wide header payload, so it can run more
  // frequently than full play-by-play without multiplying requests by the
  // number of live games. The caller deduplicates an in-flight header request
  // and keeps one queued follow-up after a slow reply; this is an attempted
  // cadence, not a freshness guarantee. It is kept as fast as a browser can
  // realistically schedule a single non-overlapping request so a new scoring
  // review/penalty appears as early as the provider publishes it.
  const LIVE_SCORES_INTERVAL_MS = 100;
  // Full game summaries are the reconciliation lane that ties each flag,
  // challenge, replay, and under-review record to its scoring play and that
  // establishes red-zone position from play start fields. They are requested
  // once per live game at 500 ms so a ruling the compact header cannot yet
  // resolve is picked up within half a second instead of a full second.
  const LIVE_REVIEWS_INTERVAL_MS = 500;
  const NON_REVIEW_RENDER_INTERVAL_MS = 5000;

  function shouldRenderGameContent(activeTab, lastRenderedAt, now) {
    // Every focused scoring-ruling category is refreshed on each completed
    // detail response so potential records and final verdicts stay current.
    // Larger play, drive, and statistics views keep the five-second cadence.
    if (['flags', 'challenges', 'replay', 'review', 'nullified', 'redzone', 'integrity']
      .indexOf(activeTab) >= 0) return true;
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
