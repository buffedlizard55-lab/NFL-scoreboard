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
  assert.strictEqual(plays.length, 12);
  assert.strictEqual(plays[0].type.text, 'Kickoff');
  assert.strictEqual(plays[0].sequenceNumber, '3900');
  assert.strictEqual(plays[11].sequenceNumber, '355600');
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
  assert.strictEqual(events.length, 7);
  assert.deepStrictEqual(events.map(function (e) { return e.kind; }),
    ['penalty', 'penalty', 'replay', 'challenge', 'review', 'penalty', 'penalty']);

  const last = {
    id: '4018732869005',
    text: 'Play under review.',
    type: { text: 'Pass Reception' },
    isPenalty: false
  };
  const withLive = NFLMap.boothEvents(sample.summary.drives, last);
  assert.strictEqual(withLive.length, 7);

  const resolvedLast = {
    id: '4018732869005',
    sequenceNumber: '8400',
    text: 'The replay official reviewed the ruling, and the play was REVERSED.',
    type: { text: 'Replay Review' },
    isPenalty: false
  };
  const withResolution = NFLMap.boothEvents(sample.summary.drives, resolvedLast);
  assert.strictEqual(withResolution.length, 7);
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
  assert.strictEqual(extra.length, 8);
  assert.strictEqual(extra[7].live, true);
  assert.strictEqual(extra[7].kind, 'review');
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

// 8a. Nullified scores: the only thing the risk/red-zone feeds track --------
// Every play string below is real ESPN/NFL play-by-play wording (Super Bowl
// LIX, event 401671889, and NFL gamebook excerpts) — nothing is invented.

ok('nullifiedScoreText: real "TOUCHDOWN NULLIFIED by Penalty" wording', function () {
  // Verbatim from ESPN's Super Bowl LIX play-by-play (defensive foul).
  assert.strictEqual(NFLMap.nullifiedScoreText(
    'C.Gardner-Johnson for 98 yards, TOUCHDOWN NULLIFIED by Penalty.PENALTY on ' +
    'PHI-J.Carter, Defensive Offside, 4 yards, enforced at PHI 36 - No Play.'), true);
  // Verbatim from the same game (offensive foul).
  assert.strictEqual(NFLMap.nullifiedScoreText(
    'P.Mahomes pass short left to M.Brown for 4 yards, TOUCHDOWN NULLIFIED by ' +
    'Penalty.PENALTY on KC-J.Smith-Schuster, Offensive Pass Interference, 10 ' +
    'yards, enforced at PHI 4 - No Play.'), true);
  // Gamebook variant with no punctuation between "Penalty" and "PENALTY":
  // the detector must not depend on the punctuation.
  assert.strictEqual(NFLMap.nullifiedScoreText(
    'TOUCHDOWN NULLIFIED by Penalty PENALTY on NE-R.Gronkowski, Illegal Touch ' +
    'Pass, 5 yards, enforced at NYJ 14 - No Play.'), true);
});

ok('nullifiedScoreText: a replay REVERSAL of a touchdown (no NULLIFIED token)', function () {
  // Verbatim from Super Bowl LIX: the TD was wiped by review, and ESPN never
  // writes the word "nullified" on this shape. This is the case the Red Zone
  // tab must still catch.
  assert.strictEqual(NFLMap.nullifiedScoreText(
    '(Shotgun) J.Hurts pass deep right to J.Dotson for 28 yards, TOUCHDOWN.The ' +
    'Replay Official reviewed the runner broke the plane ruling, and the play ' +
    'was REVERSED.(Shotgun) J.Hurts pass deep right to J.Dotson to KC 1 for 27 ' +
    'yards (J.Watson).'), true);
  assert.strictEqual(NFLMap.nullifiedScoreText(
    'The replay official reviewed the ruling, and the field goal was OVERTURNED.'), true);
});

