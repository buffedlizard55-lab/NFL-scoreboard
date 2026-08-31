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
  const pendingHeaders = [];
  let holdHeaders = false;

  const liveEvent = JSON.parse(JSON.stringify(sample.event));
  const competition = liveEvent.competitions[0];
  competition.status.type.state = 'in';
  competition.status.type.completed = false;
  competition.status.type.shortDetail = 'Q2 10:00';
  competition.status.displayClock = '10:00';
  competition.status.period = 2;
  // This starts as a scoring review. The fixture later changes this same
  // source play id to a reversal, exercising the pending -> nullified alert
  // transition without inventing a second notification identity.
  competition.situation = {
    lastPlay: {
      id: 'rev-2',
      sequenceNumber: '9100100',
      text: 'Play under review.',
      type: { text: 'Pass Reception' },
      awayScore: 0,
      homeScore: 7,
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
            // Red zone AND nullified: a touchdown wiped by an accepted foul,
            // in ESPN's published wording. This is what the all-games Red
            // zone chip counts for this game.
            id: 'g2rz2', sequenceNumber: '105', type: { text: 'Penalty' },
            text: 'B.Purdy pass short left to G.Kittle for 9 yards, TOUCHDOWN NULLIFIED by ' +
              'Penalty.PENALTY on SF-C.McCaffrey, Offensive Pass Interference, 10 yards, ' +
              'enforced at LAC 9 - No Play.',
            awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: true,
            penalty: { yards: 10, type: { text: 'Offensive Pass Interference' } },
            period: { number: 1 }, clock: { displayValue: '9:10' },
            start: { yardsToEndzone: 9, downDistanceText: '1st & Goal at LAC 9' }
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
  // The real summary endpoint's header competition contains the same score
  // and status fields used by the scoreboard. Keep this API-shaped fixture
  // linked to the live scoreboard competition so detail-response hydration is
  // exercised alongside the one-second booth refresh.
  summary.header = { competitions: [competition] };
  // Add an API-shaped TD-under-review sequence. The same review row is
  // changed to a reversal later, so the smoke test covers an evidence-based
  // pending -> nullified transition.
  summary.drives.previous.push({
    id: 'reversed-td-drive',
    description: 'fixture: reversed touchdown',
    result: 'No Play',
    displayResult: 'No Play',
    isScore: false,
    team: { abbreviation: 'HOU', displayName: 'Houston Texans', logos: [] },
    plays: [
      {
        id: 'rev-1', sequenceNumber: '9100000', type: { text: 'Rush' },
        text: 'J.Banks 2 yard run, TOUCHDOWN.', awayScore: 0, homeScore: 7,
        scoringPlay: true, isPenalty: false
      },
      {
        id: 'rev-2', sequenceNumber: '9100100', type: { text: 'Pass Reception' },
        text: 'Play under review.', awayScore: 0, homeScore: 7,
        scoringPlay: false, isPenalty: false
      },
    ]
  });
  // A touchdown wiped out by an accepted foul, in ESPN's published wording
  // (cf. Super Bowl LIX: "...TOUCHDOWN NULLIFIED by Penalty.PENALTY on
  // KC-J.Smith-Schuster, Offensive Pass Interference, 10 yards, enforced at
  // PHI 4 - No Play."). ESPN never counts these points, so the running score
  // never moves — the wording is the only signal. High sequence numbers keep
  // it the game's newest booth entry (which drives the card badge), and it
  // carries no position data so it stays out of the red-zone cut.
  summary.drives.previous.push({
    id: 'nullified-td-drive',
    description: 'fixture: touchdown nullified by penalty',
    result: 'No Play',
    displayResult: 'No Play',
    isScore: false,
    team: { abbreviation: 'LV', displayName: 'Las Vegas Raiders', logos: [] },
    plays: [
      {
        id: 'null-1', sequenceNumber: '9000000', type: { text: 'Rush' },
        text: 'W.Marks left end for 6 yards.', awayScore: 16, homeScore: 20,
        scoringPlay: false, isPenalty: false
      },
      {
        id: 'null-2', sequenceNumber: '9000100', type: { text: 'Penalty' },
        text: 'D.Carter 3 yard run, TOUCHDOWN NULLIFIED by Penalty.PENALTY on ' +
          'LV-D.Parham, Offensive Holding, 10 yards, enforced at HST 3 - No Play.',
        awayScore: 16, homeScore: 20,
        scoringPlay: false, isPenalty: true,
        penalty: { yards: 10, type: { text: 'Offensive Holding' } }
      }
    ]
  });

  // Minimal Web Audio stand-in so the smoke test can verify the booth sound
  // button reaches the same rain-alert code path the alert system uses. The
  // alert plays a noise-buffer "rain bed" plus sine-oscillator "droplets",
  // so both node types are counted.
  const audio = { oscillatorCount: 0, noiseSourceCount: 0 };
  const notifications = [];
  function FakeNotification(title, options) {
    notifications.push({ title: title, options: options });
  }
  FakeNotification.permission = 'granted';
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
  function fakeBufferSource() {
    audio.noiseSourceCount += 1;
    return {
      buffer: null,
      connect: function () {},
      start: function () {},
      stop: function () {}
    };
  }
  function fakeBiquadFilter() {
    return {
      type: '',
      frequency: {
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
      this.sampleRate = 44100;
      this.destination = {};
    }
    resume() { return Promise.resolve(); }
    createOscillator() { return fakeOscillator(); }
    createGain() { return fakeGain(); }
    createBuffer(channels, frameCount) {
      const data = new Float32Array(frameCount);
      return { getChannelData: function () { return data; } };
    }
    createBufferSource() { return fakeBufferSource(); }
    createBiquadFilter() { return fakeBiquadFilter(); }
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
    Notification: FakeNotification,
    fetch: function (url, options) {
      fetches.push(url);
      fetchOptions.push(options);
      if (url.indexOf('/scoreboard/header') !== -1) {
        // Observed header-feed shape: event id, flat competitors, fullStatus,
        // situation and play-by-play availability. Keep it derived from the
        // existing live fixtures so every one-second tick is deterministic.
        function headerEvent(event) {
          const comp = event.competitions[0];
          return {
            id: event.id,
            competitors: comp.competitors.map(function (team) {
              return { homeAway: team.homeAway, score: team.score, winner: team.winner };
            }),
            fullStatus: {
              displayClock: comp.status.displayClock,
              period: comp.status.period,
              type: comp.status.type
            },
            situation: comp.situation,
            playByPlayAvailable: comp.playByPlayAvailable
          };
        }
        const payload = {
          sports: [{ leagues: [{ events: [headerEvent(liveEvent), headerEvent(secondEvent)] }] }]
        };
        if (!holdHeaders) return Promise.resolve(response(payload));
        return new Promise(function (resolve) {
          pendingHeaders.push(function () { resolve(response(payload)); });
        });
      }
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
        return Promise.resolve(response(payload));
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

  async function settle(times) {
    for (let i = 0; i < (times || 3); i += 1) await flush();
  }

  function clickGameCard(id) {
    elements['scoreboard-view'].dispatch('click', {
      target: {
        closest: function (selector) {
          if (selector === '.day-chip') return null;
          if (selector === '.game-card') {
            return { getAttribute: function () { return id; } };
          }
          return null;
        }
      }
    });
  }

  function clickGameTab(tab) {
    elements.tabs.dispatch('click', {
      target: {
        closest: function (selector) {
          return selector === '.tab'
            ? { getAttribute: function () { return tab; } }
            : null;
        }
      }
    });
  }

  function clickDayTab(tab) {
    elements['day-booth'].dispatch('click', {
      target: {
        closest: function (selector) {
          if (selector === '.day-sound-btn') return null;
          if (selector === '.day-watch-tab') {
            return { getAttribute: function () { return tab; } };
          }
          return null;
        }
      }
    });
  }

  assert.deepStrictEqual(timers.map(function (timer) { return timer.ms; }), [15000, 150, 1000]);
  const liveScoreTimer = timers.find(function (timer) { return timer.ms === 150; });
  const reviewTimer = timers.find(function (timer) { return timer.ms === 1000; });
  assert.ok(liveScoreTimer && reviewTimer);
  assert.strictEqual(fetches.filter(function (url) {
    return url.indexOf('/sports/football/nfl/scoreboard') !== -1;
  }).length, 1);
  assert.strictEqual(fetches.filter(function (url) { return url.indexOf('/summary') !== -1; }).length, 1);
  assert.ok(fetchOptions.every(function (options) { return options && options.cache === 'no-store'; }));

  // The all-games panel is deliberately a live, confirmed-outcome stream.
  // The fixture contains both a scoring-linked pending review and confirmed
  // nullified touchdowns; only the latter may appear here.
  const initialWatch = elements['day-booth'].innerHTML;
  assert.ok(initialWatch.indexOf('Confirmed nullified scoring plays') !== -1);
  assert.ok(initialWatch.indexOf('LIVE PROVIDER: ESPN GAMECAST') !== -1);
  assert.ok(initialWatch.indexOf('Field verification &amp; limits') !== -1);
  assert.ok(initialWatch.indexOf('fast last-play header 0.15s attempted') !== -1);
  assert.ok(initialWatch.indexOf('TOUCHDOWN NULLIFIED by Penalty') !== -1);
  assert.ok(initialWatch.indexOf('data-day-tab="nullified"') !== -1);
  assert.ok(initialWatch.indexOf('data-day-tab="integrity"') !== -1);
  assert.ok(initialWatch.indexOf('data-day-filter') === -1,
    'the former mixed-status all-games filter is gone');
  assert.strictEqual(initialWatch.indexOf('Play under review.'), -1);
  assert.strictEqual(initialWatch.indexOf('>POTENTIAL<'), -1);
  assert.strictEqual(initialWatch.indexOf('>NO ROLLBACK<'), -1);
  assert.strictEqual(initialWatch.indexOf('>DATA CHECK<'), -1);
  assert.strictEqual(initialWatch.indexOf('enforced at HST 19'), -1,
    'unrelated flags do not leak into a scoring-nullification stream');
  assert.strictEqual(initialWatch.indexOf('enforced at LV 25'), -1);
  assert.ok(initialWatch.indexOf('data-ruling-tab="nullified"') !== -1);
  assert.ok(initialWatch.indexOf('data-ruling-tab="redzone"') !== -1,
    'red-zone nullifications retain a direct route to their own game view');
  assert.ok(elements['scoreboard-view'].innerHTML.indexOf('>NULLIFIED<') !== -1);
  assert.strictEqual(notifications.length, 0,
    'initial history and a pending source record never generate desktop notifications');

  // The all-games panel tracks every scoring-ruling category in its own tab.
  ['flags', 'challenges', 'replay', 'review', 'redzone', 'nullified', 'integrity']
    .forEach(function (id) {
      assert.ok(initialWatch.indexOf('data-day-tab="' + id + '"') !== -1,
        'all-games tab ' + id + ' is present');
    });

  // Each dedicated all-games category surfaces its scoring-linked records,
  // while the default live feed and the alert path stay nullified-only.
  clickDayTab('flags');
  let dayCategory = elements['day-booth'].innerHTML;
  assert.ok(dayCategory.indexOf('Scoring-linked flags · all games') !== -1);
  assert.ok(dayCategory.indexOf('TOUCHDOWN NULLIFIED by Penalty') !== -1);
  assert.ok(dayCategory.indexOf('>NULLIFIED<') !== -1,
    'a nullified flag is a confirmed outcome in the all-games flags panel');
  assert.strictEqual(dayCategory.indexOf('>POTENTIAL<'), -1,
    'a nullified flag is not left pending in its all-games category');

  clickDayTab('challenges');
  dayCategory = elements['day-booth'].innerHTML;
  assert.ok(dayCategory.indexOf('Scoring-linked challenges · all games') !== -1);
  assert.ok(dayCategory.indexOf('No scoring-linked challenges') !== -1,
    'an unrelated challenge is not promoted into the all-games scoring feed');

  clickDayTab('replay');
  dayCategory = elements['day-booth'].innerHTML;
  assert.ok(dayCategory.indexOf('Scoring-linked replay · all games') !== -1);
  assert.ok(dayCategory.indexOf('No scoring-linked replay') !== -1,
    'an unrelated replay is not promoted into the all-games scoring feed');

  clickDayTab('review');
  dayCategory = elements['day-booth'].innerHTML;
  assert.ok(dayCategory.indexOf('Scoring plays under review · all games') !== -1);
  assert.ok(dayCategory.indexOf('Play under review.') !== -1);
  assert.ok(dayCategory.indexOf('>POTENTIAL<') !== -1,
    'a pending scoring review is tracked in the all-games under-review panel');
  assert.strictEqual(dayCategory.indexOf('>NULLIFIED<'), -1,
    'a pending review is not presented as a confirmed outcome');
  assert.strictEqual(audio.oscillatorCount, 0,
    'tracking a pending review in the all-games panel plays no sound');

  clickDayTab('redzone');
  dayCategory = elements['day-booth'].innerHTML;
  assert.ok(dayCategory.indexOf('Red zone nullified scores · all games') !== -1);
  assert.ok(dayCategory.indexOf('enforced at HST 14') !== -1);
  assert.strictEqual(dayCategory.indexOf('enforced at HST 3'), -1,
    'the all-games red-zone panel keeps only red-zone nullifications');
  assert.strictEqual(dayCategory.indexOf('>POTENTIAL<'), -1);

  clickDayTab('nullified');
  dayCategory = elements['day-booth'].innerHTML;
  assert.ok(dayCategory.indexOf('Confirmed nullified scoring plays · all games') !== -1);
  assert.strictEqual(dayCategory.indexOf('>POTENTIAL<'), -1);
  assert.strictEqual(dayCategory.indexOf('Play under review.'), -1);
  assert.strictEqual(notifications.length, 0);

  // A changed header scoring-review candidate starts that game's full detail
  // reconciliation immediately; it does not wait for the one-second review
  // timer. An unrelated flag with cached context does not create extra load.
  const summariesBeforeFastCandidate = fetches.filter(function (url) {
    return url.indexOf('/summary') !== -1;
  }).length;
  liveScoreTimer.callback();
  await settle();
  assert.strictEqual(fetches.filter(function (url) {
    return url.indexOf('/summary') !== -1;
  }).length, summariesBeforeFastCandidate + 1,
  'a scoring-linked under-review header triggers targeted detail immediately');

  const summariesAfterFastCandidate = fetches.filter(function (url) {
    return url.indexOf('/summary') !== -1;
  }).length;
  // A substantive normal snap between the old scoring ruling and this flag
  // proves the flag has no causal scoring context.
  const ordinaryHeaderContext = {
    id: 'ordinary-header-context', plays: [{
      id: 'ordinary-header-context-play', sequenceNumber: '9199900',
      type: { text: 'Rush' }, text: 'A.Run for 2 yards.',
      awayScore: 0, homeScore: 7, scoringPlay: false, isPenalty: false
    }]
  };
  summary.drives.previous.push(ordinaryHeaderContext);
  const originalHeaderSituation = competition.situation;
  competition.situation = {
    lastPlay: {
      id: 'ordinary-header-flag', sequenceNumber: '9200000',
      text: 'PENALTY on LV-X.Player, False Start, 5 yards - No Play.',
      type: { text: 'Penalty' }, isPenalty: true, awayScore: 0, homeScore: 7,
      period: { number: 2 }, clock: { displayValue: '9:58' }
    }
  };
  liveScoreTimer.callback();
  await settle();
  assert.strictEqual(fetches.filter(function (url) {
    return url.indexOf('/summary') !== -1;
  }).length, summariesAfterFastCandidate,
  'an unrelated header flag does not bypass the normal all-games detail cadence');
  summary.drives.previous.splice(summary.drives.previous.indexOf(ordinaryHeaderContext), 1);

  const summariesBeforeFastScore = fetches.filter(function (url) {
    return url.indexOf('/summary') !== -1;
  }).length;
  competition.situation = {
    lastPlay: {
      id: 'fast-scoring-safety', sequenceNumber: '9300000',
      text: 'R.Runner is tackled in the end zone for a SAFETY.',
      type: { text: 'Safety' }, scoringPlay: true, awayScore: 0, homeScore: 9,
      period: { number: 2 }, clock: { displayValue: '9:42' }
    }
  };
  liveScoreTimer.callback();
  await settle();
  assert.strictEqual(fetches.filter(function (url) {
    return url.indexOf('/summary') !== -1;
  }).length, summariesBeforeFastScore + 1,
  'a provider scoring play (including a safety) also triggers immediate reconciliation');

  // The provider's compact header does not always set `scoringPlay: true` for a
  // touchdown / field goal / safety. A scoring play recognized from its own
  // text must still start targeted reconciliation so the linking penalty/
  // review context arrives one round trip sooner rather than on the next full
  // one-second detail cycle.
  const summariesBeforeFastText = fetches.filter(function (url) {
    return url.indexOf('/summary') !== -1;
  }).length;
  competition.situation = {
    lastPlay: {
      id: 'fast-text-scoring-td', sequenceNumber: '9400000',
      text: 'J.Banks 4 yard run, TOUCHDOWN.', type: { text: 'Rush' },
      awayScore: 0, homeScore: 14,
      period: { number: 2 }, clock: { displayValue: '9:38' }
      // Deliberately no `scoringPlay` flag; text is the only signal.
    }
  };
  liveScoreTimer.callback();
  await settle();
  assert.strictEqual(fetches.filter(function (url) {
    return url.indexOf('/summary') !== -1;
  }).length, summariesBeforeFastText + 1,
  'a header scoring play without an explicit scoring flag still triggers reconciliation from its text');

  // Score movement is also reconciled when a compact update temporarily lacks
  // a usable last-play object.
  const awayCompetitor = competition.competitors.find(function (team) {
    return team.homeAway === 'away';
  });
  const originalAwayScore = awayCompetitor.score;
  const summariesBeforeBareScore = fetches.filter(function (url) {
    return url.indexOf('/summary') !== -1;
  }).length;
  competition.situation = null;
  awayCompetitor.score = '2';
  liveScoreTimer.callback();
  await settle();
  assert.strictEqual(fetches.filter(function (url) {
    return url.indexOf('/summary') !== -1;
  }).length, summariesBeforeBareScore + 1,
  'a header score change without last-play context triggers immediate reconciliation');
  awayCompetitor.score = originalAwayScore;
  competition.situation = originalHeaderSituation;

  // Each scoring-linked ruling classification has an independent game tab.
  // First open the game while the source still calls rev-2 "under review".
  clickGameCard('401873286');
  await settle();
  const tabs = elements.tabs.innerHTML;
  ['flags', 'challenges', 'replay', 'review', 'nullified', 'redzone', 'integrity'].forEach(function (tab) {
    assert.ok(tabs.indexOf('data-tab="' + tab + '"') !== -1, tab + ' tab is present');
  });
  assert.strictEqual(tabs.indexOf('data-tab="booth"'), -1,
    'the combined Scoring rulings tab has been removed');

  clickGameTab('review');
  let category = elements['game-content'].innerHTML;
  assert.ok(category.indexOf('Scoring plays under review') !== -1);
  assert.ok(category.indexOf('Play under review.') !== -1);
  assert.ok(category.indexOf('>POTENTIAL<') !== -1,
    'potential tracking remains available in the dedicated under-review view');
  assert.strictEqual(category.indexOf('TOUCHDOWN NULLIFIED by Penalty'), -1);

  clickGameTab('flags');
  category = elements['game-content'].innerHTML;
  assert.ok(category.indexOf('Scoring-linked flags') !== -1);
  assert.ok(category.indexOf('TOUCHDOWN NULLIFIED by Penalty') !== -1);
  assert.strictEqual(category.indexOf('enforced at LV 25'), -1,
    'the flags tab is still scoring-linked, not a broad flag ledger');

  clickGameTab('challenges');
  category = elements['game-content'].innerHTML;
  assert.ok(category.indexOf('Scoring-linked challenges') !== -1);
  assert.ok(category.indexOf('No scoring-linked challenges') !== -1,
    'an unrelated challenge is not promoted into the scoring feed');

  clickGameTab('replay');
  category = elements['game-content'].innerHTML;
  assert.ok(category.indexOf('Scoring-linked replay') !== -1);
  assert.ok(category.indexOf('No scoring-linked replay') !== -1,
    'an unrelated replay is not promoted into the scoring feed');

  clickGameTab('nullified');
  category = elements['game-content'].innerHTML;
  assert.ok(category.indexOf('Nullified scoring plays') !== -1);
  assert.ok(category.indexOf('TOUCHDOWN NULLIFIED by Penalty') !== -1);
  assert.strictEqual(category.indexOf('>POTENTIAL<'), -1);
  assert.strictEqual(category.indexOf('>NO ROLLBACK<'), -1);
  assert.strictEqual(category.indexOf('>DATA CHECK<'), -1);

  clickGameTab('redzone');
  category = elements['game-content'].innerHTML;
  assert.ok(category.indexOf('Red zone nullified scores') !== -1);
  assert.ok(category.indexOf('enforced at HST 14') !== -1);
  assert.ok(category.indexOf('1 NULLIFIED IN RZ') !== -1);
  assert.strictEqual(category.indexOf('enforced at HST 19'), -1);

  clickGameTab('integrity');
  category = elements['game-content'].innerHTML;
  assert.ok(category.indexOf('Source data checks') !== -1);
  assert.strictEqual(category.indexOf('TOUCHDOWN NULLIFIED by Penalty'), -1,
    'the data-check category does not infer or duplicate a nullification');

  // A fast-header pending observation remains silent and out of the
  // all-games outcome stream. The focused ruling tab receives it immediately.
  clickGameTab('review');
  assert.strictEqual(typeof documentListeners.click, 'function');
  documentListeners.click({});
  assert.strictEqual(audio.oscillatorCount, 0, 'unlocking audio is not an alert');
  liveScoreTimer.callback();
  await settle();
  assert.ok(elements['game-content'].innerHTML.indexOf('>POTENTIAL<') !== -1,
    'the fast header keeps potential tracking current in its category');
  assert.strictEqual(elements['day-booth'].innerHTML.indexOf('>POTENTIAL<'), -1,
    'the all-games feed never exposes an unresolved potential');
  assert.strictEqual(notifications.length, 0);

  // The same source play now has a provider-published replay verdict. That is
  // the first time it can enter the all-games feed and alert exactly once.
  const pendingReview = summary.drives.previous
    .find(function (drive) { return drive.id === 'reversed-td-drive'; }).plays[1];
  const reversalText = 'The replay official reviewed the scoring ruling, and the play was REVERSED.';
  competition.situation = {
    lastPlay: {
      id: 'rev-2', sequenceNumber: '9100100', text: reversalText,
      type: { text: 'Replay Review' }, awayScore: 0, homeScore: 7,
      period: { number: 2 }, clock: { displayValue: '10:00' }
    }
  };
  const soundBeforeVerdict = audio.oscillatorCount;
  liveScoreTimer.callback();
  await settle();
  assert.ok(elements['day-booth'].innerHTML.indexOf('play was REVERSED') !== -1,
    'the fast header puts a confirmed verdict in the all-games feed');
  assert.ok(elements['day-booth'].innerHTML.indexOf('source-lane') !== -1,
    'the all-games row makes the fast observation transparent');
  assert.strictEqual(elements['day-booth'].innerHTML.indexOf('>POTENTIAL<'), -1);
  assert.ok(audio.oscillatorCount > soundBeforeVerdict,
    'only the confirmed scoring nullification plays sound');
  assert.strictEqual(notifications.length, 1,
    'only the confirmed scoring nullification creates a desktop notification');
  assert.strictEqual(notifications[0].title, 'NFL scoring play nullified');
  const soundAfterVerdict = audio.oscillatorCount;
  liveScoreTimer.callback();
  await settle();
  assert.strictEqual(audio.oscillatorCount, soundAfterVerdict,
    'an unchanged verdict cannot alert twice');
  assert.strictEqual(notifications.length, 1);

  // Reconciliation on the full play-by-play lane cannot duplicate the alert.
  pendingReview.type = { text: 'Replay Review' };
  pendingReview.text = reversalText;
  summary.header.competitions[0].situation = competition.situation;
  reviewTimer.callback();
  await settle();
  assert.ok(elements['day-booth'].innerHTML.indexOf('play was REVERSED') !== -1);
  assert.strictEqual(audio.oscillatorCount, soundAfterVerdict);
  assert.strictEqual(notifications.length, 1);

  // Add a source-supported retained scoring flag and an unrelated score drop.
  // The former belongs only in Flags; the latter belongs only in Data checks.
  summary.drives.previous.push({
    id: 'retained-score-flag', team: { abbreviation: 'LV', displayName: 'Las Vegas Raiders', logos: [] },
    plays: [
      { id: 'retained-1', sequenceNumber: '9500000', type: { text: 'Rush' },
        text: 'A.Okafor left end for 4 yards, TOUCHDOWN.', awayScore: 30, homeScore: 20,
        scoringPlay: true, isPenalty: false },
      { id: 'retained-2', sequenceNumber: '9500100', type: { text: 'Penalty' },
        text: 'PENALTY on LV-R.Jones, Offensive Holding, 10 yards, enforced at LV 16 - No Play.',
        awayScore: 30, homeScore: 20, scoringPlay: false, isPenalty: true,
        penalty: { yards: 10, type: { text: 'Offensive Holding' } } },
      { id: 'retained-3', sequenceNumber: '9500200', type: { text: 'Rush' },
        text: 'A.Okafor left end for 1 yard.', awayScore: 30, homeScore: 20,
        scoringPlay: false, isPenalty: false }
    ]
  });
  summary.drives.previous.push({
    id: 'integrity-drive', team: { abbreviation: 'LV', displayName: 'Las Vegas Raiders', logos: [] },
    plays: [
      { id: 'integrity-base', sequenceNumber: '9700000', type: { text: 'Rush' },
        text: 'A.Run for 1 yard.', awayScore: 24, homeScore: 20, scoringPlay: false, isPenalty: false },
      { id: 'integrity-drop', sequenceNumber: '9700100', type: { text: 'Rush' },
        text: 'A.Run for 2 yards.', awayScore: 17, homeScore: 20, scoringPlay: false, isPenalty: false }
    ]
  });
  reviewTimer.callback();
  await settle();
  const outcomeHTML = elements['day-booth'].innerHTML;
  assert.strictEqual(outcomeHTML.indexOf('>NO ROLLBACK<'), -1,
    'retained rows cannot enter the live nullified feed');
  assert.strictEqual(outcomeHTML.indexOf('>DATA CHECK<'), -1,
    'audit rows cannot enter the live nullified feed');
  assert.strictEqual(outcomeHTML.indexOf('A.Run for 2 yards.'), -1);
  assert.strictEqual(audio.oscillatorCount, soundAfterVerdict,
    'retained and irregular source records remain silent');
  assert.strictEqual(notifications.length, 1);

  // A source can also drop a pending scoring ruling altogether. Preserve that
  // as an audit record, never as a guessed outcome or an all-games alert.
  const disappearingDrive = {
    id: 'disappearing-review', team: { abbreviation: 'LV', displayName: 'Las Vegas Raiders', logos: [] },
    plays: [
      { id: 'disappear-td', sequenceNumber: '9800000', type: { text: 'Rush' },
        text: 'A.Run for 3 yards, TOUCHDOWN.', awayScore: 24, homeScore: 20,
        scoringPlay: true, isPenalty: false },
      { id: 'disappear-review', sequenceNumber: '9800100', type: { text: 'Pass Reception' },
        text: 'Play under review.', awayScore: 24, homeScore: 20,
        scoringPlay: false, isPenalty: false }
    ]
  };
  summary.drives.previous.push(disappearingDrive);
  reviewTimer.callback();
  await settle();
  assert.strictEqual(elements['day-booth'].innerHTML.indexOf('>POTENTIAL<'), -1);
  summary.drives.previous.splice(summary.drives.previous.indexOf(disappearingDrive), 1);
  reviewTimer.callback();
  await settle();
  assert.strictEqual(elements['day-booth'].innerHTML.indexOf('Pending scoring ruling no longer in source'), -1,
    'the default live feed remains outcome-only even for a source disappearance');
  assert.strictEqual(audio.oscillatorCount, soundAfterVerdict);
  assert.strictEqual(notifications.length, 1);

  clickDayTab('integrity');
  const auditHTML = elements['day-booth'].innerHTML;
  assert.ok(auditHTML.indexOf('Source data checks · all games') !== -1);
  assert.ok(auditHTML.indexOf('>DATA CHECK<') !== -1);
  assert.ok(auditHTML.indexOf('A.Run for 2 yards.') !== -1);
  assert.ok(auditHTML.indexOf('Pending scoring ruling no longer in source') !== -1,
    'a disappeared potential is flagged only in the audit view');
  assert.strictEqual(auditHTML.indexOf('TOUCHDOWN NULLIFIED by Penalty'), -1,
    'the audit tab is not another nullification feed');
  assert.strictEqual(audio.oscillatorCount, soundAfterVerdict);
  assert.strictEqual(notifications.length, 1);

  clickDayTab('nullified');
  assert.strictEqual(elements['day-booth'].innerHTML.indexOf('>DATA CHECK<'), -1);
  assert.strictEqual(elements['day-booth'].innerHTML.indexOf('A.Run for 2 yards.'), -1);

  // The retained scoring-linked record is visible only in its own category.
  clickGameTab('flags');
  category = elements['game-content'].innerHTML;
  assert.ok(category.indexOf('R.Jones') !== -1);
  assert.ok(category.indexOf('>NO ROLLBACK<') !== -1);
  clickGameTab('integrity');
  category = elements['game-content'].innerHTML;
  assert.ok(category.indexOf('A.Run for 2 yards.') !== -1);
  assert.ok(category.indexOf('Pending scoring ruling no longer in source') !== -1);
  assert.ok(category.indexOf('>DATA CHECK<') !== -1);

  // A normal nullification day row opens Nullified; a red-zone row opens Red
  // Zone. Both routes are explicit data attributes rather than a mixed filter.
  elements['back-btn'].dispatch('click', {});
  elements['day-booth'].dispatch('click', {
    target: {
      closest: function (selector) {
        if (selector === '.day-sound-btn' || selector === '.day-watch-tab') return null;
        if (selector === '.day-msg') {
          return { getAttribute: function (name) {
            return name === 'data-id' ? '401873286' : 'nullified';
          } };
        }
        return null;
      }
    }
  });
  await settle();
  assert.ok(elements.tabs.innerHTML.indexOf('class="tab active" data-tab="nullified"') !== -1);
  elements['back-btn'].dispatch('click', {});

  // Move to a date with two live games. Both are fetched automatically and
  // only their confirmed scoring nullifications merge into the all-games feed.
  elements['next-day'].dispatch('click', {});
  await settle(5);
  const twoGameDay = elements['day-booth'].innerHTML;
  assert.ok(elements['scoreboard-view'].innerHTML.indexOf('data-id="299001001"') !== -1);
  assert.ok(twoGameDay.indexOf('enforced at HST 14') !== -1);
  assert.ok(twoGameDay.indexOf('enforced at LAC 9') !== -1);
  assert.strictEqual(twoGameDay.indexOf('catch ruling'), -1);
  assert.strictEqual(twoGameDay.indexOf('enforced at SF 47'), -1);
  assert.strictEqual(twoGameDay.indexOf('>POTENTIAL<'), -1);
  assert.strictEqual(twoGameDay.indexOf('>NO ROLLBACK<'), -1);
  assert.strictEqual(twoGameDay.indexOf('>DATA CHECK<'), -1);

  // The cross-game all-games category tabs still merge by category and stay
  // summary-only: both games' confirmed nullified flags appear, and the
  // red-zone tab keeps only the red-zone nullification from each game.
  clickDayTab('flags');
  let dayTwo = elements['day-booth'].innerHTML;
  assert.ok(dayTwo.indexOf('enforced at HST 14') !== -1);
  assert.ok(dayTwo.indexOf('enforced at LAC 9') !== -1);
  assert.strictEqual(dayTwo.indexOf('>POTENTIAL<'), -1);

  clickDayTab('redzone');
  dayTwo = elements['day-booth'].innerHTML;
  assert.ok(dayTwo.indexOf('enforced at HST 14') !== -1);
  assert.ok(dayTwo.indexOf('enforced at LAC 9') !== -1);
  assert.strictEqual(dayTwo.indexOf('enforced at SF 47'), -1,
    'a midfield flag is not promoted into a red-zone panel');
  clickDayTab('nullified');

  // If a compact header reply takes longer than its fast interval, retain
  // one missed tick and launch it as soon as the response clears. This avoids
  // idle scheduler time without allowing concurrent header fetches.
  const headersBeforeSlowReply = fetches.filter(function (url) {
    return url.indexOf('/scoreboard/header') !== -1;
  }).length;
  holdHeaders = true;
  liveScoreTimer.callback();
  liveScoreTimer.callback();
  assert.strictEqual(fetches.filter(function (url) {
    return url.indexOf('/scoreboard/header') !== -1;
  }).length, headersBeforeSlowReply + 1,
  'a slow compact-header response still has only one request in flight');
  assert.strictEqual(pendingHeaders.length, 1);
  pendingHeaders.shift()();
  await settle();
  assert.strictEqual(fetches.filter(function (url) {
    return url.indexOf('/scoreboard/header') !== -1;
  }).length, headersBeforeSlowReply + 2,
  'one missed compact-header tick starts immediately after a successful slow reply');
  assert.strictEqual(pendingHeaders.length, 1);
  holdHeaders = false;
  pendingHeaders.shift()();
  await settle();

  elements['day-booth'].dispatch('click', {
    target: {
      closest: function (selector) {
        if (selector === '.day-sound-btn' || selector === '.day-watch-tab') return null;
        if (selector === '.day-msg') {
          return { getAttribute: function (name) {
            return name === 'data-id' ? '299001001' : 'redzone';
          } };
        }
        return null;
      }
    }
  });
  await settle();
  assert.strictEqual(elements['game-pos'].textContent, '2 of 2');
  assert.ok(elements.tabs.innerHTML.indexOf('class="tab active" data-tab="redzone"') !== -1);
  assert.ok(elements['game-content'].innerHTML.indexOf('enforced at LAC 9') !== -1);

  console.log('NFL scoreboard app smoke test');
  console.log('  ✓ all-games live feed contains confirmed scoring nullifications only');
  console.log('  ✓ all-games panel tracks flags, challenges, replay, under-review, red-zone, nullified and data checks in separate tabs');
  console.log('  ✓ every all-games tracking tab is silent; only the live nullified panel may alert');
  console.log('  ✓ flags, challenges, replay, under-review, nullified, red-zone, and data checks have separate scoring-linked views');
  console.log('  ✓ changed score and scoring-ruling header records trigger immediate targeted detail reconciliation');
  console.log('  ✓ a slow compact-header reply queues one non-overlapping follow-up poll');
  console.log('  ✓ potential and retained records stay low-latency but separate and silent');
  console.log('  ✓ confirmed nullifications alone produce visual/audio/desktop alert paths');
  console.log('  ✓ source irregularities stay in the dedicated all-games and game-level audit views');
  console.log('  ✓ all selected-day games are scanned automatically and route to focused tabs');

}

run().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
