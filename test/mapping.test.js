'use strict';

/*
 * Unit tests for the pure data-mapping helpers (lib/mapping.js).
 *
 * Run with:  node test/mapping.test.js   (or `npm test`)
 *
 * The fixture's scoreboard, box-score, and drive records mirror ESPN response
 * shapes for event 401873286 (Las Vegas Raiders @ Houston Texans, 2026
 * preseason W2). It also contains focused flag/review examples used to verify
 * classification and update behavior without a network request.
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
  assert.strictEqual(plays.length, 10);
  assert.strictEqual(plays[0].type.text, 'Kickoff');
  assert.strictEqual(plays[0].sequenceNumber, '3900');
  assert.strictEqual(plays[9].sequenceNumber, '355600');
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
  assert.strictEqual(NFLMap.classifyBooth(null), '');
  assert.strictEqual(NFLMap.boothEvent(null), null);
  assert.deepStrictEqual(NFLMap.boothEvents(null), []);
});

// 7. Booth: flags, challenges, replay reviews ---------------------------
ok('classifyBooth: penalty flag, declined, replay, challenge, under review, ordinary play', function () {
  const plays = NFLMap.playsList(sample.summary.drives);
  const bySeq = {};
  plays.forEach(function (p) { bySeq[p.sequenceNumber] = p; });

  assert.strictEqual(NFLMap.classifyBooth(bySeq['6200']), '');
  assert.strictEqual(NFLMap.classifyBooth(bySeq['8500']), '');
  assert.strictEqual(NFLMap.classifyBooth(bySeq['8000']), 'penalty');
  assert.strictEqual(NFLMap.classifyBooth(bySeq['8100']), 'penalty');
  assert.strictEqual(NFLMap.classifyBooth(bySeq['8200']), 'replay');
  assert.strictEqual(NFLMap.classifyBooth(bySeq['8300']), 'challenge');
  assert.strictEqual(NFLMap.classifyBooth(bySeq['8400']), 'review');
});

ok('boothEvent: penalty object yards + type; declined has no penalty object', function () {
  const plays = NFLMap.playsList(sample.summary.drives);
  const flag = NFLMap.boothEvent(plays.find(function (p) { return p.sequenceNumber === '8000'; }));
  assert.strictEqual(flag.kind, 'penalty');
  assert.strictEqual(flag.penaltyYards, 5);
  assert.strictEqual(flag.penaltyType, 'False Start');
  assert.strictEqual(flag.heading, '5-yard False Start');
  assert.strictEqual(flag.clock, '10:44');
  assert.strictEqual(flag.quarter, 2);

  const declined = NFLMap.boothEvent(plays.find(function (p) { return p.sequenceNumber === '8100'; }));
  assert.strictEqual(declined.kind, 'penalty');
  assert.strictEqual(declined.penaltyYards, null);
  assert.strictEqual(declined.result, 'declined');
  assert.strictEqual(declined.heading, '5-yard Defensive Offside');
});

ok('boothEvent: replay reversed, challenge upheld, under review pending', function () {
  const plays = NFLMap.playsList(sample.summary.drives);
  const replay = NFLMap.boothEvent(plays.find(function (p) { return p.sequenceNumber === '8200'; }));
  assert.strictEqual(replay.kind, 'replay');
  assert.strictEqual(replay.result, 'overturned');
  assert.strictEqual(replay.heading, 'Replay review');

  const chal = NFLMap.boothEvent(plays.find(function (p) { return p.sequenceNumber === '8300'; }));
  assert.strictEqual(chal.kind, 'challenge');
  assert.strictEqual(chal.result, 'confirmed');
  assert.strictEqual(chal.heading, "Coach's challenge");

  const pending = NFLMap.boothEvent(plays.find(function (p) { return p.sequenceNumber === '8400'; }));
  assert.strictEqual(pending.kind, 'review');
  assert.strictEqual(pending.result, 'pending');
});

ok('boothEvents: only flagged plays, chronological, lastPlay de-duped', function () {
  const events = NFLMap.boothEvents(sample.summary.drives);
  assert.strictEqual(events.length, 5);
  assert.deepStrictEqual(events.map(function (e) { return e.kind; }),
    ['penalty', 'penalty', 'replay', 'challenge', 'review']);

  const last = {
    id: '4018732869005',
    text: 'Play under review.',
    type: { text: 'Pass Reception' },
    isPenalty: false
  };
  const withLive = NFLMap.boothEvents(sample.summary.drives, last);
  assert.strictEqual(withLive.length, 5);

  const resolvedLast = {
    id: '4018732869005',
    sequenceNumber: '8400',
    text: 'The replay official reviewed the ruling, and the play was REVERSED.',
    type: { text: 'Replay Review' },
    isPenalty: false
  };
  const withResolution = NFLMap.boothEvents(sample.summary.drives, resolvedLast);
  assert.strictEqual(withResolution.length, 5);
  assert.strictEqual(withResolution[4].kind, 'replay');
  assert.strictEqual(withResolution[4].result, 'overturned');
  assert.strictEqual(withResolution[4].text, resolvedLast.text);

  const other = {
    id: 'live-1',
    text: 'Play under review.',
    type: { text: 'Rush' },
    isPenalty: false
  };
  const extra = NFLMap.boothEvents(sample.summary.drives, other);
  assert.strictEqual(extra.length, 6);
  assert.strictEqual(extra[5].live, true);
  assert.strictEqual(extra[5].kind, 'review');
});

ok('boothResult: confirmed / stands / offsetting phrases', function () {
  assert.strictEqual(NFLMap.boothResult('The ruling on the field is confirmed.'), 'confirmed');
  assert.strictEqual(NFLMap.boothResult('The ruling on the field stands.'), 'stands');
  assert.strictEqual(NFLMap.boothResult('PENALTY on LV-X, Holding, 10 yards, Offset.'), 'offsetting');
  assert.strictEqual(NFLMap.boothResult('W.Marks left tackle to HOU 42 for 2 yards.'), '');
});

ok('classifyBooth: does not treat "no penalty" ordinary wording as a flag', function () {
  assert.strictEqual(NFLMap.classifyBooth({
    text: 'W.Marks left tackle to HOU 42 for 2 yards. No penalty on the play.',
    type: { text: 'Rush' },
    isPenalty: false
  }), '');
});

// 8. Score-state tracking: before / during / after + points removed ------
ok('boothScoreEffect: offensive penalty removes a counted touchdown', function () {
  const plays = [
    { id: 'p1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'L.Smith right guard for 5 yards, TOUCHDOWN.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'p2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on LV-X, Offensive Holding, 10 yards, enforced at LV 25 - No Play.',
      awayScore: 0, homeScore: 0, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Offensive Holding' } } },
    { id: 'p3', sequenceNumber: '300', type: { text: 'Rush' },
      text: 'L.Smith left guard to LV 20 for 2 yards.', awayScore: 0, homeScore: 0,
      scoringPlay: false, isPenalty: false }
  ];
  const effect = NFLMap.boothScoreEffect(plays, 1);
  assert.deepStrictEqual(effect.before, { away: 7, home: 0 });
  assert.deepStrictEqual(effect.during, { away: 0, home: 0 });
  assert.deepStrictEqual(effect.after, { away: 0, home: 0 });
  assert.strictEqual(effect.removesPoints, true);
  assert.strictEqual(effect.pointsRemoved, 7);
  assert.strictEqual(effect.team, 'away');
});

ok('boothEventContext: flags a called-back touchdown and names the scoring play', function () {
  const plays = [
    { id: 'p1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'L.Smith right guard for 5 yards, TOUCHDOWN.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'p2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on LV-X, Offensive Holding, 10 yards, enforced at LV 25 - No Play.',
      awayScore: 0, homeScore: 0, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Offensive Holding' } } }
  ];
  const event = NFLMap.boothEvent(plays[1]);
  const withContext = NFLMap.boothEventContext(event, plays, 1);
  assert.strictEqual(withContext.kind, 'penalty');
  assert.strictEqual(withContext.removesPoints, true);
  assert.strictEqual(withContext.pointsRemoved, 7);
  assert.strictEqual(withContext.removedTeam, 'away');
  assert.strictEqual(withContext.beforeAwayScore, 7);
  assert.strictEqual(withContext.beforeHomeScore, 0);
  assert.strictEqual(withContext.duringAwayScore, 0);
  assert.strictEqual(withContext.afterAwayScore, 0);
  assert.strictEqual(withContext.relatedScoringPlay.points, 7);
  assert.strictEqual(withContext.relatedScoringPlay.team, 'away');
  assert.strictEqual(withContext.relatedScoringPlay.id, 'p1');
});

ok('boothScoreEffect: under review followed by reversal removes a touchdown', function () {
  const plays = [
    { id: 'r1', sequenceNumber: '1000', type: { text: 'Rush' },
      text: 'J.Banks 2 yard run, TOUCHDOWN.', awayScore: 0, homeScore: 7,
      scoringPlay: true, isPenalty: false },
    { id: 'r2', sequenceNumber: '1100', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false },
    { id: 'r3', sequenceNumber: '1200', type: { text: 'Replay Review' },
      text: 'The replay official reviewed the ruling, and the play was REVERSED. Runner short of the goal line.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'r4', sequenceNumber: '1300', type: { text: 'Rush' },
      text: 'J.Banks left tackle for no gain.', awayScore: 0, homeScore: 0,
      scoringPlay: false, isPenalty: false }
  ];
  const underReview = NFLMap.boothScoreEffect(plays, 1);
  assert.deepStrictEqual(underReview.before, { away: 0, home: 7 });
  assert.deepStrictEqual(underReview.during, { away: 0, home: 7 });
  assert.deepStrictEqual(underReview.after, { away: 0, home: 0 });
  assert.strictEqual(underReview.removesPoints, true);
  assert.strictEqual(underReview.pointsRemoved, 7);
  assert.strictEqual(underReview.team, 'home');

  const replay = NFLMap.boothScoreEffect(plays, 2);
  assert.deepStrictEqual(replay.before, { away: 0, home: 7 });
  assert.deepStrictEqual(replay.during, { away: 0, home: 0 });
  assert.deepStrictEqual(replay.after, { away: 0, home: 0 });
  assert.strictEqual(replay.removesPoints, true);
});

ok('boothEvents: enriches both review and replay entries in a reversed TD sequence', function () {
  const drives = { previous: [{
    id: 'd1', team: { abbreviation: 'HOU', displayName: 'Houston Texans', logos: [] },
    plays: [
      { id: 'r1', sequenceNumber: '1000', type: { text: 'Rush' },
        text: 'J.Banks 2 yard run, TOUCHDOWN.', awayScore: 0, homeScore: 7,
        scoringPlay: true, isPenalty: false },
      { id: 'r2', sequenceNumber: '1100', type: { text: 'Pass Reception' },
        text: 'Play under review.', awayScore: 0, homeScore: 7,
        scoringPlay: false, isPenalty: false },
      { id: 'r3', sequenceNumber: '1200', type: { text: 'Replay Review' },
        text: 'The replay official reviewed the ruling, and the play was REVERSED. Runner short of the goal line.',
        awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false },
      { id: 'r4', sequenceNumber: '1300', type: { text: 'Rush' },
        text: 'J.Banks left tackle for no gain.', awayScore: 0, homeScore: 0,
        scoringPlay: false, isPenalty: false }
    ]
  }] };
  const events = NFLMap.boothEvents(drives);
  assert.strictEqual(events.length, 2);

  const review = events[0];
  assert.strictEqual(review.kind, 'review');
  assert.strictEqual(review.removesPoints, true);
  assert.strictEqual(review.pointsRemoved, 7);
  assert.deepStrictEqual([review.beforeAwayScore, review.beforeHomeScore], [0, 7]);
  assert.deepStrictEqual([review.afterAwayScore, review.afterHomeScore], [0, 0]);

  const replay = events[1];
  assert.strictEqual(replay.kind, 'replay');
  assert.strictEqual(replay.removesPoints, true);
  assert.strictEqual(replay.pointsRemoved, 7);
});

ok('boothScoreEffect: confirmed challenge and declined penalty do not report removed points', function () {
  const confirmed = [
    { id: 'c1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'K.Cole 4 yard TD run.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'c2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'The ruling on the field is confirmed.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: false },
    { id: 'c3', sequenceNumber: '300', type: { text: 'Kickoff' },
      text: 'K.Cole kicks 65 yards.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: false }
  ];
  const challengeEffect = NFLMap.boothScoreEffect(confirmed, 1);
  assert.strictEqual(challengeEffect.removesPoints, false);
  assert.strictEqual(challengeEffect.pointsRemoved, 0);
  assert.deepStrictEqual(challengeEffect.after, { away: 7, home: 0 });

  const declined = [
    { id: 'd1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'K.Cole run for 3 yards.', awayScore: 0, homeScore: 0,
      scoringPlay: false, isPenalty: false },
    { id: 'd2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on HOU-D.Thomas, Defensive Offside, 5 yards, declined.',
      awayScore: 0, homeScore: 0, isPenalty: true,
      penalty: { type: { text: 'Defensive Offside' } } }
  ];
  const declinedEffect = NFLMap.boothScoreEffect(declined, 1);
  assert.strictEqual(declinedEffect.removesPoints, false);
  assert.strictEqual(declinedEffect.pointsRemoved, 0);
});

ok('nearestScoringPlay: a review that mentions "no touchdown" is not mistaken for a scoring play', function () {
  const plays = [
    { id: 'p1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'N.Moore 3 yard run, TOUCHDOWN.', awayScore: 0, homeScore: 7,
      scoringPlay: true, isPenalty: false },
    { id: 'p2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false },
    { id: 'p3', sequenceNumber: '300', type: { text: 'Replay Review' },
      text: 'The replay official reviewed the ruling, and the play was REVERSED. No touchdown.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'p4', sequenceNumber: '400', type: { text: 'Penalty' },
      text: 'PENALTY on HOU-D.Thomas, Defensive Offside, 5 yards, declined.',
      awayScore: 0, homeScore: 0, isPenalty: true,
      penalty: { type: { text: 'Defensive Offside' } } }
  ];
  const event = NFLMap.boothEventContext(NFLMap.boothEvent(plays[3]), plays, 3);
  assert.strictEqual(event.relatedScoringPlay.id, 'p1');
  assert.strictEqual(event.relatedScoringPlay.points, 7);
});

ok('boothScoreEffect: live under-review play without a score does not invent a rollback', function () {
  const plays = [
    { id: 'l1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'J.Banks 2 yard run, TOUCHDOWN.', awayScore: 0, homeScore: 7,
      scoringPlay: true, isPenalty: false },
    { id: 'l2', sequenceNumber: '1100', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false },
    { id: 'l3', sequenceNumber: '1200', type: { text: 'Pass Reception' },
      text: 'Play under review.', scoringPlay: false, isPenalty: false }
  ];
  const effect = NFLMap.boothScoreEffect(plays, 2);
  assert.strictEqual(effect.removesPoints, false);
  assert.strictEqual(effect.pointsRemoved, 0);
  assert.deepStrictEqual(effect.during, { away: 0, home: 7 });
  assert.deepStrictEqual(effect.after, { away: 0, home: 7 });
});

ok('boothScoreEffect / boothEventContext: null and out-of-range safety', function () {
  const empty = NFLMap.boothScoreEffect(null, 0);
  assert.strictEqual(empty.removesPoints, false);
  assert.deepStrictEqual(empty.before, { away: 0, home: 0 });
  assert.strictEqual(NFLMap.boothEventContext(null, null, 0), null);
  assert.strictEqual(NFLMap.boothEventContext({ id: 'x' }, [], -1).removesPoints, false);
});

// 8b. Score-removal risk: highlight what COULD take points off the board ----
ok('boothScoreRisk: pending review of a touchdown is at risk, not claimed removed', function () {
  const plays = [
    { id: 't1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'J.Banks 2 yard run, TOUCHDOWN.', awayScore: 0, homeScore: 7,
      scoringPlay: true, isPenalty: false },
    { id: 't2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false },
    { id: 't3', sequenceNumber: '300', type: { text: 'Rush' },
      text: 'J.Banks left tackle for no gain.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false }
  ];
  const risk = NFLMap.boothScoreRisk(plays, 1, NFLMap.boothEvent(plays[1]));
  assert.strictEqual(risk.risk, 'possible');
  assert.strictEqual(risk.removesPoints, false);
  assert.strictEqual(risk.pointsRemoved, 0);
  assert.strictEqual(risk.scoringPlay.id, 't1');
  assert.strictEqual(risk.scoringPlay.index, 0);
  assert.strictEqual(risk.scoringPlay.points, 7);
  assert.strictEqual(risk.scoringPlay.team, 'home');
});

ok('boothScoreRisk: reversal chain marks both the review and the verdict removed', function () {
  const plays = [
    { id: 't1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'J.Banks 2 yard run, TOUCHDOWN.', awayScore: 0, homeScore: 7,
      scoringPlay: true, isPenalty: false },
    { id: 't2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false },
    { id: 't3', sequenceNumber: '300', type: { text: 'Replay Review' },
      text: 'The replay official reviewed the ruling, and the play was REVERSED. Runner short of the goal line.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false }
  ];
  const reviewRisk = NFLMap.boothScoreRisk(plays, 1, NFLMap.boothEvent(plays[1]));
  assert.strictEqual(reviewRisk.risk, 'removed');
  assert.strictEqual(reviewRisk.removesPoints, true);
  assert.strictEqual(reviewRisk.pointsRemoved, 7);
  assert.strictEqual(reviewRisk.scoringPlay.id, 't1');

  const verdictRisk = NFLMap.boothScoreRisk(plays, 2, NFLMap.boothEvent(plays[2]));
  assert.strictEqual(verdictRisk.risk, 'removed');
  assert.strictEqual(verdictRisk.pointsRemoved, 7);
  assert.strictEqual(verdictRisk.scoringPlay.id, 't1');
});

ok('boothScoreRisk: confirmed/upheld review ends as points stood', function () {
  const plays = [
    { id: 't1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'J.Banks 2 yard run, TOUCHDOWN.', awayScore: 0, homeScore: 7,
      scoringPlay: true, isPenalty: false },
    { id: 't2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false },
    { id: 't3', sequenceNumber: '300', type: { text: 'Replay Review' },
      text: 'The ruling on the field is confirmed.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false }
  ];
  const reviewRisk = NFLMap.boothScoreRisk(plays, 1, NFLMap.boothEvent(plays[1]));
  assert.strictEqual(reviewRisk.risk, 'stood');
  assert.strictEqual(reviewRisk.removesPoints, false);
  assert.strictEqual(reviewRisk.scoringPlay.id, 't1');

  const verdictRisk = NFLMap.boothScoreRisk(plays, 2, NFLMap.boothEvent(plays[2]));
  assert.strictEqual(verdictRisk.risk, 'stood');
  assert.strictEqual(verdictRisk.removesPoints, false);
});

ok('boothScoreRisk: penalty saying No Play is at risk even before the score drops', function () {
  const plays = [
    { id: 't1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'L.Smith right guard for 5 yards, TOUCHDOWN.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 't2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on LV-X, Offensive Holding, 10 yards, enforced at LV 25 - No Play.',
      awayScore: 7, homeScore: 0, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Offensive Holding' } } }
  ];
  const risk = NFLMap.boothScoreRisk(plays, 1, NFLMap.boothEvent(plays[1]));
  assert.strictEqual(risk.risk, 'possible');
  assert.strictEqual(risk.removesPoints, false);
  assert.strictEqual(risk.scoringPlay.id, 't1');

  // Once ESPN publishes the corrected score, the same penalty is reported as removed.
  const withDrop = [
    plays[0],
    Object.assign({}, plays[1], { awayScore: 0, homeScore: 0 })
  ];
  const removed = NFLMap.boothScoreRisk(withDrop, 1, NFLMap.boothEvent(withDrop[1]));
  assert.strictEqual(removed.risk, 'removed');
  assert.strictEqual(removed.removesPoints, true);
  assert.strictEqual(removed.pointsRemoved, 7);
});

ok('boothScoreRisk: declined penalty after a touchdown stands, offsetting is at risk', function () {
  const td = { id: 't1', sequenceNumber: '100', type: { text: 'Rush' },
    text: 'K.Cole 4 yard TD run.', awayScore: 7, homeScore: 0,
    scoringPlay: true, isPenalty: false };
  const declined = [
    td,
    { id: 'p1', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on HOU-D.Thomas, Defensive Offside, 5 yards, declined.',
      awayScore: 7, homeScore: 0, isPenalty: true,
      penalty: { type: { text: 'Defensive Offside' } } }
  ];
  const stood = NFLMap.boothScoreRisk(declined, 1, NFLMap.boothEvent(declined[1]));
  assert.strictEqual(stood.risk, 'stood');
  assert.strictEqual(stood.removesPoints, false);

  const offsetting = [
    td,
    { id: 'p2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on LV-X, Offensive Holding, 10 yards, Offset.',
      awayScore: 7, homeScore: 0, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Offensive Holding' } } }
  ];
  const risk = NFLMap.boothScoreRisk(offsetting, 1, NFLMap.boothEvent(offsetting[1]));
  assert.strictEqual(risk.risk, 'possible');
});

ok('boothScoreRisk: mid-drive review and unrelated flags are not at risk', function () {
  const plays = [
    { id: 'a', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'W.Marks right guard for 9 yards.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false },
    { id: 'b', sequenceNumber: '200', type: { text: 'Rush' },
      text: 'W.Marks left tackle for 2 yards.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false },
    { id: 'c', sequenceNumber: '300', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false },
    { id: 'd', sequenceNumber: '400', type: { text: 'Penalty' },
      text: 'PENALTY on LV-K.Miller, False Start, 5 yards, enforced at LV 25 - No Play.',
      awayScore: 0, homeScore: 7, isPenalty: true,
      penalty: { yards: 5, type: { text: 'False Start' } } }
  ];
  assert.strictEqual(NFLMap.boothScoreRisk(plays, 2, NFLMap.boothEvent(plays[2])).risk, 'none');
  assert.strictEqual(NFLMap.boothScoreRisk(plays, 3, NFLMap.boothEvent(plays[3])).risk, 'none');
  assert.strictEqual(NFLMap.boothScoreRisk(plays, 2).scoringPlay, null);
});

ok('boothScoreRisk: challenge before a touchdown is not treated as removing points', function () {
  const plays = [
    { id: 'c1', sequenceNumber: '100', type: { text: 'Pass Incompletion' },
      text: 'Cincinnati challenged the short of the goal line ruling, and the play was REVERSED.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'c2', sequenceNumber: '200', type: { text: 'Rush' },
      text: 'D.Moore left end for 17 yards, TOUCHDOWN.', awayScore: 0, homeScore: 6,
      scoringPlay: true, isPenalty: false }
  ];
  const risk = NFLMap.boothScoreRisk(plays, 0, NFLMap.boothEvent(plays[0]));
  assert.strictEqual(risk.risk, 'none');
  assert.strictEqual(risk.scoringPlay, null);
});

ok('boothScoreRisk: unsportsmanlike conduct after a score is a dead-ball foul, points stand', function () {
  const plays = [
    { id: 't1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'TOUCHDOWN.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 't2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on LV-X, Unsportsmanlike Conduct, 15 yards, enforced at LV 15.',
      awayScore: 7, homeScore: 0, isPenalty: true,
      penalty: { yards: 15, type: { text: 'Unsportsmanlike Conduct' } } }
  ];
  const risk = NFLMap.boothScoreRisk(plays, 1, NFLMap.boothEvent(plays[1]));
  assert.strictEqual(risk.risk, 'stood');
  assert.strictEqual(risk.removesPoints, false);
});

ok('boothScoreRisk: scoring play updated in place with review wording is at risk', function () {
  const plays = [
    { id: 'p0', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'J.Banks left tackle for 2 yards.', awayScore: 0, homeScore: 0,
      scoringPlay: false, isPenalty: false },
    { id: 'p1', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 0, homeScore: 7,
      scoringPlay: true, isPenalty: false }
  ];
  const risk = NFLMap.boothScoreRisk(plays, 1, NFLMap.boothEvent(plays[1]));
  assert.strictEqual(risk.risk, 'possible');
  assert.strictEqual(risk.scoringPlay.id, 'p1');
  assert.strictEqual(risk.scoringPlay.index, 1);
});

ok('boothScoreRisk: reversed field goal is reported as removed', function () {
  const plays = [
    { id: 'f1', sequenceNumber: '100', type: { text: 'Field Goal' },
      text: 'K.Bass 42 yard field goal is GOOD.', awayScore: 3, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'f2', sequenceNumber: '200', type: { text: 'Replay Review' },
      text: 'The Replay Official reviewed the field goal ruling, and the play was REVERSED. Field goal no good.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false }
  ];
  const risk = NFLMap.boothScoreRisk(plays, 1, NFLMap.boothEvent(plays[1]));
  assert.strictEqual(risk.risk, 'removed');
  assert.strictEqual(risk.pointsRemoved, 3);
  assert.strictEqual(risk.scoringPlay.id, 'f1');
});

ok('boothEventContext: exposes scoreRisk, scoreRiskReason and the linked scoring play index', function () {
  const plays = [
    { id: 't1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'J.Banks 2 yard run, TOUCHDOWN.', awayScore: 0, homeScore: 7,
      scoringPlay: true, isPenalty: false },
    { id: 't2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 0, homeScore: 7,
      scoringPlay: false, isPenalty: false }
  ];
  const event = NFLMap.boothEventContext(NFLMap.boothEvent(plays[1]), plays, 1);
  assert.strictEqual(event.scoreRisk, 'possible');
  assert.ok(event.scoreRiskReason.indexOf('may be taken off') !== -1);
  assert.strictEqual(event.relatedScoringPlay.index, 0);
  assert.strictEqual(event.relatedScoringPlay.id, 't1');
});

ok('boothScoreRisk: null and out-of-range safety', function () {
  assert.deepStrictEqual(NFLMap.boothScoreRisk(null, 0), {
    risk: 'none', reason: '', scoringPlay: null,
    removesPoints: false, pointsRemoved: 0, team: ''
  });
  assert.strictEqual(NFLMap.boothScoreRisk([], -1).risk, 'none');
  assert.strictEqual(NFLMap.linkedScoringPlay(null, 0), null);
});

// 9. Day-wide booth feed (all games of a day, chat-style merge) ----------
ok('summarizeEvent: carries playByPlayAvailable through from the competition', function () {
  const ev = NFLMap.summarizeEvent(sample.event);
  assert.strictEqual(ev.playByPlayAvailable, true);
  // Missing field must not be invented: it maps to null, not false.
  const bare = { id: 'x', competitions: [{ competitors: [], status: { type: {} } }] };
  assert.strictEqual(NFLMap.summarizeEvent(bare).playByPlayAvailable, null);
});

ok('dayBoothFeed: merges each game\'s booth events with game attribution, in game order', function () {
  const eventsA = NFLMap.boothEvents(sample.summary.drives);
  const eventsB = [{
    id: '999001',
    seq: '1',
    kind: 'challenge',
    text: 'N.Kwon challenged the runner was down by contact ruling.',
    result: 'confirmed',
    heading: "Coach's challenge",
    quarter: 1,
    clock: '9:15',
    awayScore: 0,
    homeScore: 0,
    team: { abbr: 'SF', displayName: 'San Francisco 49ers', logo: '' }
  }];
  const feed = NFLMap.dayBoothFeed([
    { id: '401873286', shortName: 'LV @ HOU', awayAbbr: 'LV', homeAbbr: 'HOU', live: false, events: eventsA },
    { id: '401873299', shortName: 'SF @ LAC', awayAbbr: 'SF', homeAbbr: 'LAC', live: true, events: eventsB }
  ]);
  assert.strictEqual(feed.length, eventsA.length + eventsB.length);
  assert.strictEqual(feed[0].gameId, '401873286');
  assert.strictEqual(feed[0].shortName, 'LV @ HOU');
  assert.strictEqual(feed[0].key, '401873286:' + eventsA[0].id);
  assert.strictEqual(feed[0].liveGame, false);
  const last = feed[feed.length - 1];
  assert.strictEqual(last.gameId, '401873299');
  assert.strictEqual(last.shortName, 'SF @ LAC');
  assert.strictEqual(last.kind, 'challenge');
  assert.strictEqual(last.liveGame, true);
  assert.strictEqual(last.awayAbbr, 'SF');
  assert.strictEqual(last.homeAbbr, 'LAC');
});

ok('dayBoothFeed: dedupes the same play id, first occurrence wins', function () {
  const eventsA = NFLMap.boothEvents(sample.summary.drives);
  const feed = NFLMap.dayBoothFeed([
    { id: '401873286', shortName: 'LV @ HOU', events: eventsA },
    { id: '401873286', shortName: 'LV @ HOU', events: eventsA } // stale duplicate pass
  ]);
  assert.strictEqual(feed.length, eventsA.length);
  const keys = feed.map(function (e) { return e.key; });
  assert.strictEqual(new Set(keys).size, keys.length);
});

ok('dayBoothFeed: null-safety and missing play ids', function () {
  assert.deepStrictEqual(NFLMap.dayBoothFeed(null), []);
  assert.deepStrictEqual(NFLMap.dayBoothFeed([]), []);
  const feed = NFLMap.dayBoothFeed([
    { id: 'g1', shortName: 'A @ B', events: [{ id: null, seq: '2', kind: 'penalty', text: 'PENALTY on A' }] },
    { id: 'g1', shortName: 'A @ B', events: [{ id: null, seq: '2', kind: 'penalty', text: 'PENALTY on A' }] }
  ]);
  assert.strictEqual(feed.length, 1); // no-id plays dedupe on their fallback key
});

ok('reconcileDayBoothFeed: updates a review result in place and appends new plays', function () {
  const existing = [
    { key: 'g1:p1', result: 'pending', text: 'Play under review.' },
    { key: 'g1:p2', result: 'declined', text: 'Penalty declined.' }
  ];
  const fresh = [
    { key: 'g1:p1', result: 'overturned', text: 'The ruling was reversed.' },
    { key: 'g1:p3', result: 'confirmed', text: 'The ruling was confirmed.' }
  ];
  const merged = NFLMap.reconcileDayBoothFeed(existing, fresh);

  assert.deepStrictEqual(merged.map(function (e) { return e.key; }),
    ['g1:p1', 'g1:p2', 'g1:p3']);
  assert.strictEqual(merged[0].result, 'overturned');
  assert.strictEqual(merged[0].text, 'The ruling was reversed.');
  assert.strictEqual(merged[1].result, 'declined');
  assert.strictEqual(existing[0].result, 'pending'); // input array/items were not changed
});

ok('reconcileDayBoothFeed: null-safety', function () {
  assert.deepStrictEqual(NFLMap.reconcileDayBoothFeed(null, null), []);
  assert.deepStrictEqual(NFLMap.reconcileDayBoothFeed([], [{ key: 'g1:p1' }]),
    [{ key: 'g1:p1' }]);
});

console.log('\nAll ' + pass + ' mapping tests passed ✓');
