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
  return {
    classList: classList(),
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; htmlWrites += 1; },
    innerHTMLWrites: function () { return htmlWrites; },
    textContent: '',
    addEventListener: function () {},
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
    fetch: function (url, options) {
      fetches.push(url);
      fetchOptions.push(options);
      if (url.indexOf('/scoreboard') !== -1) {
        return Promise.resolve(response({ events: [liveEvent], leagues: [] }));
      }
      if (url.indexOf('/summary') !== -1) {
        if (!holdSummaries) return Promise.resolve(response(summary));
        return new Promise(function (resolve) {
          pendingSummaries.push(function () { resolve(response(summary)); });
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
}

run().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
