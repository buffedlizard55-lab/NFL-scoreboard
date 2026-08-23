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
  assert.strictEqual(plays.length, 11);
  assert.strictEqual(plays[0].type.text, 'Kickoff');
  assert.strictEqual(plays[0].sequenceNumber, '3900');
  assert.strictEqual(plays[10].sequenceNumber, '355600');
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
  assert.strictEqual(events.length, 6);
  assert.deepStrictEqual(events.map(function (e) { return e.kind; }),
    ['penalty', 'penalty', 'replay', 'challenge', 'review', 'penalty']);

  const last = {
    id: '4018732869005',
    text: 'Play under review.',
    type: { text: 'Pass Reception' },
    isPenalty: false
  };
  const withLive = NFLMap.boothEvents(sample.summary.drives, last);
  assert.strictEqual(withLive.length, 6);

  const resolvedLast = {
    id: '4018732869005',
    sequenceNumber: '8400',
    text: 'The replay official reviewed the ruling, and the play was REVERSED.',
    type: { text: 'Replay Review' },
    isPenalty: false
  };
  const withResolution = NFLMap.boothEvents(sample.summary.drives, resolvedLast);
  assert.strictEqual(withResolution.length, 6);
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
  assert.strictEqual(extra.length, 7);
  assert.strictEqual(extra[6].live, true);
  assert.strictEqual(extra[6].kind, 'review');
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

