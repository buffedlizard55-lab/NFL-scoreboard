/* ------------------------------------------------------------------------- *
 * NFLMap — pure data-mapping helpers for ESPN Gamecast web endpoint payloads.
 *
 * These functions only reshape data; they never fetch. Keeping them pure
 * lets us unit-test them in Node (test/mapping.test.js) and reuse them in
 * the browser (window.NFLMap).
 *
 * Verified against the real API responses for event 401873286
 * (Las Vegas Raiders at Houston Texans, 2026 preseason week 2).
 * ------------------------------------------------------------------------- */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NFLMap = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function hex(color, fallback) {
    if (!color) return fallback || '#8a8a8a';
    return String(color).charAt(0) === '#' ? String(color) : '#' + String(color);
  }

  function getCompetition(event) {
    if (!event) return null;
    const comps = event.competitions;
    return comps && comps.length ? comps[0] : null;
  }

  function teamBasics(team) {
    if (!team) return null;
    return {
      id: team.id,
      abbr: team.abbreviation || '',
      displayName: team.displayName || '',
      shortName: team.shortDisplayName || team.name || '',
      location: team.location || '',
      name: team.name || '',
      color: hex(team.color),
      altColor: hex(team.alternateColor, '#ffffff'),
      logo: team.logo || '',
      slug: team.slug || ''
    };
  }

  function competitors(competition) {
    const list = (competition && competition.competitors) || [];
    let home = null;
    let away = null;
    list.forEach(function (c) {
      const entry = Object.assign({}, teamBasics(c.team), {
        homeAway: c.homeAway,
        winner: !!c.winner,
        score: c.score != null ? String(c.score) : '',
        linescores: Array.isArray(c.linescores) ? c.linescores : [],
        records: Array.isArray(c.records) ? c.records : [],
        statistics: Array.isArray(c.statistics) ? c.statistics : []
      });
      if (c.homeAway === 'home') home = entry;
      else if (c.homeAway === 'away') away = entry;
    });
    return { home: home, away: away };
  }

  function statusInfo(competition) {
    const status = (competition && competition.status) || {};
    const type = status.type || {};
    return {
      state: type.state || 'pre',
      name: type.name || '',
      detail: type.detail || '',
      shortDetail: type.shortDetail || '',
      description: type.description || '',
      completed: !!type.completed,
      clock: status.displayClock != null ? status.displayClock : '',
      period: status.period != null ? status.period : null
    };
  }

  function broadcast(competition) {
    if (!competition) return '';
    if (competition.broadcast) return competition.broadcast;
    const gb = competition.geoBroadcasts || [];
    for (let i = 0; i < gb.length; i++) {
      const g = gb[i];
      if (g && g.market && g.market.type === 'National' && g.media) {
        return g.media.shortName || '';
      }
    }
    const b = competition.broadcasts || [];
    if (b.length && Array.isArray(b[0].names)) {
      return b[0].names.join(', ');
    }
    return '';
  }

  function venue(competition) {
    const v = (competition && competition.venue) || null;
    if (!v) return null;
    return {
      fullName: v.fullName || '',
      city: (v.address && v.address.city) || '',
      state: (v.address && v.address.state) || '',
      indoor: !!v.indoor
    };
  }

  function summarizeEvent(event) {
    const comp = getCompetition(event);
    if (!comp) return null;
    const teams = competitors(comp);
    return {
      id: event.id,
      name: event.name || '',
      shortName: event.shortName || '',
      date: event.date || comp.date || null,
      week: (event.week && event.week.number != null) ? event.week.number : null,
      home: teams.home,
      away: teams.away,
      status: statusInfo(comp),
      venue: venue(comp),
      attendance: comp.attendance != null ? comp.attendance : null,
      broadcast: broadcast(comp),
      situation: comp.situation || null,
      playByPlayAvailable: comp.playByPlayAvailable != null ? comp.playByPlayAvailable : null,
      notes: comp.notes || [],
      leaders: comp.leaders || []
    };
  }

  function venueFromGameInfo(gi) {
    if (!gi || !gi.venue) return null;
    return {
      fullName: gi.venue.fullName || '',
      city: (gi.venue.address && gi.venue.address.city) || '',
      state: (gi.venue.address && gi.venue.address.state) || '',
      indoor: !!gi.venue.indoor,
      capacity: gi.venue.capacity || null
    };
  }

  function summaryInfo(summary) {
    if (!summary) return null;
    const header = (summary.header &&
      summary.header.competitions &&
      summary.header.competitions[0]) || null;
    const teams = competitors(header);
    const attendance = (header && header.attendance != null)
      ? header.attendance
      : (summary.gameInfo && summary.gameInfo.attendance != null ? summary.gameInfo.attendance : null);
    return {
      home: teams.home,
      away: teams.away,
      status: statusInfo(header),
      venue: venue(header) || venueFromGameInfo(summary.gameInfo),
      attendance: attendance,
      officials: (summary.gameInfo && summary.gameInfo.officials) || [],
      weather: (summary.gameInfo && summary.gameInfo.weather) || null
    };
  }

  function teamStatsTables(boxscoreTeams) {
    return (boxscoreTeams || []).map(function (t) {
      const stats = {};
      (t.statistics || []).forEach(function (s) {
        stats[s.name] = (s.displayValue != null && s.displayValue !== '')
          ? String(s.displayValue)
          : '—';
      });
      return {
        team: Object.assign({}, teamBasics(t.team), { homeAway: t.homeAway }),
        stats: stats
      };
    });
  }

  function playerStatTeams(boxscorePlayers) {
    return (boxscorePlayers || []).map(function (p) {
      return {
        team: Object.assign({}, teamBasics(p.team), { homeAway: p.homeAway }),
        categories: (p.statistics || []).map(function (c) {
          return {
            name: c.name || '',
            labels: Array.isArray(c.labels) ? c.labels : [],
            athletes: (c.athletes || []).map(function (a) {
              const ath = a.athlete || {};
              return {
                id: ath.id,
                name: ath.displayName || '',
                jersey: ath.jersey || '',
                headshot: (ath.headshot && ath.headshot.href) || '',
                stats: Array.isArray(a.stats) ? a.stats : []
              };
            }),
            totals: Array.isArray(c.totals) ? c.totals : []
          };
        })
      };
    });
  }

  function drivesList(drives) {
    if (!drives) return [];
    let out = [];
    if (Array.isArray(drives.previous)) out = out.concat(drives.previous);
    if (drives.current) out = out.concat([drives.current]);
    return out;
  }

  function seqNumber(s) {
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : n;
  }

  function playsList(drives) {
    let plays = [];
    drivesList(drives).forEach(function (d) {
      if (d && Array.isArray(d.plays)) plays = plays.concat(d.plays);
    });
    plays.sort(function (a, b) {
      return seqNumber(a.sequenceNumber) - seqNumber(b.sequenceNumber);
    });
    return plays;
  }

  function playRow(p) {
    if (!p) return null;
    return {
      id: p.id,
      seq: p.sequenceNumber,
      type: (p.type && p.type.text) || '',
      text: p.text || p.shortText || '',
      awayScore: p.awayScore != null ? p.awayScore : 0,
      homeScore: p.homeScore != null ? p.homeScore : 0,
      quarter: (p.period && p.period.number != null) ? p.period.number : null,
      clock: (p.clock && p.clock.displayValue) || '',
      downDistance: (p.start && p.start.downDistanceText) || '',
      possession: (p.start && p.start.possessionText) || '',
      endDownDistance: (p.end && p.end.downDistanceText) || '',
      yardage: p.statYardage != null ? p.statYardage : null,
      scoring: !!p.scoringPlay,
      turnover: !!p.isTurnover,
      penalty: !!p.isPenalty,
      penaltyText: p.penalty
        ? (((p.penalty.yards != null ? p.penalty.yards + '-yard ' : '')) +
           ((p.penalty.type && p.penalty.type.text) || 'Penalty'))
        : ''
    };
  }

  /* --------------------------- red zone location ------------------------- */
  /*
   * Red zone determination from position fields that exist on the play
   * objects returned by the summary endpoint (verified on the real response
   * for event 401873286, LV @ HOU 2026-08-21):
   *
   *   - start.yardsToEndzone is the distance from the play spot to the end
   *     zone the offense is driving toward: "1st & 10 at HOU 19" (LV on
   *     offense) carries yardsToEndzone 19, while "1st & 10 at LV 19" (LV
   *     on its OWN 19, driving the other way) carries yardsToEndzone 81.
   *     It is the only side-independent distance on the play: start.yardLine
   *     is measured from the home team's goal line (0-100), so it changes
   *     meaning with each game's home/away pairing ("LV 36" -> 64,
   *     "HOU 20" -> 20, "LV 41" -> 41).
   *   - start.yardsToEndzone is 0 on non-snap entries (official timeouts,
   *     team timeouts, two-minute warnings, end-of-period / end-of-game
   *     plays) even though the ball spot is real, so 0 is treated as
   *     "not provided", never as "at the end zone".
   *   - start.downDistanceText switches to "Goal" when goal-to-go ("1st &
   *     Goal at HOU 4", " & Goal at HOU 15") but not always ("1st & 10 at
   *     HOU 19" stays plain), so it is only a fallback signal.
   *   - start.possessionText names the nearer goal line ("HOU 19" is 19
   *     yards from the Houston goal line), so the distance to the end zone
   *     depends on which way the offense is driving: when the offense is
   *     the named team it drives away from that line (100 - N), otherwise
   *     toward it (N). Cross-checked against yardsToEndzone on the same
   *     real plays: LV 36 -> 64, HOU 20 -> 80, LV 19 (LV offense) -> 81,
   *     LV 41 (HOU offense) -> 41, HOU 19 (LV offense) -> 19.
   *
   * The red zone is the opponent's 20 or inside: a distance of 20 yards or
   * fewer to the end zone. When no field can establish the distance, null is
   * returned (it is never guessed) and the play is not a red zone play.
   */
  const RED_ZONE_DISTANCE = 20;

  function yardsToEndzone(p, drive) {
    const s = (p && p.start) || null;
    if (!s) return null;
    const raw = s.yardsToEndzone;
    if (raw != null && raw !== '') {
      const y = Number(raw);
      if (isFinite(y) && y >= 1) return y;
    }
    if (s.downDistanceText && /\bgoal\b/i.test(s.downDistanceText)) {
      return RED_ZONE_DISTANCE; // goal-to-go is by definition within 20
    }
    const m = (s.possessionText || '').match(/^\s*([A-Za-z&]{2,4})\s+(\d{1,3})\s*$/);
    if (m) {
      const offenseAbbr = (drive && drive.team && drive.team.abbreviation) || '';
      if (offenseAbbr) {
        const n = Number(m[2]);
        return (m[1] === offenseAbbr) ? 100 - n : n;
      }
    }
    return null;
  }

  function isRedZonePlay(p, drive) {
    const d = yardsToEndzone(p, drive);
    return d != null && d <= RED_ZONE_DISTANCE;
  }

  /* ------------------- score / ruling evidence --------------------------- */
  /*
   * The live provider returns a running awayScore/homeScore on summary plays.
   * A lower running total is useful evidence, but only after it is tied to a
   * scoring ruling. This module never turns a generic flag, a generic review,
   * or an incomplete score object into a "score removed" alert.
   *
   * The rules behind the vocabulary are documented in verification.md from
   * NFL Football Operations' 2026 rulebook: Rule 11 lists touchdown, field
   * goal, try and safety scoring; Rule 15 governs replay. The live endpoint
   * itself is a provider feed, not an NFL officiating API, so its fields are
   * treated as evidence and not as a substitute for an official gamebook.
   */
  const BOOTH_SCORE_LOOKAHEAD = 4;
  const BOOTH_SCORE_LOOKBACK = 8;
  // A scoring ruling should be contiguous with its score. We permit only
  // administrative/review entries between them; do not reach across another
  // football play and guess that an old score is the subject of a new review.
  const SCORING_RULING_LOOKBACK = 4;

  const SCORE_KIND_LABEL = {
    touchdown: 'Touchdown',
    fieldGoal: 'Field goal',
    extraPoint: 'Extra point',
    twoPoint: 'Two-point conversion',
    safety: 'Safety',
    score: 'Scoring play'
  };

  function validScoreValue(value) {
    if (value == null || value === '') return false;
    const n = Number(value);
    return isFinite(n) && n >= 0;
  }

  // A partial live overlay must not be treated as a 0 for the missing team.
  // ESPN normally publishes both values together; requiring both prevents a
  // malformed response from fabricating a score rollback.
  function hasExplicitScore(play) {
    return !!(play && validScoreValue(play.awayScore) && validScoreValue(play.homeScore));
  }

  function scoreState(play) {
    return {
      away: (play && validScoreValue(play.awayScore)) ? Number(play.awayScore) : 0,
      home: (play && validScoreValue(play.homeScore)) ? Number(play.homeScore) : 0
    };
  }

  function isNoGood(text) {
    const t = String(text || '').toLowerCase();
    return /\bno good\b/.test(t) || /\bblocked\b/.test(t) || /\bmissed\b/.test(t) ||
      /\bwide\b/.test(t) || /\bfailed\b/.test(t) || /\bincomplete\b/.test(t);
  }

  function scoreKindFromType(type) {
    const t = String(type || '').toLowerCase();
    if (/touchdown/.test(t)) return 'touchdown';
    if (/field goal/.test(t)) return 'fieldGoal';
    if (/extra point|\bpat\b/.test(t)) return 'extraPoint';
    if (/two[- ]point|2[- ]point/.test(t)) return 'twoPoint';
    if (/safety/.test(t)) return 'safety';
    return '';
  }

  /*
   * Text fallback is deliberately narrower than a word search. For example,
   * a defender can be described as a "safety" and a field-goal attempt can
   * be no good; neither is a scoring play. The source's scoringPlay boolean
   * remains preferred when it exists.
   */
  function scoreKindFromText(text) {
    const t = String(text || '');
    if (!t) return '';
    const hasPenaltyNoPlay = /\bpenalty\b/i.test(t) && /\bno play\b/i.test(t);
    const hasNoTouchdownOnly = /\b(?:no|not a)\s+touchdown\b/i.test(t) &&
      !/\btouchdown\b[\s\S]*\b(?:nullified|reversed|overturned)\b/i.test(t);
    if (!hasNoTouchdownOnly && /\b(?:touchdown|td)\b(?![-\s]?saving)/i.test(t)) return 'touchdown';
    const fieldGoal = /\bfield goal\b/i.test(t);
    const extraPoint = /\b(?:extra point|pat)\b/i.test(t);
    const twoPoint = /\b(?:two[- ]point|2[- ]point)\b/i.test(t);
    if (fieldGoal && !isNoGood(t) &&
        (/\b(?:good|nullified|reversed|overturned)\b/i.test(t) || hasPenaltyNoPlay)) {
      return 'fieldGoal';
    }
    if (extraPoint && !isNoGood(t) &&
        (/\b(?:good|nullified|reversed|overturned)\b/i.test(t) || hasPenaltyNoPlay)) {
      return 'extraPoint';
    }
    if (twoPoint && !isNoGood(t) &&
        (/\b(?:good|successful|succeeds|succeeded|success|nullified|reversed|overturned)\b/i.test(t) ||
         hasPenaltyNoPlay)) {
      return 'twoPoint';
    }
    // A scoring safety is conventionally rendered as "for a Safety" or as
    // the all-caps result token. Do not match a player's defensive position.
    if (!/\bno safety\b/i.test(t) &&
        (/\b(?:for a|results? in a|is|was)\s+safety\b/i.test(t) ||
         /\bsafety\s+(?:nullified|is|was|awarded|counts?)\b/i.test(t) ||
         (/\bSAFETY\b/.test(t) && !hasNoTouchdownOnly))) return 'safety';
    return '';
  }

  function scoreChangeAt(plays, index) {
    if (!plays || index == null || index < 0 || index >= plays.length ||
        !hasExplicitScore(plays[index])) return null;
    // A truncated feed can begin on a scoring play. For its explanatory
    // metadata only, retain the existing conservative 0-0 baseline behavior;
    // a two-team increase remains ambiguous and is never assigned to a team.
    const firstPlayCanBeScore = plays[index].scoringPlay === true ||
      !!scoreKindFromText(playText(plays[index]));
    const before = index === 0
      ? (firstPlayCanBeScore ? { away: 0, home: 0 } : null)
      : (hasExplicitScore(plays[index - 1]) ? scoreState(plays[index - 1]) : null);
    if (!before) return null;
    const after = scoreState(plays[index]);
    const away = after.away - before.away;
    const home = after.home - before.home;
    return {
      before: before,
      after: after,
      away: away,
      home: home,
      points: Math.max(0, away, home),
      team: away > 0 && home <= 0 ? 'away' : (home > 0 && away <= 0 ? 'home' : '')
    };
  }

  /* A score delta can repair sparse wording on a normal snap/return, but it
   * cannot turn an administrative entry or generic penalty into the scoring
   * play just because an earlier provider snapshot was omitted. */
  function scoreChangeCanIdentifyPlay(play) {
    if (!play) return false;
    const type = playTypeText(play).toLowerCase();
    const text = playText(play);
    if (play.isPenalty || /\bpenalty\b/.test(type) || /\bpenalty\s+on\b/i.test(text)) return false;
    if (/timeout|end of (?:period|quarter|game)|two[- ]minute warning/.test(type)) return false;
    if (/kickoff/.test(type) && !/return/.test(type)) return false;
    return /rush|pass|reception|return|field goal|extra point|two[- ]point|safety|interception|fumble/.test(type) ||
      /\b(?:touchdown|field goal|extra point|two[- ]point|2[- ]point|safety)\b/i.test(text);
  }

  function scoringPlayInfo(play, plays, index) {
    if (!play) return null;
    const text = playText(play);
    const typeKind = scoreKindFromType(playTypeText(play));
    const textKind = scoreKindFromText(text);
    const change = scoreChangeAt(plays, index);
    const sourceFlag = play.scoringPlay === true;

    // A type label alone is not enough for a missed kick. Touchdown / safety
    // type labels, on the other hand, are result labels in this feed. A source
    // scoring flag or a score delta on a plausible scoring play is stronger
    // than text fallback.
    const failedKickOrTry = isNoGood(text) &&
      (typeKind === 'fieldGoal' || typeKind === 'extraPoint' || typeKind === 'twoPoint' ||
       /\b(?:field goal|extra point|pat|two[- ]point|2[- ]point)\b/i.test(text));
    let scoring = !failedKickOrTry && (sourceFlag || !!textKind);
    if (!scoring && !failedKickOrTry && change && change.team && scoreChangeCanIdentifyPlay(play)) scoring = true;
    if (!scoring && !failedKickOrTry && (typeKind === 'touchdown' || typeKind === 'safety')) scoring = true;
    if (!scoring) return null;

    const kind = textKind || typeKind || 'score';
    const before = change ? change.before : null;
    const after = change ? change.after : (hasExplicitScore(play) ? scoreState(play) : null);
    return {
      id: play.id,
      index: index,
      type: playTypeText(play),
      text: text,
      scoreKind: kind,
      scoreLabel: SCORE_KIND_LABEL[kind] || SCORE_KIND_LABEL.score,
      points: change && change.team ? change.points : 0,
      team: change && change.team ? change.team : '',
      score: after,
      before: before,
      sourceFlag: sourceFlag,
      sourceText: !!textKind,
      sourceScoreChange: !!(change && change.team)
    };
  }

  function isScoringPlay(p) {
    return !!scoringPlayInfo(p, null, -1);
  }

  function nearestScoringPlay(plays, index, lookback) {
    const span = lookback != null ? lookback : BOOTH_SCORE_LOOKBACK;
    const start = Math.max(0, index - span);
    for (let i = index - 1; i >= start; i -= 1) {
      const info = scoringPlayInfo(plays[i], plays, i);
      if (!info) continue;
      return info;
    }
    return null;
  }

  function isAdministrativeEntry(play) {
    const type = playTypeText(play);
    const text = playText(play);
    return /timeout|two[- ]minute warning|end of (?:period|quarter|game)|injury timeout/i.test(type) ||
      /\b(?:official )?timeout\b|\btwo[- ]minute warning\b|\bend of (?:period|quarter|game)\b/i.test(text);
  }

  function isScoringRulingBridge(play) {
    const kind = classifyBooth(play);
    return isAdministrativeEntry(play) || kind === 'review' || kind === 'challenge' || kind === 'replay';
  }

  function isKickOrReturnPlay(play) {
    return /kickoff|kick return|punt|punt return/i.test(playTypeText(play));
  }

  /*
   * Return the score that a specific booth ruling can be about. Unlike the
   * display-only nearestScoringPlay() lookup, this refuses to step over a new
   * football play. That constraint is what prevents a flag on the ensuing
   * kickoff or a later challenge from being promoted to a scoring ruling.
   */
  function scoringRulingScoringPlay(plays, index) {
    if (!plays || index == null || index < 0 || index >= plays.length) return null;
    const self = scoringPlayInfo(plays[index], plays, index);
    if (self) return self;
    // A kickoff/punt/return is a new play. Its generic foul cannot reach back
    // through an official timeout to remove the preceding score; an explicit
    // return touchdown nullification was handled by `self` above.
    if (isKickOrReturnPlay(plays[index])) return null;
    const start = Math.max(0, index - SCORING_RULING_LOOKBACK);
    for (let i = index - 1; i >= start; i -= 1) {
      const prior = plays[i];
      if (!prior) continue;
      const info = scoringPlayInfo(prior, plays, i);
      if (info) {
        // A direct "score nullified" source row is already its own final
        // ruling. A later generic flag cannot reopen it as a pending score.
        if (nullifiedScoreText(playText(prior))) return null;
        return info;
      }
      if (!isScoringRulingBridge(prior)) return null;
    }
    return null;
  }

  function isKnownPostScoreEnforcement(play) {
    const text = playText(play);
    return /\bdead ball\b|\bafter (?:the )?(?:play|touchdown|score)\b|\benforced (?:on|at) (?:the )?(?:ensuing|next) (?:kickoff|free kick)\b|\bon (?:the )?(?:ensuing|next) kickoff\b/i.test(text);
  }

  function hasAmbiguousScoreDrop(before, after) {
    return before && after && before.away > after.away && before.home > after.home;
  }

  /*
   * A falling per-play score is accepted only when the same or immediately
   * contiguous source record is a scoring review/challenge/penalty. Generic
   * live-feed score regressions are deliberately left for the integrity queue
   * rather than being announced as an officiating decision.
   */
  function scoreRollbackCanBelongToEvent(plays, index) {
    const play = plays && plays[index];
    if (!play) return false;
    const candidate = scoringRulingScoringPlay(plays, index);
    if (!candidate) return false;
    if (nullifiedScoreText(playText(play))) return true;
    if (isKnownPostScoreEnforcement(play)) return false;
    const kind = classifyBooth(play);
    return kind === 'penalty' || kind === 'review' || kind === 'challenge' || kind === 'replay';
  }

  function boothScoreEffect(plays, index) {
    if (!plays || index == null || index < 0 || index >= plays.length) {
      return {
        before: { away: 0, home: 0 },
        during: { away: 0, home: 0 },
        after: { away: 0, home: 0 },
        removesPoints: false,
        pointsRemoved: 0,
        team: '',
        ambiguousScoreDrop: false
      };
    }

    const before = index > 0 && hasExplicitScore(plays[index - 1])
      ? scoreState(plays[index - 1])
      : (hasExplicitScore(plays[index]) ? scoreState(plays[index]) : { away: 0, home: 0 });
    const rollbackEligible = scoreRollbackCanBelongToEvent(plays, index);
    // A live situation.lastPlay often omits the running score fields; in that
    // case the score is unchanged from the previous complete score.
    const publishedDuring = hasExplicitScore(plays[index])
      ? scoreState(plays[index])
      : before;
    const publishedDropsScore = publishedDuring.away < before.away ||
      publishedDuring.home < before.home;
    const ambiguousAtEvent = hasAmbiguousScoreDrop(before, publishedDuring);
    // Ignore a transient lower total on an event that cannot rule on a score,
    // and never choose a two-team drop as a single scoring nullification.
    const during = publishedDropsScore && (!rollbackEligible || ambiguousAtEvent)
      ? before
      : publishedDuring;

    let removedAway = rollbackEligible ? Math.max(0, before.away - during.away) : 0;
    let removedHome = rollbackEligible ? Math.max(0, before.home - during.home) : 0;
    let after = during;
    let resolved = null;
    let ambiguousScoreDrop = ambiguousAtEvent;

    // Some rollbacks arrive on the next record (for example an under-review
    // entry followed by its replay verdict). Only inspect the contiguous
    // short resolution window and only for a causally eligible ruling.
    const maxIndex = Math.min(plays.length, index + BOOTH_SCORE_LOOKAHEAD + 1);
    let maxAway = Math.max(before.away, during.away);
    let maxHome = Math.max(before.home, during.home);
    if (rollbackEligible) {
      for (let i = index + 1; i < maxIndex; i += 1) {
        // A new football play ends the ruling sequence. Do not use a later
        // correction to retroactively pin a score drop on this review/flag.
        if (!isScoringRulingBridge(plays[i])) break;
        if (!hasExplicitScore(plays[i])) continue;
        const s = scoreState(plays[i]);
        if (s.away < maxAway || s.home < maxHome) {
          if (hasAmbiguousScoreDrop({ away: maxAway, home: maxHome }, s)) {
            ambiguousScoreDrop = true;
            break;
          }
          resolved = s;
          break;
        }
        maxAway = Math.max(maxAway, s.away);
        maxHome = Math.max(maxHome, s.home);
      }
    }

    if (resolved) {
      after = resolved;
      removedAway = Math.max(removedAway, Math.max(0, maxAway - resolved.away));
      removedHome = Math.max(removedHome, Math.max(0, maxHome - resolved.home));
    } else if (!removedAway && !removedHome && index + 1 < plays.length &&
               hasExplicitScore(plays[index + 1])) {
      const next = scoreState(plays[index + 1]);
      if (next.away >= during.away && next.home >= during.home) after = next;
    }

    // One scoring ruling can only remove one team's points. A two-team drop
    // is surfaced as a data irregularity, never as two invented rulings.
    if (removedAway > 0 && removedHome > 0) {
      ambiguousScoreDrop = true;
      removedAway = 0;
      removedHome = 0;
      after = before;
    }

    const pointsRemoved = Math.max(removedAway, removedHome);
    const team = removedAway > 0 ? 'away' : (removedHome > 0 ? 'home' : '');
    return {
      before: before,
      during: during,
      after: after,
      removesPoints: pointsRemoved > 0,
      pointsRemoved: pointsRemoved,
      team: team,
      ambiguousScoreDrop: ambiguousScoreDrop
    };
  }

  /* ------------------- nullified score / scoring watch ------------------- */
  /*
   * The detector has two levels:
   *
   *   - nullified: the provider text explicitly says a score was nullified,
   *     its contiguous replay verdict overturns the scoring play, or its
   *     complete running score rolls back on the tied ruling;
   *   - pending: a penalty/review/challenge is tied to a scoring play but the
   *     source has not published a final nullification. Pending items are
   *     visible for fast monitoring but MUST NOT trigger an alert.
   *
   * This keeps "potential" separate from an officiating outcome. It also
   * covers every Rule 11 scoring type without trying to infer whether an
   * ordinary flag elsewhere in the game might someday affect a score.
   */
  function nullifiedScoreText(text) {
    const t = String(text || '');
    if (!t || !scoreKindFromText(t)) return false;
    // Official gamebooks use "TOUCHDOWN NULLIFIED" / "field goal ...
    // NULLIFIED". This is final wording, regardless of punctuation.
    if (/\bnullified\b/i.test(t)) return true;
    // "No Play" only counts when the same record identifies a penalty. A
    // generic mention of a prior score plus unrelated no-play wording is not
    // enough to announce a score removal.
    if (/\bno play\b/i.test(t) && /\bpenalty\b/i.test(t)) return true;
    // A reversal needs replay/challenge context in the same source text.
    if (/\b(?:reversed|overturned)\b/i.test(t) &&
        /\b(?:replay|review|challenge|ruling)\b/i.test(t)) return true;
    return false;
  }

  function finalNonNullifiedResult(result) {
    return result === 'confirmed' || result === 'stands' || result === 'declined' ||
      result === 'offsetting';
  }

  /*
   * A pending row must not remain "at risk" after the source has moved on to
   * a normal football play with no rollback. We call that a retained score in
   * the UI, but keep the original source wording available; it is not a claim
   * that we independently adjudicated the play.
   */
  function sourceMovedPastScoringRuling(plays, index) {
    const max = Math.min((plays || []).length, index + BOOTH_SCORE_LOOKAHEAD + 1);
    for (let i = index + 1; i < max; i += 1) {
      const next = plays[i];
      if (!next || isAdministrativeEntry(next)) continue;
      const kind = classifyBooth(next);
      if (kind === 'review' || kind === 'challenge' || kind === 'replay') {
        if (finalNonNullifiedResult(boothResult(playText(next)))) return true;
        // An unresolved/reversed review belongs to the same officiating
        // sequence. Its own row carries the eventual outcome.
        continue;
      }
      // A new non-review play (including a kickoff) means the prior ruling
      // sequence ended. boothScoreEffect already checked this short window
      // for a qualifying score rollback.
      return true;
    }
    return false;
  }

  /*
   * A provider can publish a pending review and its final replay verdict as
   * separate contiguous records. Carry the explicit / overturned outcome back
   * to the pending record's scoring identity so it transitions pending ->
   * nullified rather than falsely reading "no rollback" beside its verdict.
   * Stop at the first ordinary football play: no historical attribution.
   */
  function contiguousScoringRulingNullified(plays, index) {
    const max = Math.min((plays || []).length, index + BOOTH_SCORE_LOOKAHEAD + 1);
    for (let i = index + 1; i < max; i += 1) {
      const next = plays[i];
      if (!next || isAdministrativeEntry(next)) continue;
      const kind = classifyBooth(next);
      const text = playText(next);
      if (kind === 'review' || kind === 'challenge' || kind === 'replay' || kind === 'penalty') {
        if (nullifiedScoreText(text) || boothResult(text) === 'overturned') return true;
        // A final retaining result concludes this officiating sequence.
        if (finalNonNullifiedResult(boothResult(text))) return false;
        continue;
      }
      return false;
    }
    return false;
  }

  function scoreRulingDetails(event, plays, index, effect) {
    const play = plays && plays[index];
    const scoringPlay = scoringRulingScoringPlay(plays, index);
    const explicitText = nullifiedScoreText(event && event.text);
    const overturnedScoringRuling = !!(scoringPlay && event &&
      (event.kind === 'review' || event.kind === 'challenge' || event.kind === 'replay') &&
      event.result === 'overturned');
    const contiguousNullification = !!(scoringPlay && !explicitText && !overturnedScoringRuling &&
      !finalNonNullifiedResult(event && event.result) &&
      contiguousScoringRulingNullified(plays, index));
    const nullified = !!((effect && effect.removesPoints) || explicitText || overturnedScoringRuling ||
      contiguousNullification);
    const canWatch = !!(scoringPlay && event &&
      (event.kind === 'penalty' || event.kind === 'review' || event.kind === 'challenge' || event.kind === 'replay') &&
      !isKnownPostScoreEnforcement(play));
    const sourceResolved = canWatch && !nullified &&
      (finalNonNullifiedResult(event.result) || sourceMovedPastScoringRuling(plays, index));
    const pending = !nullified && canWatch && !sourceResolved;
    let evidence = '';
    if (effect && effect.removesPoints) evidence = 'running-score rollback';
    else if (explicitText) evidence = 'explicit nullification wording';
    else if (overturnedScoringRuling) evidence = 'overturned scoring ruling';
    else if (contiguousNullification) evidence = 'contiguous scoring-ruling nullification';
    else if (finalNonNullifiedResult(event && event.result)) evidence = 'final non-nullified ruling';
    else if (sourceResolved) evidence = 'source moved on with no rollback';
    else if (pending) evidence = 'scoring ruling pending';
    return {
      scoringPlay: scoringPlay,
      scoringRuling: nullified || pending || sourceResolved,
      scoringWatch: nullified ? 'nullified' : (pending ? 'pending' : (sourceResolved ? 'retained' : '')),
      nullificationEvidence: evidence,
      explicitNullification: explicitText,
      overturnedScoringRuling: overturnedScoringRuling
    };
  }

  function boothEventNullifies(event) {
    if (!event) return false;
    return !!event.nullified || !!event.removesPoints || nullifiedScoreText(event.text);
  }

  function boothEventContext(event, plays, index) {
    if (!event) return null;
    const effect = boothScoreEffect(plays, index);
    // This broader nearest lookup is retained as explanatory context in the
    // game detail. scoringPlay below is the stricter, causal association used
    // for alerts and the all-games scoring-rulings feed.
    const related = nearestScoringPlay(plays, index);
    const ruling = scoreRulingDetails(event, plays, index, effect);
    const withScores = Object.assign({}, event, {
      beforeAwayScore: effect.before.away,
      beforeHomeScore: effect.before.home,
      duringAwayScore: effect.during.away,
      duringHomeScore: effect.during.home,
      afterAwayScore: effect.after.away,
      afterHomeScore: effect.after.home,
      removesPoints: effect.removesPoints,
      pointsRemoved: effect.pointsRemoved,
      removedTeam: effect.team,
      ambiguousScoreDrop: effect.ambiguousScoreDrop,
      relatedScoringPlay: related,
      scoringPlay: ruling.scoringPlay,
      scoringRuling: ruling.scoringRuling,
      scoringWatch: ruling.scoringWatch,
      nullificationEvidence: ruling.nullificationEvidence,
      explicitNullification: ruling.explicitNullification,
      overturnedScoringRuling: ruling.overturnedScoringRuling,
      contextIndex: index
    });
    withScores.nullified = withScores.scoringWatch === 'nullified';
    return withScores;
  }

  /* ----------------------- flags / reviews ("booth") --------------------- */
  /*
   * This app does not consume a dedicated reviews feed. These source fields
   * were checked on real play objects (see playRow): type.text,
   * text/shortText, isPenalty, penalty.yards, penalty.type.text, period, clock,
   * and start.downDistanceText.
   *
   * The classifier recognizes challenge/review wording in p.text and
   * type.text; it does not add a separate source object to the response.
   */

  function playText(p) {
    if (!p) return '';
    return p.text || p.shortText || '';
  }

  function playTypeText(p) {
    return (p && p.type && p.type.text) || '';
  }

  function classifyBooth(p) {
    if (!p) return '';
    const typeLow = playTypeText(p).toLowerCase();
    const text = playText(p);

    if (/\bunder review\b/i.test(text) || typeLow.indexOf('under review') !== -1) {
      return 'review';
    }
    if (/\bchallenged\b/i.test(text) || /\bchallenge by\b/i.test(text) ||
        typeLow.indexOf('challenge') !== -1) {
      return 'challenge';
    }
    if (/\breplay official\b/i.test(text) || /\breplay review\b/i.test(text) ||
        /\bruling on the field\b/i.test(text) || /\bwas reversed\b/i.test(text) ||
        /\bwas overturned\b/i.test(text) || typeLow.indexOf('replay') !== -1) {
      return 'replay';
    }
    if (p.isPenalty || typeLow === 'penalty' || /\bPENALTY on\b/.test(text) ||
        /^\s*PENALTY\b/.test(text)) {
      return 'penalty';
    }
    // Some live records carry the final nullification wording before their
    // penalty object/type is hydrated. Keep that scoring ruling visible rather
    // than dropping it, but do not promote generic score text to a flag.
    if (nullifiedScoreText(text)) {
      return /\b(?:replay|review|reversed|overturned)\b/i.test(text) ? 'replay' : 'penalty';
    }
    return '';
  }

  function boothResult(text) {
    const t = String(text || '').toLowerCase();
    if (/\bunder review\b/.test(t)) return 'pending';
    if (/\breversed\b/.test(t) || /\boverturned\b/.test(t)) return 'overturned';
    if (/\bupheld\b/.test(t) || /\bis confirmed\b/.test(t)) return 'confirmed';
    if (/\bstands\b/.test(t)) return 'stands';
    if (/\bdeclined\b/.test(t)) return 'declined';
    if (/\boffset/.test(t)) return 'offsetting';
    return '';
  }

  function teamFromPlayOrDrive(p, drive) {
    const t = (p && p.team) || (drive && drive.team) || null;
    if (!t) return { abbr: '', displayName: '', logo: '' };
    let logo = '';
    if (Array.isArray(t.logos) && t.logos.length) logo = t.logos[0].href || '';
    else if (t.logo) logo = t.logo;
    return {
      abbr: t.abbreviation || '',
      displayName: t.displayName || t.name || '',
      logo: logo
    };
  }

  function boothHeading(kind, row, p) {
    if (kind === 'review') return 'Play under review';
    if (kind === 'challenge') return "Coach's challenge";
    if (kind === 'replay') return 'Replay review';
    if (row && row.penaltyText) return row.penaltyText;
    const text = (row && row.text) || playText(p);
    const m = text.match(/PENALTY on [^,]+,\s*([^,]+),\s*(\d+)\s+yards/i);
    if (m) return m[2] + '-yard ' + m[1];
    return (row && row.type) || 'Penalty';
  }

  function boothEvent(p, drive) {
    if (!p) return null;
    const kind = classifyBooth(p);
    if (!kind) return null;
    const row = playRow(p);
    const team = teamFromPlayOrDrive(p, drive);
    const text = row.text;
    return {
      id: p.id,
      seq: p.sequenceNumber,
      kind: kind,
      type: row.type,
      text: text,
      heading: boothHeading(kind, row, p),
      result: boothResult(text),
      quarter: row.quarter,
      clock: row.clock,
      downDistance: row.downDistance,
      awayScore: row.awayScore,
      homeScore: row.homeScore,
      penaltyText: row.penaltyText,
      penaltyYards: (p.penalty && p.penalty.yards != null) ? p.penalty.yards : null,
      penaltyType: (p.penalty && p.penalty.type && p.penalty.type.text) || '',
      team: team,
      // Where the down started, per the verified position fields above.
      // null means the distance could not be established (not guessed).
      yardsToEndzone: yardsToEndzone(p, drive),
      redZone: isRedZonePlay(p, drive),
      // Text-only verdict; boothEventContext recomputes it once the running
      // score around the play is known (a score drop also counts).
      nullified: nullifiedScoreText(text)
    };
  }

  function boothPlayContext(drives, lastPlay) {
    const context = playsList(drives);
    if (!lastPlay) return context;
    const key = lastPlay.id != null ? String(lastPlay.id) : '';
    let at = -1;
    if (key) {
      for (let i = 0; i < context.length; i += 1) {
        if (context[i] && context[i].id != null && String(context[i].id) === key) {
          at = i;
          break;
        }
      }
    }
    if (at >= 0) {
      context[at] = lastPlay;
    } else {
      const copy = Object.assign({}, lastPlay);
      if (copy.sequenceNumber == null || copy.sequenceNumber === '') {
        let maxSeq = 0;
        context.forEach(function (p) {
          if (p && p.sequenceNumber != null) {
            maxSeq = Math.max(maxSeq, seqNumber(p.sequenceNumber));
          }
        });
        copy.sequenceNumber = String(maxSeq + 1);
      }
      context.push(copy);
    }
    context.sort(function (a, b) {
      return seqNumber(a.sequenceNumber) - seqNumber(b.sequenceNumber);
    });
    return context;
  }

  function boothContextIndex(context, event) {
    if (!context || !event) return -1;
    if (event.id != null) {
      for (let i = 0; i < context.length; i += 1) {
        if (context[i] && context[i].id != null && String(context[i].id) === String(event.id)) {
          return i;
        }
      }
    }
    if (event.seq != null) {
      const candidates = [];
      for (let i = 0; i < context.length; i += 1) {
        const p = context[i];
        if (!p || String(p.sequenceNumber) !== String(event.seq)) continue;
        if (classifyBooth(p) === event.kind) candidates.push(i);
      }
      if (candidates.length === 1) return candidates[0];
      for (let i = 0; i < candidates.length; i += 1) {
        const p = context[candidates[i]];
        if (playText(p) === event.text) return candidates[i];
      }
    }
    return -1;
  }

  function boothEvents(drives, lastPlay) {
    const out = [];
    const seen = {};
    drivesList(drives).forEach(function (d) {
      (d && d.plays ? d.plays : []).forEach(function (p) {
        const ev = boothEvent(p, d);
        if (!ev) return;
        if (ev.id != null) seen[String(ev.id)] = out.length;
        out.push(ev);
      });
    });
    if (lastPlay) {
      const extra = boothEvent(lastPlay, null);
      if (extra) {
        const key = extra.id != null ? String(extra.id) : '';
        const priorIndex = key && Object.prototype.hasOwnProperty.call(seen, key)
          ? seen[key]
          : -1;
        extra.live = true;
        if (priorIndex >= 0) {
          const prior = out[priorIndex];
          if (extra.text !== prior.text || extra.result !== prior.result || extra.kind !== prior.kind) {
            if (extra.seq == null || extra.seq === '') extra.seq = prior.seq;
            out[priorIndex] = extra;
          }
        } else {
          if (extra.seq == null || extra.seq === '') extra.seq = '99999999';
          out.push(extra);
        }
      }
    }
    out.sort(function (a, b) {
      return seqNumber(a.seq) - seqNumber(b.seq);
    });
    const context = boothPlayContext(drives, lastPlay);
    return out.map(function (ev) {
      const idx = boothContextIndex(context, ev);
      return idx < 0 ? ev : boothEventContext(ev, context, idx);
    });
  }

  /*
   * The all-games scoring watch is intentionally a strict subset of the raw
   * booth log: a review, challenge, or penalty is included only when the
   * source ties it to a scoring play and it has a pending, nullified, or
   * retained state. It supplies the UI watch; notification gating is stricter
   * and accepts nullified state only. Ordinary flags and non-scoring reviews
   * stay out of it.
   */
  function scoringRulingEvents(drives, lastPlay) {
    return boothEvents(drives, lastPlay).filter(function (event) {
      return !!(event && event.scoringRuling);
    });
  }

  function scoreDropIsAttributed(context, events, dropIndex) {
    return (events || []).some(function (event) {
      if (!event || !event.removesPoints || event.contextIndex == null ||
          dropIndex < event.contextIndex ||
          dropIndex > event.contextIndex + BOOTH_SCORE_LOOKAHEAD) return false;
      // A numeric drop belongs to this ruling only while every intervening
      // source record remains administrative/review context. A normal snap,
      // kickoff, punt, or return makes the later decrease its own data check.
      for (let i = event.contextIndex + 1; i < dropIndex; i += 1) {
        if (!isScoringRulingBridge(context && context[i])) return false;
      }
      return true;
    });
  }

  function scoreIntegrityIssuesFromContext(context, events) {
    const issues = [];
    for (let i = 1; i < (context || []).length; i += 1) {
      const previous = context[i - 1];
      const current = context[i];
      if (!hasExplicitScore(previous) || !hasExplicitScore(current)) continue;
      const before = scoreState(previous);
      const after = scoreState(current);
      const decreases = before.away > after.away || before.home > after.home;
      if (!decreases || scoreDropIsAttributed(context, events, i)) continue;
      const sourceId = current && current.id != null ? String(current.id) :
        ('seq:' + (current && current.sequenceNumber != null ? current.sequenceNumber : i));
      issues.push({
        id: 'integrity:' + sourceId,
        sourcePlayId: current && current.id != null ? current.id : null,
        seq: current && current.sequenceNumber != null ? current.sequenceNumber : '',
        kind: 'integrity',
        heading: 'Source score correction needs review',
        text: playText(current) || 'The live provider lowered a running score without a tied scoring ruling.',
        result: '',
        quarter: current && current.period && current.period.number != null ? current.period.number : null,
        clock: (current && current.clock && current.clock.displayValue) || '',
        awayScore: after.away,
        homeScore: after.home,
        beforeAwayScore: before.away,
        beforeHomeScore: before.home,
        duringAwayScore: after.away,
        duringHomeScore: after.home,
        afterAwayScore: after.away,
        afterHomeScore: after.home,
        removesPoints: false,
        pointsRemoved: 0,
        removedTeam: '',
        nullified: false,
        scoringRuling: true,
        scoringWatch: 'irregular',
        irregularity: true,
        nullificationEvidence: 'unattributed running-score decrease',
        relatedScoringPlay: null,
        scoringPlay: null,
        redZone: false,
        team: { abbr: '', displayName: '', logo: '' }
      });
    }
    return issues;
  }

  /*
   * A lower provider score without a contiguous scoring ruling is not called
   * a nullification. It is surfaced for review, silently, with the exact
   * before/after source totals so the user can audit it.
   */
  function scoreIntegrityIssues(drives, lastPlay) {
    const context = boothPlayContext(drives, lastPlay);
    return scoreIntegrityIssuesFromContext(context, boothEvents(drives, lastPlay));
  }

  function scoringWatchEvents(drives, lastPlay) {
    const all = boothEvents(drives, lastPlay);
    const relevant = all.filter(function (event) { return !!(event && event.scoringRuling); });
    const issues = scoreIntegrityIssuesFromContext(boothPlayContext(drives, lastPlay), all);
    return relevant.concat(issues).sort(function (a, b) {
      return seqNumber(a.seq) - seqNumber(b.seq);
    });
  }

  /*
   * This deliberately requires the mapper's final state rather than merely
   * score-like wording. It is the single strict gate for the all-games live
   * outcome stream and alert paths: pending, retained, and audit records
   * cannot pass it.
   */
  function isConfirmedNullifiedScoringEvent(event) {
    return !!(event && event.scoringRuling && event.scoringWatch === 'nullified' &&
      event.nullified === true && !event.irregularity);
  }

  /*
   * dayBoothFeed — merge the booth feeds of every game of a day into one
   * flat, chat-style list. Each input game is
   *   { id, shortName, awayAbbr, homeAbbr, date, live, events: [boothEvent…] }
   * where `events` normally comes from scoringWatchEvents(). Games are expected to be passed
   * in the order they should appear in the feed (start-time order); events
   * inside a game are already in sequence order. Duplicate plays (same
   * event id + play id, e.g. a game passed twice or a lastPlay that the
   * play-by-play already contains) are kept only once — first occurrence
   * wins. No timestamps are invented: the caller decides the ordering.
   */
  function dayBoothFeed(games) {
    const out = [];
    const seen = {};
    (games || []).forEach(function (g) {
      if (!g) return;
      (g.events || []).forEach(function (e) {
        if (!e) return;
        const playId = e.id != null ? String(e.id) : '';
        const key = playId
          ? String(g.id) + ':' + playId
          : String(g.id) + ':seq:' + (e.seq != null ? e.seq : '') + ':' +
            e.kind + ':' + (e.text || '');
        if (seen[key]) return;
        seen[key] = true;
        out.push(Object.assign({}, e, {
          key: key,
          gameId: g.id,
          shortName: g.shortName || '',
          awayAbbr: g.awayAbbr || '',
          homeAbbr: g.homeAbbr || '',
          date: g.date || null,
          liveGame: !!g.live
        }));
      });
    });
    return out;
  }

  /*
   * Preserve chat discovery order while replacing events whose source play was
   * updated in place (for example, "under review" becoming "reversed").
   * Items no longer present in `fresh` stay in the history; genuinely new keys
   * are appended.
   */
  function reconcileDayBoothFeed(existing, fresh) {
    const out = (existing || []).slice();
    const positions = {};
    out.forEach(function (item, index) {
      if (item && item.key != null) positions[String(item.key)] = index;
    });
    (fresh || []).forEach(function (item) {
      if (!item) return;
      const key = item.key != null ? String(item.key) : '';
      if (key && Object.prototype.hasOwnProperty.call(positions, key)) {
        out[positions[key]] = item;
        return;
      }
      if (key) positions[key] = out.length;
      out.push(item);
    });
    return out;
  }

  function scoringDrives(drives) {
    return drivesList(drives).filter(function (d) { return d && d.isScore; });
  }

  function driveRow(d) {
    if (!d) return null;
    let logo = '';
    if (d.team && Array.isArray(d.team.logos) && d.team.logos.length) {
      logo = d.team.logos[0].href || '';
    }
    const plays = Array.isArray(d.plays) ? d.plays : [];
    const last = plays.length ? plays[plays.length - 1] : null;
    return {
      id: d.id,
      team: {
        abbr: (d.team && d.team.abbreviation) || '',
        displayName: (d.team && d.team.displayName) || '',
        logo: logo,
        color: (d.team && d.team.color) ? hex(d.team.color) : '#8a8a8a'
      },
      quarter: (d.start && d.start.period && d.start.period.number != null)
        ? d.start.period.number
        : null,
      clock: (d.start && d.start.clock && d.start.clock.displayValue) || '',
      startText: (d.start && d.start.text) || '',
      endText: (d.end && d.end.text) || '',
      yards: d.yards != null ? d.yards : null,
      plays: d.offensivePlays != null ? d.offensivePlays : plays.length,
      timeElapsed: (d.timeElapsed && d.timeElapsed.displayValue) || '',
      result: d.displayResult || d.shortDisplayResult || d.result || '',
      description: d.description || '',
      awayScore: (last && last.awayScore != null) ? last.awayScore : null,
      homeScore: (last && last.homeScore != null) ? last.homeScore : null
    };
  }

  function quarterLabel(q) {
    if (q == null) return '';
    if (q <= 4) return 'Q' + q;
    return 'OT';
  }

  return {
    getCompetition: getCompetition,
    competitors: competitors,
    statusInfo: statusInfo,
    summarizeEvent: summarizeEvent,
    summaryInfo: summaryInfo,
    teamStatsTables: teamStatsTables,
    playerStatTeams: playerStatTeams,
    drivesList: drivesList,
    playsList: playsList,
    playRow: playRow,
    scoringDrives: scoringDrives,
    driveRow: driveRow,
    quarterLabel: quarterLabel,
    RED_ZONE_DISTANCE: RED_ZONE_DISTANCE,
    yardsToEndzone: yardsToEndzone,
    isRedZonePlay: isRedZonePlay,
    classifyBooth: classifyBooth,
    boothResult: boothResult,
    boothEvent: boothEvent,
    boothEvents: boothEvents,
    boothScoreEffect: boothScoreEffect,
    boothEventContext: boothEventContext,
    nullifiedScoreText: nullifiedScoreText,
    boothEventNullifies: boothEventNullifies,
    scoringRulingEvents: scoringRulingEvents,
    scoreIntegrityIssues: scoreIntegrityIssues,
    scoringWatchEvents: scoringWatchEvents,
    isConfirmedNullifiedScoringEvent: isConfirmedNullifiedScoringEvent,
    dayBoothFeed: dayBoothFeed,
    reconcileDayBoothFeed: reconcileDayBoothFeed
  };
});
