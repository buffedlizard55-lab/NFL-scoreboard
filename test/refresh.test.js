'use strict';

const assert = require('assert');
const NFLRefresh = require('../lib/refresh.js');

let pass = 0;
function ok(name, fn) {
  fn();
  pass += 1;
  console.log('  ✓ ' + name);
}

function harness(visible) {
  const scheduled = [];
  const cleared = [];
  let scoreCalls = 0;
  let reviewCalls = 0;
  const polling = NFLRefresh.start({
    refreshScoreboard: function () { scoreCalls += 1; },
    refreshReviews: function () { reviewCalls += 1; },
    isVisible: function () { return visible.value; },
    setInterval: function (callback, ms) {
      const timer = { callback: callback, ms: ms, id: scheduled.length + 1 };
      scheduled.push(timer);
      return timer;
    },
    clearInterval: function (timer) { cleared.push(timer); }
  });
  return {
    polling: polling,
    scheduled: scheduled,
    cleared: cleared,
    scoreCalls: function () { return scoreCalls; },
    reviewCalls: function () { return reviewCalls; }
  };
}

console.log('NFLRefresh polling tests');

ok('exports the documented 15-second score and 1-second review cadences', function () {
  assert.strictEqual(NFLRefresh.SCOREBOARD_INTERVAL_MS, 15000);
  assert.strictEqual(NFLRefresh.LIVE_REVIEWS_INTERVAL_MS, 1000);
});

ok('renders booth responses immediately while limiting non-review DOM paints to 5 seconds', function () {
  assert.strictEqual(NFLRefresh.NON_REVIEW_RENDER_INTERVAL_MS, 5000);
  assert.strictEqual(NFLRefresh.shouldRenderGameContent('booth', 10000, 10001), true);
  assert.strictEqual(NFLRefresh.shouldRenderGameContent('plays', 10000, 14999), false);
  assert.strictEqual(NFLRefresh.shouldRenderGameContent('players', 10000, 15000), true);
  assert.strictEqual(NFLRefresh.shouldRenderGameContent('team', 0, 10000), true);
});

ok('schedules score and review callbacks independently', function () {
  const h = harness({ value: true });
  assert.strictEqual(h.scheduled.length, 2);
  assert.deepStrictEqual(h.scheduled.map(function (timer) { return timer.ms; }), [15000, 1000]);

  h.scheduled[0].callback();
  assert.strictEqual(h.scoreCalls(), 1);
  assert.strictEqual(h.reviewCalls(), 0);

  h.scheduled[1].callback();
  assert.strictEqual(h.scoreCalls(), 1);
  assert.strictEqual(h.reviewCalls(), 1);
  h.polling.stop();
});

ok('does not poll while hidden and refreshes both streams on demand when visible', function () {
  const visible = { value: false };
  const h = harness(visible);

  h.scheduled.forEach(function (timer) { timer.callback(); });
  h.polling.refreshNow();
  assert.strictEqual(h.scoreCalls(), 0);
  assert.strictEqual(h.reviewCalls(), 0);

  visible.value = true;
  h.polling.refreshNow();
  assert.strictEqual(h.scoreCalls(), 1);
  assert.strictEqual(h.reviewCalls(), 1);
  h.polling.stop();
});

ok('stop clears both timers exactly once', function () {
  const h = harness({ value: true });
  h.polling.stop();
  h.polling.stop();
  assert.deepStrictEqual(h.cleared, h.scheduled);
});

ok('requires both refresh callbacks', function () {
  assert.throws(function () {
    NFLRefresh.start({ refreshReviews: function () {} });
  }, /refreshScoreboard/);
  assert.throws(function () {
    NFLRefresh.start({ refreshScoreboard: function () {} });
  }, /refreshReviews/);
});

console.log('\nAll ' + pass + ' polling tests passed ✓');