// 8a. Points at risk: a flag/review that COULD still remove points -------
ok('boothPointsAtRisk: a pending review right after a touchdown is at risk', function () {
  // The exact live moment: touchdown ruled, review open, ESPN has not
  // published any score drop yet. Nothing was removed yet — but 7 points
  // are on the board and could come off.
  const plays = [
    { id: 'p1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'D.Carter 3 yard run, TOUCHDOWN.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'p2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: false }
  ];
  const event = NFLMap.boothEventContext(NFLMap.boothEvent(plays[1]), plays, 1);
  assert.strictEqual(event.atRisk, true);
  assert.strictEqual(event.pointsAtRisk, 7);
  assert.strictEqual(event.atRiskTeam, 'away');
  assert.strictEqual(event.removesPoints, false);
  assert.strictEqual(event.relatedScoringPlay.id, 'p1');
  assert.strictEqual(event.relatedScoringPlay.text, 'D.Carter 3 yard run, TOUCHDOWN.');
});

ok('boothPointsAtRisk: cleared once the verdict takes the points off (removesPoints wins)', function () {
  const pending = [
    { id: 'p1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'D.Carter 3 yard run, TOUCHDOWN.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'p2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Play under review.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: false }
  ];
  const live = NFLMap.boothEventContext(NFLMap.boothEvent(pending[1]), pending, 1);
  assert.strictEqual(live.atRisk, true);

  const resolved = pending.concat([
    { id: 'p3', sequenceNumber: '300', type: { text: 'Replay Review' },
      text: 'The replay official reviewed the ruling, and the play was REVERSED. Runner short of the goal line.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false }
  ]);
  const after = NFLMap.boothEvents({ previous: [{ id: 'd', team: { abbreviation: 'LV' }, plays: resolved }] });
  assert.strictEqual(after[0].removesPoints, true);
  assert.strictEqual(after[0].atRisk, false); // completed rollback, not a possibility
  assert.strictEqual(after[1].removesPoints, true);
  assert.strictEqual(after[1].atRisk, false);
});

ok('boothPointsAtRisk: live under-review overlay without score fields is still at risk', function () {
  // A live situation.lastPlay often omits the running score; the risk scan
  // must not invent a drop, but must still see the fresh touchdown.
  const drives = { previous: [{ id: 'd', team: { abbreviation: 'LV' }, plays: [
    { id: 'p1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'D.Carter 3 yard run, TOUCHDOWN.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false }
  ] }] };
  const lastPlay = {
    id: 'live-1',
    text: 'Play under review.',
    type: { text: 'Pass Reception' },
    isPenalty: false
  };
  const events = NFLMap.boothEvents(drives, lastPlay);
  const live = events.filter(function (e) { return e.live; })[0];
  assert.ok(live);
  assert.strictEqual(live.atRisk, true);
  assert.strictEqual(live.pointsAtRisk, 7);
  assert.strictEqual(live.removesPoints, false);
});

ok('boothPointsAtRisk: a flag after a field goal is at risk until the drop publishes', function () {
  const pending = [
    { id: 'f1', sequenceNumber: '100', type: { text: 'Field Goal' },
      text: 'K.Matsuzawa 43 yard field goal is GOOD.', awayScore: 3, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'f2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on LV-T.Miller, Offensive Holding, 10 yards, enforced at LV 43 - No Play.',
      awayScore: 3, homeScore: 0, scoringPlay: false, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Offensive Holding' } } }
  ];
  const live = NFLMap.boothEventContext(NFLMap.boothEvent(pending[1]), pending, 1);
  assert.strictEqual(live.atRisk, true);
  assert.strictEqual(live.pointsAtRisk, 3);

  // The moment ESPN publishes the corrected running score, the at-risk flag
  // hands over to removesPoints.
  pending[1].awayScore = 0;
  const dropped = NFLMap.boothEventContext(NFLMap.boothEvent(pending[1]), pending, 1);
  assert.strictEqual(dropped.removesPoints, true);
  assert.strictEqual(dropped.pointsRemoved, 3);
  assert.strictEqual(dropped.atRisk, false);
});

ok('boothPointsAtRisk: settled-safe outcomes are never at risk', function () {
  const base = [
    { id: 's1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'K.Cole 4 yard TD run.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false }
  ];
  const cases = [
    { id: 's2', sequenceNumber: '200', type: { text: 'Pass Reception' },
      text: 'Houston challenged the ruling, and the play was Upheld.',
      awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 's2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on HOU-D.Thomas, Defensive Offside, 5 yards, declined.',
      awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: true },
    { id: 's2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on LV-X, Holding, 10 yards, Offset.',
      awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: true }
  ];
  cases.forEach(function (followUp) {
    const plays = base.concat([followUp]);
    const event = NFLMap.boothEventContext(NFLMap.boothEvent(followUp), plays, 1);
    assert.strictEqual(event.atRisk, false,
      'result "' + event.result + '" must settle the score');
    assert.strictEqual(event.removesPoints, false);
  });
});

ok('boothPointsAtRisk: the ensuing kickoff settles the score', function () {
  // Flags on the kickoff or the kick return can no longer remove the points
  // already on the board, so they must not light up the at-risk badge.
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
    { id: 'a4', sequenceNumber: '400', type: { text: 'Kick Return' },
      text: 'T.Saunders to HST 26 for 22 yards.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: false },
    { id: 'a5', sequenceNumber: '500', type: { text: 'Penalty' },
      text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const event = NFLMap.boothEventContext(NFLMap.boothEvent(plays[4]), plays, 4);
  assert.strictEqual(event.atRisk, false);
  assert.strictEqual(event.removesPoints, false);
});

ok('boothPointsAtRisk: only the first entries after a score are at risk', function () {
  // Exactly BOOTH_AT_RISK_LOOKBACK (now 6) entries after the score: still at
  // risk (e.g. the verdict entry of a review); one entry further: not.
  // The window was expanded from 3 to 6 to catch delayed booth reviews that
  // happen after the PAT, after a timeout, or after a couple of procedural
  // plays but still before the kickoff. The kickoff-settles rule prevents
  // false positives once the ball is kicked.
  const make = function (fillers) {
    const plays = [
      { id: 'b1', sequenceNumber: '100', type: { text: 'Rush' },
        text: 'K.Cole 4 yard TD run.', awayScore: 7, homeScore: 0,
        scoringPlay: true, isPenalty: false }
    ];
    for (let i = 0; i < fillers; i += 1) {
      plays.push({
        id: 'bf' + i, sequenceNumber: String(200 + i * 100), type: { text: 'Rush' },
        text: 'W.Marks left tackle for 2 yards.', awayScore: 7, homeScore: 0,
        scoringPlay: false, isPenalty: false
      });
    }
    plays.push({
      id: 'b9', sequenceNumber: '900', type: { text: 'Penalty' },
      text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 7, homeScore: 0,
      scoringPlay: false, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Holding' } }
    });
    return plays;
  };
  const lb = NFLMap.BOOTH_AT_RISK_LOOKBACK;
  const inWindow = NFLMap.boothEventContext(
    NFLMap.boothEvent(make(lb - 1)[lb]), make(lb - 1), lb); // score + (lb-1) fillers + flag = lb steps
  assert.strictEqual(inWindow.atRisk, true);
  const outOfWindow = NFLMap.boothEventContext(
    NFLMap.boothEvent(make(lb)[lb + 1]), make(lb), lb + 1); // one filler too far
  assert.strictEqual(outOfWindow.atRisk, false);
});

ok('boothPointsAtRisk: points already taken off by an earlier event are not at risk again', function () {
  const plays = [
    { id: 'c1', sequenceNumber: '100', type: { text: 'Rush' },
      text: 'K.Cole 4 yard TD run.', awayScore: 7, homeScore: 0,
      scoringPlay: true, isPenalty: false },
    { id: 'c2', sequenceNumber: '200', type: { text: 'Penalty' },
      text: 'PENALTY on LV-X, Offensive Holding, 10 yards, enforced at LV 25 - No Play.',
      awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: true,
      penalty: { yards: 10, type: { text: 'Offensive Holding' } } },
    { id: 'c3', sequenceNumber: '300', type: { text: 'Rush' },
      text: 'W.Marks left tackle for 2 yards.', awayScore: 0, homeScore: 0,
      scoringPlay: false, isPenalty: false },
    { id: 'c4', sequenceNumber: '400', type: { text: 'Penalty' },
      text: 'PENALTY on LV-Y, False Start, 5 yards.', awayScore: 0, homeScore: 0,
      scoringPlay: false, isPenalty: true,
      penalty: { yards: 5, type: { text: 'False Start' } } }
  ];
  const later = NFLMap.boothEventContext(NFLMap.boothEvent(plays[3]), plays, 3);
  assert.strictEqual(later.atRisk, false); // those 7 points are already gone
  assert.strictEqual(later.removesPoints, false);
});

ok('boothPointsAtRisk: null-safety and exported window constant', function () {
  assert.strictEqual(NFLMap.BOOTH_AT_RISK_LOOKBACK, 6);
  assert.deepStrictEqual(NFLMap.boothPointsAtRisk(null, null, 0, null), {
    atRisk: false, points: 0, team: '', scoringPlay: null
  });
  assert.deepStrictEqual(
    NFLMap.boothPointsAtRisk({ result: 'pending' }, [], 0, { removesPoints: false, during: { away: 0, home: 0 } }),
    { atRisk: false, points: 0, team: '', scoringPlay: null });
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

ok('boothEvent: carries verified red zone membership; fixture has exactly one red zone event', function () {
  const events = NFLMap.boothEvents(sample.summary.drives);
  const rz = events.filter(function (e) { return e.redZone; });
  assert.strictEqual(rz.length, 1);
  assert.strictEqual(rz[0].id, '4018732869007');
  assert.strictEqual(rz[0].kind, 'penalty');
  assert.strictEqual(rz[0].yardsToEndzone, 19);
  assert.strictEqual(rz[0].downDistance, '1st & 10 at HOU 19');

  // The other five fixture events sit outside the red zone.
  const others = events.filter(function (e) { return !e.redZone; });
  assert.strictEqual(others.length, 5);
  assert.deepStrictEqual(others.map(function (e) { return e.yardsToEndzone; }),
    [75, 80, 34, 34, 40]);
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
  assert.strictEqual(rz.length, 1);
  assert.strictEqual(rz[0].id, '4018732869007');
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


ok('isScoringPlay: extra point good is scoring, no good is not', function () {
  const good = { text: 'K.Matsuzawa extra point is GOOD.', type: { text: 'Extra Point' }, scoringPlay: false, isPenalty: false };
  const noGood = { text: 'K.Matsuzawa extra point is NO GOOD.', type: { text: 'Extra Point' }, scoringPlay: false, isPenalty: false };
  const blocked = { text: 'K.Matsuzawa extra point is BLOCKED.', type: { text: 'Extra Point' }, scoringPlay: false, isPenalty: false };
  // scoringPlay true is authoritative even for PAT
  const flaggedGood = { text: 'K.Matsuzawa extra point is GOOD.', type: { text: 'Extra Point' }, scoringPlay: true, isPenalty: false };
  assert.strictEqual(NFLMap.boothEvents({ previous: [{ id: 'd', team: { abbreviation: 'LV' }, plays: [good] }] }).length, 0, 'PAT good is not a booth event');
  // Direct isScoringPlay check via boothPointsAtRisk path: a PAT good followed by a flag should be at risk (1pt)
  // Need TD before PAT so points calculation is 1, not 7.
  const plays = [
    { id: 'td1', sequenceNumber: '50', type: { text: 'Rush' }, text: 'K.Cole 4 yard TD run.', awayScore: 6, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'pat1', sequenceNumber: '100', type: { text: 'Extra Point' }, text: 'K.Matsuzawa extra point is GOOD.', awayScore: 7, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'flag1', sequenceNumber: '200', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const ev = NFLMap.boothEventContext(NFLMap.boothEvent(plays[2]), plays, 2);
  assert.strictEqual(ev.atRisk, true);
  assert.strictEqual(ev.pointsAtRisk, 1);
});

ok('isScoringPlay: field goal no good / blocked is NOT scoring', function () {
  const good = { id: 'fg1', sequenceNumber: '100', type: { text: 'Field Goal' }, text: 'K.Matsuzawa 43 yard field goal is GOOD.', awayScore: 3, homeScore: 0, scoringPlay: true, isPenalty: false };
  const noGood = { id: 'fg2', sequenceNumber: '200', type: { text: 'Field Goal' }, text: 'K.Matsuzawa 43 yard field goal is NO GOOD.', awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false };
  const blocked = { id: 'fg3', sequenceNumber: '300', type: { text: 'Field Goal' }, text: 'K.Matsuzawa 43 yard field goal is BLOCKED.', awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false };
  // Good FG should be found as scoring play for a subsequent flag
  const playsGood = [
    good,
    { id: 'flag', sequenceNumber: '200', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 3, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const evGood = NFLMap.boothEventContext(NFLMap.boothEvent(playsGood[1]), playsGood, 1);
  assert.strictEqual(evGood.atRisk, true);
  assert.strictEqual(evGood.pointsAtRisk, 3);

  // No good FG should NOT be considered scoring, so a flag after it is not at risk
  const playsBad = [
    noGood,
    { id: 'flag2', sequenceNumber: '400', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const evBad = NFLMap.boothEventContext(NFLMap.boothEvent(playsBad[1]), playsBad, 1);
  assert.strictEqual(evBad.atRisk, false);
});

ok('isScoringPlay: two-point conversion good is scoring, failed is not', function () {
  const good2pt = { id: '2pt1', sequenceNumber: '100', type: { text: 'Two-Point Conversion' }, text: 'D.Carter rush for a two-point conversion is GOOD.', awayScore: 8, homeScore: 0, scoringPlay: true, isPenalty: false };
  const failed2pt = { id: '2pt2', sequenceNumber: '200', type: { text: 'Two-Point Conversion' }, text: 'Two-point pass incomplete.', awayScore: 6, homeScore: 0, scoringPlay: false, isPenalty: false };
  // Need TD 6pts before 2pt so points calc is 2, not 8
  const playsGood = [
    { id: 'td', sequenceNumber: '50', type: { text: 'Rush' }, text: 'K.Cole 4 yard TD run.', awayScore: 6, homeScore: 0, scoringPlay: true, isPenalty: false },
    good2pt,
    { id: 'flag', sequenceNumber: '200', type: { text: 'Penalty' }, text: 'PENALTY on LV-X, Holding, 10 yards.', awayScore: 8, homeScore: 0, scoringPlay: false, isPenalty: true, penalty: { yards: 10, type: { text: 'Holding' } } }
  ];
  const evGood = NFLMap.boothEventContext(NFLMap.boothEvent(playsGood[2]), playsGood, 2);
  assert.strictEqual(evGood.atRisk, true);
  assert.strictEqual(evGood.pointsAtRisk, 2);
});

ok('boothPointsAtRisk: TD under review in a single entry (current play is scoring)', function () {
  // ESPN sometimes publishes "TOUCHDOWN. Play under review." as one play.
  // That play is both scoringPlay true and review. It should be at risk
  // on itself.
  const plays = [
    { id: 'prev', sequenceNumber: '100', type: { text: 'Rush' }, text: 'W.Marks for 2 yards.', awayScore: 0, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'tdrev', sequenceNumber: '200', type: { text: 'Rush' }, text: 'D.Carter 3 yard run, TOUCHDOWN. Play under review.', awayScore: 7, homeScore: 0, scoringPlay: true, isPenalty: false }
  ];
  // The TD review entry is classified as review, but its scoringPlay flag is true,
  // so scoringPlayFromCurrent should find it.
  const ev = NFLMap.boothEvent(plays[1]);
  assert.strictEqual(ev.kind, 'review');
  const withCtx = NFLMap.boothEventContext(ev, plays, 1);
  assert.strictEqual(withCtx.atRisk, true);
  assert.strictEqual(withCtx.pointsAtRisk, 7);
  assert.strictEqual(withCtx.relatedScoringPlay.id, 'tdrev');
});

ok('boothPointsAtRisk: expanded window 6 catches delayed reviews after PAT and timeout', function () {
  // Sequence: TD, PAT good, timeout, procedural play, review – still before kickoff,
  // distance 4 after TD (within 6 but would have been outside old 3).
  const plays = [
    { id: 'td', sequenceNumber: '100', type: { text: 'Rush' }, text: 'K.Cole 4 yard TD run.', awayScore: 6, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'pat', sequenceNumber: '200', type: { text: 'Extra Point' }, text: 'K.Matsuzawa extra point is GOOD.', awayScore: 7, homeScore: 0, scoringPlay: true, isPenalty: false },
    { id: 'to', sequenceNumber: '300', type: { text: 'Timeout' }, text: 'Timeout #1 by LV.', awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'proc', sequenceNumber: '400', type: { text: 'Rush' }, text: 'W.Marks for 0 yards.', awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: false },
    { id: 'rev', sequenceNumber: '500', type: { text: 'Replay Review' }, text: 'Play under review.', awayScore: 7, homeScore: 0, scoringPlay: false, isPenalty: false }
  ];
  const ev = NFLMap.boothEventContext(NFLMap.boothEvent(plays[4]), plays, 4);
  assert.strictEqual(ev.atRisk, true, 'delayed review 4 plays after TD should be at risk with window 6');
  assert.strictEqual(ev.pointsAtRisk, 6, 'should still reference the original TD (6pts) not the PAT');
});


console.log('\nAll ' + pass + ' mapping tests passed ✓');
