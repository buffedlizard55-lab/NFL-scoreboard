/* ------------------------------------------------------------------------- *
 * NFLMap — pure data-mapping helpers for the ESPN public NFL API.
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

  /* ------------------- booth score-state tracking ------------------------ */
  /*
   * ESPN put the running score on each play in the summary play-by-play
   * (awayScore / homeScore — the same fields playRow already reads). NFL
   * scores do not legitimately decrease during normal play, so a decrease in
   * that running score around a flag/review/challenge is the only evidence we
   * need to report that the event removed points. These helpers only read the
   * verified play fields above; they do not add a reviews field to the API.
   *
   * A "state" is the score as ESPN recorded it before/during/after the event.
   * For a pending "under review" play that has not been resolved by the API
   * yet, the helpers deliberately leave after = during, because the final
   * score is not known until ESPN publishes the next resolution play.
   */
  const BOOTH_SCORE_LOOKAHEAD = 4;  // plays after an event scanned for a rollback
  const BOOTH_SCORE_LOOKBACK = 8;   // plays before an event scanned for its scoring play (covers PAT + timeouts before a review)
  // A flag, challenge or reversal can only take a score off the board while
  // the game has not moved on from it: penalties that nullify a score are
  // published as the next entry, and a review/challenge verdict arrives one
  // or two entries after the score. Kickoff / kick-return flags (4+ entries
  // after the score) can no longer remove it, so they are out of the window.
  // Expanded from 3 to 6 to catch delayed booth reviews that happen after the
  // try, after a timeout, or after a couple of procedural plays but still
  // before the ensuing kickoff. The kickoff-settles rule below prevents false
  // positives once the ball is kicked.
  const BOOTH_AT_RISK_LOOKBACK = 6; // plays after a score in which a booth event can still wipe it
  // Results after which the points are settled and nothing is at risk: the
  // verdict kept the score (confirmed / stands) or the flag did not count
  // (declined / offsetting). A completed rollback is never "at risk" either;
  // it is reported by removesPoints instead.
  const BOOTH_SAFE_RESULTS = {
    confirmed: true,
    stands: true,
    declined: true,
    offsetting: true
  };

  function hasExplicitScore(play) {
    return !!(play && (play.awayScore != null || play.homeScore != null));
  }

  function scoreState(play) {
    return {
      away: (play && play.awayScore != null) ? Number(play.awayScore) : 0,
      home: (play && play.homeScore != null) ? Number(play.homeScore) : 0
    };
  }

  function isNoGood(text) {
    const t = String(text || '').toLowerCase();
    return /\bno good\b/.test(t) || /\bblocked\b/.test(t) || /\bmissed\b/.test(t) ||
      /\bwide\b/.test(t) || /\bfailed\b/.test(t) || /\bincomplete\b/.test(t);
  }

  function isScoringPlay(p) {
    if (!p) return false;
    if (p.scoringPlay === true) return true;
    // An explicit scoring flag is authoritative. Fall back to text only for
    // ordinary plays; a review/penalty wording that merely mentions the word
    // "touchdown" (e.g. "reversed ... no touchdown") is not a scoring play.
    if (classifyBooth(p)) return false;
    const text = playText(p);
    const typeLow = playTypeText(p).toLowerCase();

    // Touchdown – any mention is a score when it is not a booth event.
    // This is the most common case: "3 yard run, TOUCHDOWN."
    if (typeLow === 'touchdown' || /\btouchdown\b/i.test(text)) return true;

    // Field goal – must be GOOD, not NO GOOD / BLOCKED / MISSED / WIDE.
    // Prevents "field goal is NO GOOD" from being counted as a score.
    if (typeLow === 'field goal' || /\bfield goal\b/i.test(text)) {
      if (isNoGood(text)) return false;
      // If the type is explicitly field goal and it is not a miss, treat as scoring
      // (covers cases where text is just "Field Goal" without GOOD, but scoringPlay
      // would already be true for made FGs – this is a fallback for text-only).
      if (/\bgood\b/i.test(text)) return true;
      if (typeLow === 'field goal') return true;
      return false;
    }

    // Safety – always 2 points.
    if (typeLow === 'safety' || /\bsafety\b/i.test(text)) return true;

    // Extra point – 1 point that can be taken off on review/penalty.
    // Example: "K.Matsuzawa extra point is GOOD." vs "extra point is NO GOOD."
    if (/\bextra point\b/i.test(text) || typeLow.indexOf('extra point') !== -1) {
      if (isNoGood(text)) return false;
      if (/\bgood\b/i.test(text)) return true;
      // Some feeds mark the PAT as scoringPlay true already handled above,
      // but if type is extra point and text says "is good", count it.
      return false;
    }

    // Two-point conversion – 2 points. Must be GOOD / SUCCESSFUL / CONVERSION
    // without NO GOOD / FAILED / INCOMPLETE.
    if (/(two-point|2-point)/i.test(text) || /(two-point|2-point)/i.test(typeLow)) {
      if (isNoGood(text)) return false;
      if (/\bno\b/i.test(text) && /\bgood\b/i.test(text)) return false;
      if (/\bgood\b/i.test(text) || /\bsuccessful\b/i.test(text) ||
          (/\bconversion\b/i.test(text) && !/\bno\b/i.test(text))) {
        return true;
      }
      // If the play type itself is two-point and text doesn't say failed, be conservative
      // and require an explicit good/successful marker to avoid false positives.
      return false;
    }

    return false;
  }

  function nearestScoringPlay(plays, index, lookback) {
    const span = lookback != null ? lookback : BOOTH_SCORE_LOOKBACK;
    const start = Math.max(0, index - span);
    for (let i = index - 1; i >= start; i -= 1) {
      const p = plays[i];
      if (!p) continue;
      if (isScoringPlay(p)) {
        // A scoring play is never the first event in a real game, but when a
        // truncated list starts at the score itself we still report points
        // versus the legitimate 0-0 start score.
        const before = i > 0 ? scoreState(plays[i - 1]) : { away: 0, home: 0 };
        const after = scoreState(p);
        const awayPoints = Math.max(0, after.away - before.away);
        const homePoints = Math.max(0, after.home - before.home);
        return {
          id: p.id,
          index: i,
          type: playTypeText(p),
          text: playText(p),
          points: Math.max(awayPoints, homePoints),
          team: awayPoints > 0 ? 'away' : (homePoints > 0 ? 'home' : ''),
          // The running score with these points counted, so callers can
          // verify the points are still on the board.
          score: after
        };
      }
    }
    return null;
  }

  function boothScoreEffect(plays, index) {
    if (!plays || index == null || index < 0 || index >= plays.length) {
      return {
        before: { away: 0, home: 0 },
        during: { away: 0, home: 0 },
        after: { away: 0, home: 0 },
        removesPoints: false,
        pointsRemoved: 0,
        team: ''
      };
    }

    const before = index > 0 ? scoreState(plays[index - 1]) : scoreState(plays[index]);
    // A live situation.lastPlay often omits the running score fields; in that
    // case the score is unchanged from the previous play (do not invent 0-0).
    const during = hasExplicitScore(plays[index])
      ? scoreState(plays[index])
      : before;

    let removedAway = Math.max(0, before.away - during.away);
    let removedHome = Math.max(0, before.home - during.home);
    let after = during;
    let resolved = null;

    // Some rollbacks are published on the next play rather than on the event
    // play itself (most commonly "Play under review." then the replay verdict).
    // Scan the immediate follow-up plays for the first lower running score.
    const maxIndex = Math.min(plays.length, index + BOOTH_SCORE_LOOKAHEAD + 1);
    let maxAway = Math.max(before.away, during.away);
    let maxHome = Math.max(before.home, during.home);
    for (let i = index + 1; i < maxIndex; i += 1) {
      const s = scoreState(plays[i]);
      // Never use a missing-score live overlay as proof of a rollback.
      if (hasExplicitScore(plays[i]) && (s.away < maxAway || s.home < maxHome)) {
        resolved = s;
        break;
      }
      maxAway = Math.max(maxAway, s.away);
      maxHome = Math.max(maxHome, s.home);
    }

    if (resolved) {
      after = resolved;
      removedAway = Math.max(removedAway, Math.max(0, maxAway - resolved.away));
      removedHome = Math.max(removedHome, Math.max(0, maxHome - resolved.home));
    } else if (!removedAway && !removedHome && index + 1 < plays.length &&
               hasExplicitScore(plays[index + 1])) {
      // No rollback was observed; report the score on the immediately next
      // play as the post-event state when the API actually published one.
      after = scoreState(plays[index + 1]);
    }

    const pointsRemoved = Math.max(removedAway, removedHome);
    const team = removedAway > 0 ? 'away' : (removedHome > 0 ? 'home' : '');
    return {
      before: before,
      during: during,
      after: after,
      removesPoints: pointsRemoved > 0,
      pointsRemoved: pointsRemoved,
      team: team
    };
  }

  /* -------------------- points-at-risk (possible removals) --------------- */
  /*
   * "At risk" is the forward-looking companion to removesPoints above.
   * removesPoints reports a correction only after ESPN's running score has
   * actually dropped; at-risk marks a booth event whose points COULD still
   * come off the board, while the situation is live and unresolved, so a
   * human can review the moment it happens instead of after the fact:
   *
   *   - a touchdown / field goal / safety was just scored (within
   *     BOOTH_AT_RISK_LOOKBACK entries — see the constant's comment), and
   *   - those points are still counted in the running score at this event,
   *     and
   *   - the event itself is not settled-safe: a pending "Play under
   *     review.", a challenge without a verdict yet, a reversal whose score
   *     drop ESPN has not published, or an accepted / undecided flag after
   *     the score ("No Play" nullifications drop the score on the flag
   *     entry itself and are reported by removesPoints instead).
   *
   * Confirmed / stands / declined / offsetting outcomes clear the flag, and
   * an event that already removed points never carries it. This is a
   * possibility flag for manual review, not a verdict: a defensive flag
   * declined after a score, or a flag on the ensuing try, can briefly light
   * up before the resolution arrives.
   */
  function scoringPlayFromCurrent(plays, index) {
    // When the booth event IS the scoring play itself (e.g. "3 yd TD, TOUCHDOWN.
    // Play under review."), nearestScoringPlay which looks only before index
    // would miss it. Check the current play as a scoring candidate.
    if (!plays || index == null || index < 0 || index >= plays.length) return null;
    const p = plays[index];
    if (!p) return null;
    // isScoringPlay already returns true for scoringPlay === true even if the
    // play is also classified as review/penalty, so a TD under review is caught.
    if (!isScoringPlay(p)) return null;
    const before = index > 0 ? scoreState(plays[index - 1]) : { away: 0, home: 0 };
    const after = scoreState(p);
    const awayPoints = Math.max(0, after.away - before.away);
    const homePoints = Math.max(0, after.home - before.home);
    const points = Math.max(awayPoints, homePoints);
    if (!points) return null;
    return {
      id: p.id,
      index: index,
      type: playTypeText(p),
      text: playText(p),
      points: points,
      team: awayPoints > 0 ? 'away' : (homePoints > 0 ? 'home' : ''),
      score: after
    };
  }

  function bestScoringPlayInWindow(plays, index, lookback) {
    // Find all scoring plays within the at-risk window and pick the one with
    // the most points (TD 6/7 > FG 3 > safety 2 > PAT 1). This ensures a
    // delayed booth review after the PAT still highlights the original TD
    // (6pts) rather than just the 1pt PAT, which is what a human wants to
    // manually review. If points tie, the most recent wins.
    const span = lookback != null ? lookback : BOOTH_AT_RISK_LOOKBACK;
    const start = Math.max(0, index - span);
    let best = null;
    for (let i = index - 1; i >= start; i -= 1) {
      const p = plays[i];
      if (!p) continue;
      if (!isScoringPlay(p)) continue;
      const before = i > 0 ? scoreState(plays[i - 1]) : { away: 0, home: 0 };
      const after = scoreState(p);
      const awayPoints = Math.max(0, after.away - before.away);
      const homePoints = Math.max(0, after.home - before.home);
      const points = Math.max(awayPoints, homePoints);
      if (!points) continue;
      const candidate = {
        id: p.id,
        index: i,
        type: playTypeText(p),
        text: playText(p),
        points: points,
        team: awayPoints > 0 ? 'away' : (homePoints > 0 ? 'home' : ''),
        score: after
      };
      if (!best || candidate.points > best.points || (candidate.points === best.points && candidate.index > best.index)) {
        best = candidate;
      }
    }
    return best;
  }

  function boothPointsAtRisk(event, plays, index, effect) {
    const none = { atRisk: false, points: 0, team: '', scoringPlay: null };
    if (!event || !effect) return none;
    if (effect.removesPoints) return none;          // already off the board
    if (BOOTH_SAFE_RESULTS[event.result || '']) return none; // settled, points stay
    if (!plays || index == null || index < 0 || index >= plays.length) return none;

    // First, check if the current play itself is a scoring play that is now
    // under review / challenged / flagged. This covers the live moment where
    // ESPN publishes "TOUCHDOWN. Play under review." as a single entry.
    let scoring = scoringPlayFromCurrent(plays, index);

    // Otherwise, look back for scoring plays within the window.
    // We keep both the most recent (nearest) and the max-points (best) to
    // handle PAT vs TD ambiguity: a penalty directly after a PAT (gap 1) is
    // usually about the 1pt PAT, while a review after the PAT with a gap
    // (timeout, etc.) is usually still about the TD that could be wiped.
    if (!scoring) {
      const nearest = nearestScoringPlay(plays, index, BOOTH_AT_RISK_LOOKBACK);
      const best = bestScoringPlayInWindow(plays, index, BOOTH_AT_RISK_LOOKBACK);
      if (!nearest && !best) {
        scoring = null;
      } else if (!nearest) {
        scoring = best;
      } else if (!best) {
        scoring = nearest;
      } else {
        const isSmall = nearest.points <= 2; // PAT (1) or safety/2pt (2)
        const immediate = nearest.index === index - 1;
        const gap = index - nearest.index;
        if (isSmall && immediate && best.points > nearest.points) {
          if (event.kind === 'penalty') {
            // Penalty immediately after PAT/2pt: keep the small play (1pt/2pt)
            // if the flag is truly immediate; if there is a gap (timeout etc.)
            // the earlier TD is still at risk and more important to surface.
            scoring = gap === 1 ? nearest : best;
          } else {
            // Review/challenge/replay after PAT: the TD/FG is still the one
            // that could be removed, so surface the larger play.
            scoring = best;
          }
        } else {
          // Default: prefer larger points, tie-breaker most recent.
          scoring = best.points > nearest.points ? best : nearest;
          // However if best is much earlier but nearest is FG 3 vs TD 6,
          // best wins – that is intentional for manual review visibility.
        }
      }
    }
    if (!scoring || !scoring.points || !scoring.team) return none;

    // Once the ensuing kickoff has been played, the score is settled: flags
    // on the kick or the return can no longer take those points off the
    // board, so they are not at risk. (A scoring-play review that happens
    // after the try still sits before the kickoff and is not affected.)
    // If the scoring play IS the current play, there is no intervening kickoff.
    if (scoring.index !== index) {
      for (let i = scoring.index + 1; i < index; i += 1) {
        const t = (plays[i] && plays[i].type && plays[i].type.text) || '';
        if (/kickoff/i.test(t)) return none;
      }
    }

    // Only points that are still on the board can come off it. If an earlier
    // correction already banked the drop, this event has nothing at risk.
    const onBoard = scoring.team === 'away'
      ? effect.during.away >= scoring.score.away
      : effect.during.home >= scoring.score.home;
    if (!onBoard) return none;

    return { atRisk: true, points: scoring.points, team: scoring.team, scoringPlay: scoring };
  }

  function boothEventContext(event, plays, index) {
    if (!event) return null;
    const effect = boothScoreEffect(plays, index);
    const risk = boothPointsAtRisk(event, plays, index, effect);
    // The score named on the message is the same nearby scoring play the
    // risk scan found when one exists; for everything else (e.g. completed
    // rollbacks) keep the wider removal-note window.
    const related = (risk.atRisk && risk.scoringPlay)
      ? risk.scoringPlay
      : nearestScoringPlay(plays, index);
    return Object.assign({}, event, {
      beforeAwayScore: effect.before.away,
      beforeHomeScore: effect.before.home,
      duringAwayScore: effect.during.away,
      duringHomeScore: effect.during.home,
      afterAwayScore: effect.after.away,
      afterHomeScore: effect.after.home,
      removesPoints: effect.removesPoints,
      pointsRemoved: effect.pointsRemoved,
      removedTeam: effect.team,
      atRisk: risk.atRisk,
      pointsAtRisk: risk.points,
      atRiskTeam: risk.team,
      relatedScoringPlay: related
    });
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
      redZone: isRedZonePlay(p, drive)
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
   * dayBoothFeed — merge the booth feeds of every game of a day into one
   * flat, chat-style list. Each input game is
   *   { id, shortName, awayAbbr, homeAbbr, date, live, events: [boothEvent…] }
   * where `events` comes from boothEvents(). Games are expected to be passed
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
    boothPointsAtRisk: boothPointsAtRisk,
    BOOTH_AT_RISK_LOOKBACK: BOOTH_AT_RISK_LOOKBACK,
    BOOTH_SAFE_RESULTS: BOOTH_SAFE_RESULTS,
    dayBoothFeed: dayBoothFeed,
    reconcileDayBoothFeed: reconcileDayBoothFeed
  };
});