ok('nullifiedScoreText: field goal, extra point and 2-point conversion wiped', function () {
  assert.strictEqual(NFLMap.nullifiedScoreText(
    'K.Matsuzawa 43 yard field goal is GOOD.PENALTY on LV-T.Miller, Offensive ' +
    'Holding, 10 yards, enforced at LV 43 - No Play.'), true);
  assert.strictEqual(NFLMap.nullifiedScoreText(
    'H.Butker extra point is GOOD, EXTRA POINT NULLIFIED by Penalty.'), true);
  assert.strictEqual(NFLMap.nullifiedScoreText(
    'TWO-POINT CONVERSION ATTEMPT. J.Goff pass to T.Decker is complete. ' +
    'ATTEMPT SUCCEEDS NULLIFIED by Penalty.'), true);
  assert.strictEqual(NFLMap.nullifiedScoreText(
    'J.Allen 2-point conversion run.PENALTY on BUF, Illegal Formation, 5 yards, ' +
    'enforced at KC 2 - No Play.'), true);
});

ok('nullifiedScoreText: ordinary flags, reviews and scores are NOT nullifications', function () {
  const notNullified = [
    // An ordinary touchdown.
    'D.Carter 3 yard run, TOUCHDOWN.',
    // A "- No Play" penalty on a play that never scored.
    'PENALTY on PHI-A.Brown, Offensive Pass Interference, 10 yards, enforced at 50 - No Play.',
    'PENALTY on LV-Y, False Start, 5 yards, enforced at LV 25 - No Play.',
    // A pending review carries no verdict at all.
    'Play under review.',
    // A verdict that KEPT the score.
    'Houston challenged the ruling, and the play was Upheld.',
    'The replay official reviewed the ruling, and the ruling on the field stands.',
    // A declined flag after a score.
    'PENALTY on HOU-D.Thomas, Defensive Offside, 5 yards, declined.',
    // A reversal on a non-scoring play.
    'The replay official reviewed the pass completion ruling, and the play was REVERSED. Pass incomplete.',
    ''
  ];
  notNullified.forEach(function (text) {
    assert.strictEqual(NFLMap.nullifiedScoreText(text), false,
      'must not be a nullification: ' + text);
  });
  assert.strictEqual(NFLMap.nullifiedScoreText(null), false);
  assert.strictEqual(NFLMap.nullifiedScoreText(undefined), false);
});

ok('boothEventNullifies: a published score drop is a nullification on its own', function () {
  // removesPoints is authoritative even when the wording says nothing.
  assert.strictEqual(NFLMap.boothEventNullifies(
    { removesPoints: true, pointsRemoved: 7, text: 'PENALTY on LV-X, Holding, 10 yards.' }), true);
  assert.strictEqual(NFLMap.boothEventNullifies(
    { removesPoints: false, text: 'PENALTY on LV-X, Holding, 10 yards.' }), false);
  assert.strictEqual(NFLMap.boothEventNullifies(null), false);
});

ok('boothEvent/boothEventContext: a nullified touchdown carries nullified = true', function () {
  const plays = [
    { id: 'n1', sequenceNumber: '100', type: { text: 'Penalty' },
      text: 'C.Gardner-Johnson for 98 yards, TOUCHDOWN NULLIFIED by Penalty.' +
        'PENALTY on PHI-J.Carter, Defensive Offside, 4 yards, enforced at PHI 36 - No Play.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: true,
      penalty: { yards: 4, type: { text: 'Defensive Offside' } },
      start: { yardsToEndzone: 8, downDistanceText: '1st & Goal at KC 8' } }
  ];
  // Text-only verdict, before any score context is applied.
  assert.strictEqual(NFLMap.boothEvent(plays[0]).nullified, true);
  // And after enrichment, with the running score unchanged (ESPN never
  // counted the points, so removesPoints stays false).
  const event = NFLMap.boothEventContext(NFLMap.boothEvent(plays[0]), plays, 0);
  assert.strictEqual(event.nullified, true);
  assert.strictEqual(event.removesPoints, false);
  assert.strictEqual(event.redZone, true); // 8 yards out — inside the 20
});

