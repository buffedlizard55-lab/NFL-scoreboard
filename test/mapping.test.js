'use strict';

/*
 * Unit tests for the pure data-mapping helpers (lib/mapping.js).
 *
 * Run with:  node test/mapping.test.js   (or `npm test`)
 *
 * The fixtures mirror the exact shapes returned by the ESPN public API for
 * event 401873286 (Las Vegas Raiders @ Houston Texans, 2026 preseason W2),
 * so these assertions validate the mapping logic against real data shapes.
 */

const assert = require('assert');
const NFLMap = require('../lib/mapping.js');
const sample = require('./fixtures/sample.json');

let pass = 0;
function ok(name, fn) {
  fn();
  pass += 1;
  console.log('  ✓ ' + name);
}

console.log('NFLMap mapping tests');

// 1. Event summary ------------------------------------------------------
ok('summarizeEvent: identity, teams, scores, status, venue, broadcast', function () {
  const ev = NFLMap.summarizeEvent(sample.event);
  assert.strictEqual(ev.id, '401873286');
  assert.strictEqual(ev.name, 'Las Vegas Raiders at Houston Texans');
  assert.strictEqual(ev.home.abbr, 'HOU');
  assert.strictEqual(ev.home.score, '20');
  assert.strictEqual(ev.away.abbr, 'LV');
  assert.strictEqual(ev.away.score, '22');
  assert.strictEqual(ev.status.state, 'post');
  assert.strictEqual(ev.status.shortDetail, 'Final');
  assert.strictEqual(ev.venue.fullName, 'Reliant Stadium');
  assert.strictEqual(ev.venue.city, 'Houston');
  assert.strictEqual(ev.attendance, 69765);
  assert.strictEqual(ev.broadcast, 'ESPN');
});

ok('summarizeEvent: linescores by quarter', function () {
  const ev = NFLMap.summarizeEvent(sample.event);
  assert.deepStrictEqual(ev.home.linescores.map(function (l) { return l.displayValue; }),
    ['17', '3', '0', '0']);
  assert.deepStrictEqual(ev.away.linescores.map(function (l) { return l.displayValue; }),
    ['0', '3', '7', '12']);
});

ok('summarizeEvent: winner flag', function () {
  const ev = NFLMap.summarizeEvent(sample.event);
  assert.strictEqual(ev.home.winner, false);
  assert.strictEqual(ev.away.winner, true);
});

// 2. Team stats ---------------------------------------------------------
ok('teamStatsTables: away/home keyed by stat name', function () {
  const teams = NFLMap.teamStatsTables(sample.summary.boxscore.teams);
  assert.strictEqual(teams.length, 2);
  const away = teams.find(function (t) { return t.team.homeAway === 'away'; });
  const home = teams.find(function (t) { return t.team.homeAway === 'home'; });
  assert.strictEqual(away.stats.firstDowns, '22');
  assert.strictEqual(away.stats.totalYards, '400');
  assert.strictEqual(away.stats.possessionTime, '30:35');
  assert.strictEqual(home.stats.totalYards, '219');
  assert.strictEqual(home.stats.possessionTime, '29:25');
});

// 3. Player stats -------------------------------------------------------
ok('playerStatTeams: passing category', function () {
  const players = NFLMap.playerStatTeams(sample.summary.boxscore.players);
  const lv = players.find(function (t) { return t.team.homeAway === 'away'; });
  const passing = lv.categories.find(function (c) { return c.name === 'passing'; });
  assert.deepStrictEqual(passing.labels, ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'RTG']);
  assert.strictEqual(passing.athletes.length, 2);
  assert.strictEqual(passing.athletes[0].name, "Aidan O'Connell");
  assert.strictEqual(passing.athletes[0].jersey, '12');
  assert.deepStrictEqual(passing.athletes[0].stats, ['15/24', '166', '6.9', '0', '0', '0-0', '83.0']);
  assert.deepStrictEqual(passing.totals, ['23/39', '241', '6.5', '0', '1', '1-11', '67.5']);
});

ok('playerStatTeams: rushing category', function () {
  const players = NFLMap.playerStatTeams(sample.summary.boxscore.players);
  const lv = players.find(function (t) { return t.team.homeAway === 'away'; });
  const rushing = lv.categories.find(function (c) { return c.name === 'rushing'; });
  assert.deepStrictEqual(rushing.labels, ['CAR', 'YDS', 'AVG', 'TD', 'LONG']);
  assert.strictEqual(rushing.athletes.length, 2);
  assert.strictEqual(rushing.athletes[0].name, 'Mike Washington Jr.');
});

// 4. Drives / play-by-play ---------------------------------------------
ok('playsList: flatten + sort drives in chronological order', function () {
  const plays = NFLMap.playsList(sample.summary.drives);
  assert.strictEqual(plays.length, 4);
  assert.strictEqual(plays[0].type.text, 'Kickoff');
  assert.strictEqual(plays[0].sequenceNumber, '3900');
  assert.strictEqual(plays[3].sequenceNumber, '355600');
});

ok('playRow: down/distance, scores, clock', function () {
  const plays = NFLMap.playsList(sample.summary.drives);
  const rush = NFLMap.playRow(plays[1]);
  assert.strictEqual(rush.type, 'Rush');
  assert.strictEqual(rush.downDistance, '1st & 10 at HOU 31');
  assert.strictEqual(rush.clock, '14:54');
  assert.strictEqual(rush.awayScore, 0);
  assert.strictEqual(rush.homeScore, 0);
  assert.strictEqual(rush.yardage, 9);
  assert.strictEqual(rush.scoring, false);
});

ok('scoringDrives: only isScore drives returned', function () {
  const sc = NFLMap.scoringDrives(sample.summary.drives);
  assert.strictEqual(sc.length, 1);
});

ok('driveRow: result, yards, plays, time, team', function () {
  const sc = NFLMap.scoringDrives(sample.summary.drives);
  const dr = NFLMap.driveRow(sc[0]);
  assert.strictEqual(dr.result, 'Touchdown');
  assert.strictEqual(dr.yards, 64);
  assert.strictEqual(dr.plays, 13);
  assert.strictEqual(dr.timeElapsed, '4:54');
  assert.strictEqual(dr.team.abbr, 'HOU');
  assert.strictEqual(dr.quarter, 1);
});

// 5. Quarter labels -----------------------------------------------------
ok('quarterLabel: regulation and overtime', function () {
  assert.strictEqual(NFLMap.quarterLabel(1), 'Q1');
  assert.strictEqual(NFLMap.quarterLabel(4), 'Q4');
  assert.strictEqual(NFLMap.quarterLabel(5), 'OT');
  assert.strictEqual(NFLMap.quarterLabel(null), '');
});

// 6. Null-safety --------------------------------------------------------
ok('null-safety: empty inputs do not throw', function () {
  assert.strictEqual(NFLMap.summarizeEvent(null), null);
  assert.deepStrictEqual(NFLMap.teamStatsTables(null), []);
  assert.deepStrictEqual(NFLMap.playerStatTeams(null), []);
  assert.deepStrictEqual(NFLMap.playsList(null), []);
  assert.deepStrictEqual(NFLMap.scoringDrives(null), []);
  assert.strictEqual(NFLMap.driveRow(null), null);
});

console.log('\nAll ' + pass + ' mapping tests passed ✓');
