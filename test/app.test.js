'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const sample = require('./fixtures/sample.json');

function classList() {
  const names = {};
  return {
    add: function (name) { names[name] = true; },
    remove: function (name) { delete names[name]; },
    contains: function (name) { return !!names[name]; },
    toggle: function (name, force) {
      if (force === undefined) force = !names[name];
      if (force) names[name] = true;
      else delete names[name];
      return !!force;
    }
  };
}

function element() {
  let html = '';
  let htmlWrites = 0;
  const listeners = {};
  return {
    classList: classList(),
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; htmlWrites += 1; },
    innerHTMLWrites: function () { return htmlWrites; },
    textContent: '',
    addEventListener: function (type, callback) { listeners[type] = callback; },
    dispatch: function (type, event) {
      if (listeners[type]) listeners[type](event);
    },
    querySelector: function () { return null; }
  };
}

function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

async function run() {
  const ids = [
    'prev-day', 'next-day', 'today-btn', 'back-btn', 'prev-game', 'next-game',
    'scoreboard-view', 'game-view', 'day-booth', 'date-label', 'week-label',
    'live-indicator', 'game-header', 'game-content', 'game-pos', 'tabs'
  ];
  const elements = {};
  ids.forEach(function (id) { elements[id] = element(); });
  elements['game-view'].classList.add('hidden');
  elements['day-booth'].classList.add('hidden');

  const documentListeners = {};
  const timers = [];
  const fetches = [];
  const fetchOptions = [];
  const pendingSummaries = [];
  let holdSummaries = false;

  const liveEvent = JSON.parse(JSON.stringify(sample.event));
  const competition = liveEvent.competitions[0];
  competition.status.type.state = 'in';
  competition.status.type.completed = false;
  competition.status.type.shortDetail = 'Q2 10:00';
  competition.status.displayClock = '10:00';
  competition.status.period = 2;
  competition.situation = {
    lastPlay: {
      id: '4018732869005',
      sequenceNumber: '8400',
      text: 'Play under review.',
      type: { text: 'Pass Reception' },
      period: { number: 2 },
      clock: { displayValue: '10:00' }
    }
  };

  // A second game for the multi-game-day scenario near the end of this file:
  // another live game (cloned shape, new id/teams) whose summary carries one
  // red-zone booth event and one from farther out, so the all-games Red zone
  // filter can be checked across EVERY game of the day.
  const secondEvent = JSON.parse(JSON.stringify(liveEvent));
  secondEvent.id = '299001001';
  secondEvent.name = 'San Francisco 49ers at Los Angeles Chargers';
  secondEvent.shortName = 'SF @ LAC';
  const secondKickoff = new Date(new Date(liveEvent.date).getTime() + 4 * 3600 * 1000);
  secondEvent.date = secondKickoff.toISOString();
  secondEvent.competitions[0].date = secondKickoff.toISOString();
  secondEvent.competitions[0].competitors.forEach(function (c) {
    c.records = [];
    c.score = '0';
    if (c.homeAway === 'away') {
      c.team.abbreviation = 'SF';
      c.team.displayName = 'San Francisco 49ers';
      c.team.shortDisplayName = '49ers';
      c.team.location = 'San Francisco';
      c.team.name = '49ers';
      c.team.color = 'aa0000';
      c.team.logo = '';
    } else {
      c.team.abbreviation = 'LAC';
      c.team.displayName = 'Los Angeles Chargers';
      c.team.shortDisplayName = 'Chargers';
      c.team.location = 'Los Angeles';
      c.team.name = 'Chargers';
      c.team.color = '0080c6';
      c.team.logo = '';
    }
  });
  secondEvent.competitions[0].status.type.state = 'in';
  secondEvent.competitions[0].status.type.shortDetail = 'Q1 9:15';
  secondEvent.competitions[0].status.displayClock = '9:15';
  secondEvent.competitions[0].status.period = 1;
  // Neutral non-booth last play: nothing is added to this game's booth feed.
  secondEvent.competitions[0].situation = {
    lastPlay: {
      id: '2990010019001',
      sequenceNumber: '900',
      text: 'B.Purdy up the middle for 2 yards.',
      type: { text: 'Rush' },
      period: { number: 1 },
      clock: { displayValue: '9:15' },
      start: { yardsToEndzone: 58, downDistanceText: '2nd & 8 at LAC 42' }
    }
  };
  const secondSummary = {
    drives: {
      previous: [{
        id: 'g2-drive-1',
        description: 'fixture: second game drive',
        team: { abbreviation: 'SF', displayName: 'San Francisco 49ers', logos: [] },
        plays: [
          {
            // Red zone: 12 yards to the goal line (<= NFLMap.RED_ZONE_DISTANCE).
            id: 'g2rz1', sequenceNumber: '100', type: { text: 'Pass Reception' },
            text: 'San Francisco challenged the catch ruling, and the play was Upheld.',
            awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false,
            period: { number: 1 }, clock: { displayValue: '9:15' },
            start: { yardsToEndzone: 12, downDistanceText: '1st & 10 at LAC 12' }
          },
          {
            // Midfield: outside the red zone.
            id: 'g2p1', sequenceNumber: '110', type: { text: 'Penalty' },
            text: 'PENALTY on SF-T.Williams, False Start, 5 yards, enforced at SF 47 - No Play.',
            awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: true,
            penalty: { yards: 5, type: { text: 'False Start' } },
            period: { number: 1 }, clock: { displayValue: '9:00' },
            start: { yardsToEndzone: 53, downDistanceText: '1st & 10 at SF 47' }
          }
        ]
      }]
    }
  };
  // The day after state.date is when the two-game scoreboard is served.
  const nextDayYmd = (function () {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return '' + d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
  })();

  const summary = JSON.parse(JSON.stringify(sample.summary));
  summary.header = { competitions: [{ situation: competition.situation }] };
  // Add an API-shaped reversed-TD sequence so the booth smoke test also
  // exercises the new before/during/after + points-removed rendering.
  summary.drives.previous.push({
    id: 'reversed-td-drive',
    description: 'fixture: reversed touchdown',
    result: 'No Play',
    displayResult: 'No Play',
    isScore: false,
    team: { abbreviation: 'HOU', displayName: 'Houston Texans', logos: [] },
    plays: [
      {
        id: 'rev-1', sequenceNumber: '1000', type: { text: 'Rush' },
        text: 'J.Banks 2 yard run, TOUCHDOWN.', awayScore: 0, homeScore: 7,
        scoringPlay: true, isPenalty: false
      },
      {
        id: 'rev-2', sequenceNumber: '1100', type: { text: 'Pass Reception' },
        text: 'Play under review.', awayScore: 0, homeScore: 7,
        scoringPlay: false, isPenalty: false
      },
      {
        id: 'rev-3', sequenceNumber: '1200', type: { text: 'Replay Review' },
        text: 'The replay official reviewed the ruling, and the play was REVERSED. Runner short of the goal line.',
        awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false
      },
      {
        id: 'rev-4', sequenceNumber: '1300', type: { text: 'Rush' },
        text: 'J.Banks left tackle for no gain.', awayScore: 0, homeScore: 0,
        scoringPlay: false, isPenalty: false
      }
    ]
  });
  // A still-pending review of a ruled touchdown: exactly the live moment the
  // points-at-risk highlight exists for. High sequence numbers keep it the
  // game's newest booth entry (card badge); its running score continues from
  // the fixture's Q4 plays (16-20) so the touchdown really adds points.
  summary.drives.previous.push({
    id: 'atrisk-td-drive',
    description: 'fixture: touchdown under review (pending)',
    result: 'No Play',
    displayResult: 'No Play',
    isScore: false,
    team: { abbreviation: 'LV', displayName: 'Las Vegas Raiders', logos: [] },
    plays: [
      {
        id: 'risk-1', sequenceNumber: '9000000', type: { text: 'Rush' },
        text: 'D.Carter 3 yard run, TOUCHDOWN.', awayScore: 23, homeScore: 20,
        scoringPlay: true, isPenalty: false
      },
      {
        id: 'risk-2', sequenceNumber: '9000100', type: { text: 'Pass Reception' },
        text: 'Play under review.', awayScore: 23, homeScore: 20,
        scoringPlay: false, isPenalty: false
      }
    ]
  });

  // Minimal Web Audio stand-in so the smoke test can verify the booth sound
  // button reaches the same buzz code path the alert system uses.
  const audio = { oscillatorCount: 0 };
  function fakeOscillator() {
    audio.oscillatorCount += 1;
    return {
      type: '',
      frequency: {
        setValueAtTime: function () {},
        linearRampToValueAtTime: function () {}
      },
      connect: function () {},
      start: function () {},
      stop: function () {}
    };
  }
  function fakeGain() {
    return {
      gain: {
        setValueAtTime: function () {},
        linearRampToValueAtTime: function () {}
      },
      connect: function () {}
    };
  }
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    resume() { return Promise.resolve(); }
    createOscillator() { return fakeOscillator(); }
    createGain() { return fakeGain(); }
  }

  function response(json) {
    return { ok: true, status: 200, json: function () { return Promise.resolve(json); } };
  }

  const document = {
    readyState: 'complete',
    visibilityState: 'visible',
    getElementById: function (id) { return elements[id] || null; },
    querySelectorAll: function () { return []; },
    addEventListener: function (type, callback) { documentListeners[type] = callback; }
  };

  const context = {
    console: console,
    document: document,
    AudioContext: FakeAudioContext,
    fetch: function (url, options) {
      fetches.push(url);
      fetchOptions.push(options);
      if (url.indexOf('/scoreboard') !== -1) {
        // Only the next day serves the two-game scoreboard; every other day
        // keeps the original single-game scenario above.
        if (url.indexOf('dates=' + nextDayYmd) !== -1) {
          return Promise.resolve(response({ events: [liveEvent, secondEvent], leagues: [] }));
        }
        return Promise.resolve(response({ events: [liveEvent], leagues: [] }));
      }
      if (url.indexOf('/summary') !== -1) {
        const payload = url.indexOf('event=299001001') !== -1 ? secondSummary : summary;
        if (!holdSummaries) return Promise.resolve(response(payload));
        return new Promise(function (resolve) {
          pendingSummaries.push(function () { resolve(response(payload)); });
        });
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    },
    setInterval: function (callback, ms) {
      const timer = { callback: callback, ms: ms };
      timers.push(timer);
      return timer;
    },
    clearInterval: function () {},
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    Promise: Promise,
    encodeURIComponent: encodeURIComponent
  };
  context.self = context;
  vm.createContext(context);

  ['lib/mapping.js', 'lib/refresh.js', 'app.js'].forEach(function (file) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  });
  await flush();
  await flush();

  assert.deepStrictEqual(timers.map(function (timer) { return timer.ms; }), [15000, 1000]);
  assert.strictEqual(fetches.filter(function (url) { return url.indexOf('/scoreboard') !== -1; }).length, 1);
  assert.strictEqual(fetches.filter(function (url) { return url.indexOf('/summary') !== -1; }).length, 1);
  assert.ok(fetchOptions.every(function (options) { return options && options.cache === 'no-store'; }));
  assert.ok(elements['day-booth'].innerHTML.indexOf('Play under review.') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('1s live polling schedule') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('booth-state') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('bsh-label') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('Score') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('booth-state removed') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('badge removed') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('booth-note') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('Banks 2 yard run, TOUCHDOWN') !== -1);
  // The fixture's red-zone false start (HOU 19) carries the RZ badge in the
  // day feed; its non-red-zone counterpart (LV 25) does not.
  assert.ok(elements['day-booth'].innerHTML.indexOf('badge rz') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('enforced at HST 19') !== -1);
  // Points at risk: the pending review of the ruled touchdown is highlighted
  // in the day feed, names the score it could wipe and its scoring play, is
  // filterable, and is badged on the game card.
  assert.ok(elements['day-booth'].innerHTML.indexOf('badge atrisk') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('LV 7 PTS AT RISK') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('D.Carter 3 yard run, TOUCHDOWN.') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('data-day-filter="risk"') !== -1);
  // The all-games booth also exposes the per-game Red Zone cut as a filter
  // chip. The feed currently holds exactly one red-zone booth event (the
  // false start enforced at HST 19), so the chip counts it.
  assert.ok(elements['day-booth'].innerHTML.indexOf('data-day-filter="redzone"') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('Red zone · 1') !== -1);
  assert.ok(elements['scoreboard-view'].innerHTML.indexOf('PTS AT RISK') !== -1);
  const scoreboardWritesBeforeResolution = elements['scoreboard-view'].innerHTMLWrites();

  // Two review ticks while one detail request is pending still create one fetch.
  holdSummaries = true;
  timers[1].callback();
  timers[1].callback();
  assert.strictEqual(fetches.filter(function (url) { return url.indexOf('/summary') !== -1; }).length, 2);
  assert.strictEqual(pendingSummaries.length, 1);
  assert.strictEqual(elements['scoreboard-view'].innerHTMLWrites(), scoreboardWritesBeforeResolution);
  summary.header.competitions[0].situation = {
    lastPlay: {
      id: '4018732869005',
      sequenceNumber: '8400',
      text: 'The replay official reviewed the ruling, and the play was REVERSED.',
      type: { text: 'Replay Review' },
      period: { number: 2 },
      clock: { displayValue: '10:00' }
    }
  };
  pendingSummaries.shift()();
  await flush();
  await flush();
  assert.ok(elements['day-booth'].innerHTML.indexOf('play was REVERSED') !== -1);
  assert.strictEqual(elements['scoreboard-view'].innerHTMLWrites(),
    scoreboardWritesBeforeResolution + 1); // REVIEW badge was removed

  // Returning to a visible tab requests both streams immediately.
  assert.strictEqual(typeof documentListeners.visibilitychange, 'function');
  const scoresBefore = fetches.filter(function (url) { return url.indexOf('/scoreboard') !== -1; }).length;
  const summariesBefore = fetches.filter(function (url) { return url.indexOf('/summary') !== -1; }).length;
  documentListeners.visibilitychange();
  assert.strictEqual(fetches.filter(function (url) { return url.indexOf('/scoreboard') !== -1; }).length,
    scoresBefore + 1);
  assert.strictEqual(fetches.filter(function (url) { return url.indexOf('/summary') !== -1; }).length,
    summariesBefore + 1);
  pendingSummaries.shift()();
  await flush();

  // A live-to-final transition gets one final snapshot, then uses that cache.
  competition.status.type.state = 'post';
  competition.status.type.completed = true;
  competition.status.type.shortDetail = 'Final';
  timers[0].callback();
  await flush();
  await flush();
  const beforeFinal = fetches.filter(function (url) { return url.indexOf('/summary') !== -1; }).length;
  timers[1].callback();
  assert.strictEqual(fetches.filter(function (url) { return url.indexOf('/summary') !== -1; }).length,
    beforeFinal + 1);
  pendingSummaries.shift()();
  await flush();
  await flush();
  const dayWritesAfterFinal = elements['day-booth'].innerHTMLWrites();
  timers[1].callback();
  assert.strictEqual(fetches.filter(function (url) { return url.indexOf('/summary') !== -1; }).length,
    beforeFinal + 1);
  assert.strictEqual(elements['day-booth'].innerHTMLWrites(), dayWritesAfterFinal);
  assert.ok(fetchOptions.every(function (options) { return options && options.cache === 'no-store'; }));

  // Booth sound button: renders in the all-games booth, defaults ON, and
  // clicking it toggles the label and plays the same alert buzz.
  function clickSoundButton() {
    elements['day-booth'].dispatch('click', {
      target: {
        closest: function (selector) {
          return selector === '.day-sound-btn' ? {} : null;
        }
      }
    });
  }
  assert.ok(elements['day-booth'].innerHTML.indexOf('day-sound-btn') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('&#128276; Sound On') !== -1);
  assert.strictEqual(audio.oscillatorCount, 0, 'no audio before the sound button is used');
  clickSoundButton();
  await flush();
  assert.strictEqual(elements['day-booth'].innerHTML.indexOf('&#128263; Sound Off') !== -1, true);
  assert.ok(audio.oscillatorCount > 0, 'clicking the sound button plays the alert buzz');
  clickSoundButton();
  await flush();
  assert.ok(elements['day-booth'].innerHTML.indexOf('&#128276; Sound On') !== -1);
  assert.ok(audio.oscillatorCount > 1, 're-enabling the sound plays the preview buzz again');

  // A newly discovered flag right after a fresh touchdown is at risk and —
  // unlike ordinary penalties — plays the alert buzz. (The game flips back
  // to live for this: one scoreboard tick re-reads its status, and the next
  // booth tick re-fetches its detail, resetting the cached final flag.)
  competition.status.type.state = 'in';
  competition.status.type.completed = false;
  timers[0].callback(); // scoreboard refresh re-summarizes the game as live
  await flush();
  await flush();
  const oscillatorsBeforeRisk = audio.oscillatorCount;
  summary.drives.previous.push({
    id: 'atrisk-penalty-drive',
    description: 'fixture: flag after a touchdown',
    result: 'No Play',
    displayResult: 'No Play',
    isScore: false,
    team: { abbreviation: 'LV', displayName: 'Las Vegas Raiders', logos: [] },
    plays: [
      {
        id: 'riskp-1', sequenceNumber: '9500000', type: { text: 'Rush' },
        text: 'A.Okafor left end for 4 yards, TOUCHDOWN.', awayScore: 30, homeScore: 20,
        scoringPlay: true, isPenalty: false
      },
      {
        id: 'riskp-2', sequenceNumber: '9500100', type: { text: 'Penalty' },
        text: 'PENALTY on LV-R.Jones, Offensive Holding, 10 yards, enforced at LV 16 - No Play.',
        awayScore: 30, homeScore: 20,
        scoringPlay: false, isPenalty: true,
        penalty: { yards: 10, type: { text: 'Offensive Holding' } }
      }
    ]
  });
  timers[1].callback();
  assert.strictEqual(pendingSummaries.length, 1);
  pendingSummaries.shift()();
  await flush();
  await flush();
  assert.ok(elements['day-booth'].innerHTML.indexOf('R.Jones') !== -1);
  assert.ok(elements['day-booth'].innerHTML.indexOf('badge atrisk') !== -1);
  assert.ok(audio.oscillatorCount > oscillatorsBeforeRisk,
    'an at-risk penalty plays the alert buzz');

  // The all-games booth's Red zone filter: the per-game Red Zone tab cut
  // applied across the whole day feed — only booth events whose play started
  // in the opponent's 20 or inside remain.
  function clickDayFilter(value) {
    elements['day-booth'].dispatch('click', {
      target: {
        closest: function (selector) {
          if (selector === '.day-sound-btn') return null;
          if (selector === '.day-filter') {
            return { getAttribute: function () { return value; } };
          }
          return null;
        }
      }
    });
  }
  clickDayFilter('redzone');
  const dayRz = elements['day-booth'].innerHTML;
  assert.ok(dayRz.indexOf(
    'class="booth-filter day-filter active" data-day-filter="redzone"') !== -1);
  // The red-zone false start (enforced at HST 19) remains…
  assert.ok(dayRz.indexOf('enforced at HST 19') !== -1);
  // …while every booth event from farther out is hidden: the LV 25 false
  // start, the HOU challenge, and the under-review entries.
  assert.ok(dayRz.indexOf('enforced at LV 25') === -1);
  assert.ok(dayRz.indexOf('Houston challenged') === -1);
  assert.ok(dayRz.indexOf('Play under review') === -1);

  // Clicking a message while the Red zone filter is active opens that game
  // straight into its own Red Zone tab.
  elements['day-booth'].dispatch('click', {
    target: {
      closest: function (selector) {
        if (selector === '.day-sound-btn' || selector === '.day-filter') return null;
        if (selector === '.day-msg') {
          return { getAttribute: function () { return '401873286'; } };
        }
        return null;
      }
    }
  });
  assert.strictEqual(elements['game-view'].classList.contains('hidden'), false);
  assert.ok(elements['tabs'].innerHTML.indexOf(
    'class="tab active" data-tab="redzone"') !== -1);
  assert.strictEqual(pendingSummaries.length, 1,
    'opening the game from a day-booth message requests its detail');
  pendingSummaries.shift()();
  await flush();
  await flush();
  elements['back-btn'].dispatch('click', {});
  assert.strictEqual(elements['game-view'].classList.contains('hidden'), true);

  // Switching back to All restores the full day feed.
  clickDayFilter('all');
  assert.ok(elements['day-booth'].innerHTML.indexOf('enforced at LV 25') !== -1);

  // Open the game from the scoreboard card and switch to the Red Zone tab.
  // holdSummaries is still on, so the detail request parks in pendingSummaries.
  elements['scoreboard-view'].dispatch('click', {
    target: {
      closest: function (selector) {
        if (selector === '.day-chip') return null;
        if (selector === '.game-card') {
          return { getAttribute: function () { return '401873286'; } };
        }
        return null;
      }
    }
  });
  assert.strictEqual(pendingSummaries.length, 1, 'opening the game requests its detail');
  pendingSummaries.shift()();
  await flush();
  await flush();
  assert.strictEqual(elements['game-view'].classList.contains('hidden'), false);
  assert.strictEqual(elements['game-content'].innerHTML.indexOf('Loading game data'), -1);

  elements['tabs'].dispatch('click', {
    target: {
      closest: function (selector) {
        return selector === '.tab'
          ? { getAttribute: function () { return 'redzone'; } }
          : null;
      }
    }
  });
  const rzHTML = elements['game-content'].innerHTML;
  assert.ok(rzHTML.indexOf('Red zone flags, challenges &amp; replay reviews') !== -1);
  // The red-zone false start (HOU 19) is shown, with its RZ badge.
  assert.ok(rzHTML.indexOf('enforced at HST 19') !== -1);
  assert.ok(rzHTML.indexOf('badge rz') !== -1);
  // Non-red-zone booth events are excluded: the LV 25 false start, the HOU 34
  // replay/review entries, and the live under-review play (no position data).
  assert.ok(rzHTML.indexOf('enforced at LV 25') === -1);
  assert.ok(rzHTML.indexOf('Play under review') === -1);
  assert.ok(rzHTML.indexOf('data-redzone-filter') !== -1);

  // The red zone filter buttons are wired through the delegated handler.
  elements['game-content'].dispatch('click', {
    target: {
      closest: function (selector) {
        if (selector !== '.booth-filter') return null;
        return {
          getAttribute: function (attr) {
            return attr === 'data-redzone-filter' ? 'penalty' : null;
          }
        };
      }
    }
  });
  assert.ok(elements['game-content'].innerHTML.indexOf(
    'class="booth-filter active" data-redzone-filter="penalty"') !== -1);

  // --- Multi-game day: the Red zone filter cuts EVERY game of the day -----
  // The next day serves two live games: LV @ HOU (one red-zone booth event,
  // the false start enforced at HST 19) and SF @ LAC (one red-zone challenge
  // at the LAC 12, plus one midfield flag). holdSummaries is off again, so
  // every request resolves on its own.
  holdSummaries = false;
  elements['next-day'].dispatch('click', {});
  await flush();
  await flush();
  await flush();

  // Both games rendered, and the day feed merged both games' booth events.
  const twoGameDay = elements['day-booth'].innerHTML;
  assert.ok(elements['scoreboard-view'].innerHTML.indexOf('data-id="299001001"') !== -1);
  assert.ok(twoGameDay.indexOf('enforced at HST 19') !== -1);   // game A, red zone
  assert.ok(twoGameDay.indexOf('catch ruling') !== -1);         // game B, red zone
  assert.ok(twoGameDay.indexOf('enforced at SF 47') !== -1);    // game B, midfield
  // The Red zone chip counts red-zone events from EACH game: 1 + 1.
  assert.ok(twoGameDay.indexOf('Red zone · 2') !== -1);

  clickDayFilter('redzone');
  const twoGameRz = elements['day-booth'].innerHTML;
  assert.ok(twoGameRz.indexOf(
    'class="booth-filter day-filter active" data-day-filter="redzone"') !== -1);
  // The red zone events of BOTH games are kept…
  assert.ok(twoGameRz.indexOf('enforced at HST 19') !== -1);
  assert.ok(twoGameRz.indexOf('catch ruling') !== -1);
  assert.ok(twoGameRz.indexOf('SF @ LAC') !== -1);
  // …and everything farther out is hidden, whichever game it came from.
  assert.ok(twoGameRz.indexOf('enforced at SF 47') === -1);
  assert.ok(twoGameRz.indexOf('enforced at LV 25') === -1);
  assert.ok(twoGameRz.indexOf('Play under review') === -1);

  // Clicking the second game's filtered message opens that game's own
  // Red Zone tab, which shows the same cut for its game.
  elements['day-booth'].dispatch('click', {
    target: {
      closest: function (selector) {
        if (selector === '.day-sound-btn' || selector === '.day-filter') return null;
        if (selector === '.day-msg') {
          return { getAttribute: function () { return '299001001'; } };
        }
        return null;
      }
    }
  });
  await flush();
  await flush();
  await flush();
  assert.strictEqual(elements['game-view'].classList.contains('hidden'), false);
  assert.strictEqual(elements['game-pos'].textContent, '2 of 2');
  assert.ok(elements['tabs'].innerHTML.indexOf(
    'class="tab active" data-tab="redzone"') !== -1);
  const secondGameRz = elements['game-content'].innerHTML;
  assert.ok(secondGameRz.indexOf('Red zone flags, challenges &amp; replay reviews') !== -1);
  assert.ok(secondGameRz.indexOf('catch ruling') !== -1);
  assert.ok(secondGameRz.indexOf('badge rz') !== -1);
  assert.ok(secondGameRz.indexOf('enforced at SF 47') === -1);

  // Leave the day booth in its default state for tidiness.
  elements['back-btn'].dispatch('click', {});
  clickDayFilter('all');
  assert.ok(elements['day-booth'].innerHTML.indexOf('enforced at SF 47') !== -1);

  console.log('NFL scoreboard app smoke test');
  console.log('  ✓ live details use the 1-second timer');
  console.log('  ✓ overlapping detail requests are deduplicated');
  console.log('  ✓ a changed review result replaces the pending message and badge');
  console.log('  ✓ unchanged review ticks avoid redundant scoreboard renders');
  console.log('  ✓ visible-tab return refreshes scores and reviews immediately');
  console.log('  ✓ score and detail requests bypass the browser HTTP cache');
  console.log('  ✓ a live-to-final transition fetches one final detail snapshot');
  console.log('  ✓ idle final-game ticks do not rebuild an unchanged booth feed');
  console.log('  ✓ live review content renders from the supplied API-shaped payload');
  console.log('  ✓ the booth sound button toggles and plays the alert buzz');
  console.log('  ✓ a pending review of a touchdown is badged POINTS AT RISK in feed and card');
  console.log('  ✓ a newly appearing at-risk penalty triggers the alert buzz');
  console.log('  ✓ red-zone booth events carry the RZ badge in the all-games feed');
  console.log('  ✓ the all-games booth has the Red zone filter (chip, count, cut, click-through)');
  console.log('  ✓ the Red Zone tab shows only red-zone flags/reviews, with working filters');
  console.log('  ✓ a two-game day counts and filters red-zone events from EACH game');
}

run().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