ok('boothEventContext: an ordinary flag is not nullified and never reaches the feeds', function () {
  const plays = [
    { id: 'o1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'K.Cole 4 yard run.', awayScore: 0, homeScore: 0,
      scoringPlay: false, isPenalty: false },
    { id: 'o2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on LV-Y, False Start, 5 yards, enforced at LV 25 - No Play.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: true,
      penalty: { yards: 5, type: { text: 'False Start' } } }
  ];
  const event = NFLMap.boothEventContext(NFLMap.boothEvent(plays[1]), plays, 1);
  assert.strictEqual(event.nullified, false);
  assert.strictEqual(event.removesPoints, false);
});

ok('boothEventContext: a pending review after a touchdown is NOT a nullification yet', function () {
  // The old "points at risk" feature lit this up; it is gone. Nothing has
  // come off the board, so nothing is reported until the verdict arrives.
  const plays = [
    { id: 'p1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'D.Carter 3 yard run, TOUCHDOWN.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'p2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: false }
  ];
  const pending = NFLMap.boothEventContext(NFLMap.boothEvent(plays[1]), plays, 1);
  assert.strictEqual(pending.nullified, false);
  assert.strictEqual(pending.removesPoints, false);
  // The verdict lands and the score drops: now both entries report it.
  const resolved = plays.concat([
    { id: 'p3', sequenceNumber: '300', type: { text: 'Replay Review' },
      text: 'The replay official reviewed the ruling, and the play was REVERSED. Runner short of the goal line.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false }
  ]);
  const events = NFLMap.boothEvents({ previous: [{ id: 'd', team: { abbreviation: 'LV' }, plays: resolved }] });
  assert.strictEqual(events[0].removesPoints, true);
  assert.strictEqual(events[0].nullified, true);
  assert.strictEqual(events[1].removesPoints, true);
  assert.strictEqual(events[1].nullified, true);
});

ok('boothEventContext: a flag on the ensuing kickoff is not a nullification', function () {
  const plays = [
    { id: 'a1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'K.Cole 4 yard TD run.', awayScore: 6, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'a2', sequenceNumber: '200', type: { text: 'Extra Point' },
      text: 'K.Matsuzawa extra point is good.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'a3', sequenceNumber: '300', type: { text: 'Kickoff' },
      text: 'K.Matsuzawa kicks 65 yards.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: false },
    { id: 'a4', sequenceNumber: '400', type: { text: 'Penalty' },
      text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const event = NFLMap.boothEventContext(NFLMap.boothEvent(plays[3]), plays, 3);
  assert.strictEqual(event.nullified, false);
  assert.strictEqual(event.removesPoints, false);
});

ok('boothEventContext: a published score drop is reported even without nullified wording', function () {
  const plays = [
    { id: 'f1', sequenceNumber: '100', type: { text: 'Field Goal' },
      text: 'K.Matsuzawa 43 yard field goal is GOOD.', awayScore: 3, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'f2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on LV-T.Miller, Offensive Holding, 10 yards, enforced at LV 43.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Offensive Holding' } } }
  ];
  const event = NFLMap.boothEventContext(NFLMap.boothEvent(plays[1]), plays, 1);
  assert.strictEqual(event.removesPoints, true);
  assert.strictEqual(event.pointsRemoved, 3);
  assert.strictEqual(event.nullified, true);
});

ok('points-at-risk is fully removed from the mapping surface', function () {
  assert.strictEqual(NFLMap.boothPointsAtRisk, undefined);
  assert.strictEqual(NFLMap.BOOTH_AT_RISK_LOOKBACK, undefined);
  assert.strictEqual(NFLMap.BOOTH_SAFE_RESULTS, undefined);
  const plays = [
    { id: 'z1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'D.Carter 3 yard run, TOUCHDOWN.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'z2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: false }
  ];
  const event = NFLMap.boothEventContext(NFLMap.boothEvent(plays[1]), plays, 1);
  assert.strictEqual(event.atRisk, undefined);
  assert.strictEqual(event.pointsAtRisk, undefined);
  assert.strictEqual(event.atRiskTeam, undefined);
});
// 8b. Red zone location (verified against real play fields) ----------------
ok('isRedZonePlay: primary signal is start.yardsToEndzone (distance to driven end zone)', function () {
  // Real play shapes from event 401873286: "1st & 10 at HOU 19" (LV offense)
  // carries yardsToEndzone 19; "1st & 10 at LV 19" (LV on its OWN 19, driving
  // the other way) carries 81.
  assert.strictEqual(NFLMap.isRedZonePlay({
    start: { yardsToEndzone: 19, downDistanceText: '1st & 10 at HOU 19', possessionText: 'HOU 19' }
  }), true);
  assert.strictEqual(NFLMap.yardsToEndzone({
    start: { yardsToEndzone: 19, downDistanceText: '1st & 10 at HOU 19', possessionText: 'HOU 19' }
  }), 19);
  assert.strictEqual(NFLMap.isRedZonePlay({
    start: { yardsToEndzone: 81, downDistanceText: '1st & 10 at LV 19', possessionText: 'LV 19' }
  }), false);
  assert.strictEqual(NFLMap.isRedZonePlay({
    start: { yardsToEndzone: 64, downDistanceText: '1st & 10 at LV 36', possessionText: 'LV 36' }
  }), false);
  // The red zone is the opponent's 20 or inside: exactly 20 counts, 21 does not.
  assert.strictEqual(NFLMap.isRedZonePlay({ start: { yardsToEndzone: 20 } }), true);
  assert.strictEqual(NFLMap.isRedZonePlay({ start: { yardsToEndzone: 21 } }), false);
});

ok('isRedZonePlay: 0 is a sentinel (timeouts / end-of-period), not "at the end zone"', function () {
  // Real official-timeout play: yardsToEndzone 0 but downDistanceText says "Goal".
  assert.strictEqual(NFLMap.isRedZonePlay({
    start: { yardsToEndzone: 0, downDistanceText: ' & Goal at HOU 15', possessionText: 'HOU 15' }
  }), true);
  // Real two-minute-warning play: yardsToEndzone 0, plain "at HOU 47" wording,
  // HOU on offense -> 53 yards to go, not the red zone.
  const hou = { team: { abbreviation: 'HOU' } };
  assert.strictEqual(NFLMap.isRedZonePlay({
    start: { yardsToEndzone: 0, downDistanceText: '1st & 10 at HOU 47', possessionText: 'HOU 47' }
  }, hou), false);
});

ok('isRedZonePlay: "Goal" wording is a fallback when yardsToEndzone is absent', function () {
  assert.strictEqual(NFLMap.yardsToEndzone({
    start: { downDistanceText: '1st & Goal at HOU 4', possessionText: 'HOU 4' }
  }), NFLMap.RED_ZONE_DISTANCE);
  assert.strictEqual(NFLMap.isRedZonePlay({
    start: { downDistanceText: ' & Goal at HOU 15', possessionText: 'HOU 15' }
  }), true);
  // Plain wording is not treated as goal-to-go.
  assert.strictEqual(NFLMap.isRedZonePlay({
    start: { downDistanceText: '1st & 10 at HOU 40', possessionText: 'HOU 40' }
  }, { team: { abbreviation: 'LV' } }), false);
});

ok('isRedZonePlay: possessionText fallback resolves which way the offense is driving', function () {
  // possessionText names the nearer goal line. LV offense at "HOU 19" drives
  // TOWARD the HOU line (19 yds); LV offense at "LV 19" drives AWAY (81 yds);
  // HOU offense at "LV 41" drives TOWARD the LV line (41 yds). All three
  // match the yardsToEndzone values ESPN reported for the same real spots.
  const lv = { team: { abbreviation: 'LV' } };
  const hou = { team: { abbreviation: 'HOU' } };
  assert.strictEqual(NFLMap.yardsToEndzone({
    start: { downDistanceText: '1st & 10 at HOU 19', possessionText: 'HOU 19' }
  }, lv), 19);
  assert.strictEqual(NFLMap.yardsToEndzone({
    start: { downDistanceText: '1st & 10 at LV 19', possessionText: 'LV 19' }
  }, lv), 81);
  assert.strictEqual(NFLMap.yardsToEndzone({
    start: { downDistanceText: '1st & 10 at LV 41', possessionText: 'LV 41' }
  }, hou), 41);
  assert.strictEqual(NFLMap.isRedZonePlay({
    start: { downDistanceText: '1st & 10 at HOU 19', possessionText: 'HOU 19' }
  }, lv), true);
  assert.strictEqual(NFLMap.isRedZonePlay({
    start: { downDistanceText: '1st & 10 at LV 19', possessionText: 'LV 19' }
  }, lv), false);
});

ok('isRedZonePlay: never guesses when no field establishes the distance', function () {
  assert.strictEqual(NFLMap.yardsToEndzone({ start: { downDistanceText: '1st & 10 at HOU 19', possessionText: 'HOU 19' } }), null);
  assert.strictEqual(NFLMap.isRedZonePlay({ start: { downDistanceText: '1st & 10 at HOU 19', possessionText: 'HOU 19' } }), false);
  assert.strictEqual(NFLMap.isRedZonePlay({ start: {} }), false);
  assert.strictEqual(NFLMap.isRedZonePlay(null), false);
  assert.strictEqual(NFLMap.yardsToEndzone(null), null);
});

ok('boothEvent: carries verified red zone membership; fixture has two red zone events', function () {
  const events = NFLMap.boothEvents(sample.summary.drives);
  const rz = events.filter(function (e) { return e.redZone; });
  assert.strictEqual(rz.length, 2);
  assert.strictEqual(rz[0].id, '4018732869007');
  assert.strictEqual(rz[0].kind, 'penalty');
  assert.strictEqual(rz[0].yardsToEndzone, 19);
  assert.strictEqual(rz[0].downDistance, '1st & 10 at HOU 19');
  // An ordinary red-zone false start: in the red zone, but it wiped no score.
  assert.strictEqual(rz[0].nullified, false);

  // The fixture's nullified red-zone touchdown, in ESPN's published wording.
  assert.strictEqual(rz[1].id, '4018732869008');
  assert.strictEqual(rz[1].kind, 'penalty');
  assert.strictEqual(rz[1].yardsToEndzone, 14);
  assert.strictEqual(rz[1].downDistance, '1st & 15 at HOU 14');
  assert.strictEqual(rz[1].nullified, true);

  // The other five fixture events sit outside the red zone.
  const others = events.filter(function (e) { return !e.redZone; });
  assert.strictEqual(others.length, 5);
  assert.deepStrictEqual(others.map(function (e) { return e.yardsToEndzone; }),
    [75, 80, 34, 34, 40]);
  assert.deepStrictEqual(others.map(function (e) { return e.nullified; }),
    [false, false, false, false, false]);
});

ok('the Red Zone tab keeps a nullified touchdown and drops plain red-zone flags', function () {
  // This is the regression the tab exists for: a red-zone touchdown wiped by
  // an accepted foul must survive the nullified-only filter, while the
  // red-zone false start next to it must not.
  const events = NFLMap.boothEvents(sample.summary.drives);
  const shown = events.filter(function (e) {
    return e.redZone && NFLMap.boothEventNullifies(e);
  });
  assert.strictEqual(shown.length, 1);
  assert.strictEqual(shown[0].id, '4018732869008');
  assert.ok(shown[0].text.indexOf('TOUCHDOWN NULLIFIED by Penalty') !== -1);
});

ok('boothEvents: a live last play without position data is not marked red zone', function () {
  const last = {
    id: 'live-rz',
    text: 'PENALTY on LV-X, False Start, 5 yards, enforced at HST 10 - No Play.',
    type: { text: 'Penalty' },
    isPenalty: true,
    penalty: { yards: 5, type: { text: 'False Start' } }
  };
  const events = NFLMap.boothEvents(sample.summary.drives, last);
  const liveEv = events.filter(function (e) { return e.live; })[0];
  assert.ok(liveEv);
  assert.strictEqual(liveEv.redZone, false);
  assert.strictEqual(liveEv.yardsToEndzone, null);
});

ok('dayBoothFeed: red zone membership survives the merge', function () {
  const eventsA = NFLMap.boothEvents(sample.summary.drives);
  const feed = NFLMap.dayBoothFeed([
    { id: '401873286', shortName: 'LV @ HOU', events: eventsA }
  ]);
  const rz = feed.filter(function (e) { return e.redZone; });
  assert.strictEqual(rz.length, 2);
  assert.deepStrictEqual(rz.map(function (e) { return e.id; }),
    ['4018732869007', '4018732869008']);
  // And so does the nullified verdict the all-games Red zone chip counts.
  const shown = rz.filter(function (e) { return NFLMap.boothEventNullifies(e); });
  assert.deepStrictEqual(shown.map(function (e) { return e.id; }), ['4018732869008']);
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


// 9. isScoringPlay, seen through the nearest-score lookup -------------------
// boothEventContext captions a removal with nearestScoringPlay(), so these
// cases pin down which plays count as scores. (The old "points at risk"
// readings of the same fixtures are gone — nothing is at risk any more, only
// nullified.)

ok('isScoringPlay: extra point good is scoring, no good is not', function () {
  // A clean PAT is not a booth event at all — no flag, no review.
  const good = { text: 'K.Matsuzawa extra point is GOOD.', type: { text: 'Extra Point' }, scoringPlay: false, isPenalty: false };
  assert.strictEqual(NFLMap.boothEvents({ previous: [{ id: 'd', team: { abbreviation: 'LV' }, plays: [good] }] }).length, 0, 'PAT good is not a booth event');

  // TD then PAT then a flag: the nearest score is the 1-point PAT, not the TD.
  const plays = [
    { id: 'td1', sequenceNumber: '50', type: { text: 'Rush' }, text: 'K.Cole 4 yard TD run.', awayScore: 6, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'pat1', sequenceNumber: '100', type: { text: 'Extra Point' }, text: 'K.Matsuzawa extra point is GOOD.', awayScore: 7, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'flag1', sequenceNumber: '200', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const ev = NFLMap.boothEventContext(NFLMap.boothEvent(plays[2]), plays, 2);
  assert.strictEqual(ev.relatedScoringPlay.id, 'pat1');
  assert.strictEqual(ev.relatedScoringPlay.points, 1);
  // The points are still on the board, so this flag is not a nullification.
  assert.strictEqual(ev.removesPoints, false);
  assert.strictEqual(ev.nullified, false);

  // A PAT that missed is not a score, so a later flag finds nothing.
  const noGood = [
    { id: 'pat2', sequenceNumber: '100', type: { text: 'Extra Point' }, text: 'K.Matsuzawa extra point is NO GOOD.', awayScore: 6, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'flag2', sequenceNumber: '200', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 6, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const evNoGood = NFLMap.boothEventContext(NFLMap.boothEvent(noGood[1]), noGood, 1);
  assert.strictEqual(evNoGood.relatedScoringPlay, null);
  assert.strictEqual(evNoGood.nullified, false);
});

ok('isScoringPlay: field goal no good / blocked is NOT scoring', function () {
  // Good FG is found as the nearest score for a subsequent flag.
  const playsGood = [
    { id: 'fg1', sequenceNumber: '100', type: { text: 'Field Goal' }, text: 'K.Matsuzawa 43 yard field goal is GOOD.', awayScore: 3, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'flag', sequenceNumber: '200', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 3, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const evGood = NFLMap.boothEventContext(NFLMap.boothEvent(playsGood[1]), playsGood, 1);
  assert.strictEqual(evGood.relatedScoringPlay.id, 'fg1');
  assert.strictEqual(evGood.relatedScoringPlay.points, 3);
  assert.strictEqual(evGood.nullified, false, 'the 3 points are still on the board');

  // A missed FG is not scoring, so there is nothing behind the flag.
  const playsBad = [
    { id: 'fg2', sequenceNumber: '200', type: { text: 'Field Goal' }, text: 'K.Matsuzawa 43 yard field goal is NO GOOD.', awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'flag2', sequenceNumber: '400', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const evBad = NFLMap.boothEventContext(NFLMap.boothEvent(playsBad[1]), playsBad, 1);
  assert.strictEqual(evBad.relatedScoringPlay, null);
  assert.strictEqual(evBad.nullified, false);

  // Nor is a blocked FG.
  const playsBlocked = [
    { id: 'fg3', sequenceNumber: '300', type: { text: 'Field Goal' }, text: 'K.Matsuzawa 43 yard field goal is BLOCKED.', awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'flag3', sequenceNumber: '400', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const evBlocked = NFLMap.boothEventContext(NFLMap.boothEvent(playsBlocked[1]), playsBlocked, 1);
  assert.strictEqual(evBlocked.relatedScoringPlay, null);
  assert.strictEqual(evBlocked.nullified, false);
});

ok('isScoringPlay: two-point conversion good is scoring, failed is not', function () {
  // TD 6 then a successful 2-pointer: the nearest score is worth 2, not 8.
  const playsGood = [
    { id: 'td', sequenceNumber: '50', type: { text: 'Rush' }, text: 'K.Cole 4 yard TD run.', awayScore: 6, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: '2pt1', sequenceNumber: '100', type: { text: 'Two-Point Conversion' }, text: 'D.Carter rush for a two-point conversion is GOOD.', awayScore: 8, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'flag', sequenceNumber: '200', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 8, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const evGood = NFLMap.boothEventContext(NFLMap.boothEvent(playsGood[2]), playsGood, 2);
  assert.strictEqual(evGood.relatedScoringPlay.id, '2pt1');
  assert.strictEqual(evGood.relatedScoringPlay.points, 2);
  assert.strictEqual(evGood.nullified, false);

  // A failed try is skipped; the lookup falls back to the touchdown.
  const playsFailed = [
    { id: 'td', sequenceNumber: '50', type: { text: 'Rush' }, text: 'K.Cole 4 yard TD run.', awayScore: 6, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: '2pt2', sequenceNumber: '200', type: { text: 'Two-Point Conversion' }, text: 'Two-point pass incomplete.', awayScore: 6, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'flag', sequenceNumber: '300', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 6, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const evFailed = NFLMap.boothEventContext(NFLMap.boothEvent(playsFailed[2]), playsFailed, 2);
  assert.strictEqual(evFailed.relatedScoringPlay.id, 'td');
  assert.strictEqual(evFailed.relatedScoringPlay.points, 6);
  assert.strictEqual(evFailed.nullified, false);
});

ok('a nullified 2-point try and a nullified PAT are both caught by text', function () {
  const plays = [
    { id: 'td', sequenceNumber: '50', type: { text: 'Rush' }, text: 'K.Cole 4 yard TD run.', awayScore: 6, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'pat', sequenceNumber: '100', type: { text: 'Extra Point' },
      text: 'H.Butker extra point is GOOD, EXTRA POINT NULLIFIED by Penalty.PENALTY on ' +
        'KC-C.Humphrey, Offensive Holding, 10 yards, enforced at PHI 15 - No Play.',
      awayScore: 6, homeScore: 0, scoringPlay: false, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Offensive Holding' } } }
  ];
  const ev = NFLMap.boothEventContext(NFLMap.boothEvent(plays[1]), plays, 1);
  assert.strictEqual(ev.nullified, true);
  // ESPN never published the point, so no score drop is required for this.
  assert.strictEqual(ev.removesPoints, false);
});

ok('a TD and its review published as one play: nothing is nullified until the verdict', function () {
  // ESPN sometimes publishes "TOUCHDOWN. Play under review." as one play.
  // The old feed flagged 7 "points at risk" here; that feature is gone. The
  // points are still on the board, so the feeds stay quiet.
  const plays = [
    { id: 'prev', sequenceNumber: '100', type: { text: 'Rush' }, text: 'W.Marks for 2 yards.', awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'tdrev', sequenceNumber: '200', type: { text: 'Rush' }, text: 'D.Carter 3 yard run, TOUCHDOWN. Play under review.', awayScore: 7, homeScore: 0, scoringPlay: true, isPenalty: false }
  ];
  const ev = NFLMap.boothEvent(plays[1]);
  assert.strictEqual(ev.kind, 'review');
  assert.strictEqual(ev.nullified, false);
  const withCtx = NFLMap.boothEventContext(ev, plays, 1);
  assert.strictEqual(withCtx.nullified, false);
  assert.strictEqual(withCtx.removesPoints, false);

  // Same entry, but the verdict wiped the score: the running score drops and
  // the entry is reported.
  const wiped = plays.concat([
    { id: 'verdict', sequenceNumber: '300', type: { text: 'Replay Review' },
      text: 'The Replay Official reviewed the runner broke the plane ruling, and the play was REVERSED.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false }
  ]);
  const resolved = NFLMap.boothEventContext(NFLMap.boothEvent(wiped[1]), wiped, 1);
  assert.strictEqual(resolved.removesPoints, true);
  assert.strictEqual(resolved.pointsRemoved, 7);
  assert.strictEqual(resolved.nullified, true);
});

ok('a delayed review after a PAT and a timeout only reports once points come off', function () {
  // Sequence: TD, PAT good, timeout, procedural play, review — the review is
  // 4 plays after the touchdown. Nothing has been taken off the board yet.
  const plays = [
    { id: 'td', sequenceNumber: '100', type: { text: 'Rush' }, text: 'K.Cole 4 yard TD run.', awayScore: 6, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'pat', sequenceNumber: '200', type: { text: 'Extra Point' }, text: 'K.Matsuzawa extra point is GOOD.', awayScore: 7, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'to', sequenceNumber: '300', type: { text: 'Timeout' }, text: 'Timeout #1 by LV.', awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'proc', sequenceNumber: '400', type: { text: 'Rush' }, text: 'W.Marks for 0 yards.', awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'rev', sequenceNumber: '500', type: { text: 'Replay Review' }, text: 'Play under review.', awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: false }
  ];
  const quiet = NFLMap.boothEventContext(NFLMap.boothEvent(plays[4]), plays, 4);
  assert.strictEqual(quiet.nullified, false, 'a pending review removes nothing');
  assert.strictEqual(quiet.removesPoints, false);

  // The verdict arrives and the score falls 7 -> 0: now it is a nullification.
  const settled = plays.concat([
    { id: 'out', sequenceNumber: '600', type: { text: 'Replay Review' },
      text: 'The replay official reviewed the ruling, and the play was REVERSED.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false }
  ]);
  const ev = NFLMap.boothEventContext(NFLMap.boothEvent(settled[4]), settled, 4);
  assert.strictEqual(ev.removesPoints, true);
  assert.strictEqual(ev.pointsRemoved, 7);
  assert.strictEqual(ev.nullified, true);
});


console.log('\nAll ' + pass + ' mapping tests passed ✓');
