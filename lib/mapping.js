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
  const BOOTH_SCORE_LOOKBACK = 6;   // plays before an event scanned for its scoring play

  function hasExplicitScore(play) {
    return !!(play && (play.awayScore != null || play.homeScore != null));
  }

  function scoreState(play) {
    return {
      away: (play && play.awayScore != null) ? Number(play.awayScore) : 0,
      home: (play && play.homeScore != null) ? Number(play.homeScore) : 0
    };
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
    return /\btouchdown\b/i.test(text) || /\bfield goal\b/i.test(text) ||
      /\bsafety\b/i.test(text) || typeLow === 'touchdown' ||
      typeLow === 'field goal' || typeLow === 'safety';
  }

  function nearestScoringPlay(plays, index) {
    const start = Math.max(0, index - BOOTH_SCORE_LOOKBACK);
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
          type: playTypeText(p),
          text: playText(p),
          points: Math.max(awayPoints, homePoints),
          team: awayPoints > 0 ? 'away' : (homePoints > 0 ? 'home' : '')
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

  function boothEventContext(event, plays, index) {
    if (!event) return null;
    const effect = boothScoreEffect(plays, index);
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
      relatedScoringPlay: nearestScoringPlay(plays, index)
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
      team: team
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
    classifyBooth: classifyBooth,
    boothResult: boothResult,
    boothEvent: boothEvent,
    boothEvents: boothEvents,
    boothScoreEffect: boothScoreEffect,
    boothEventContext: boothEventContext,
    dayBoothFeed: dayBoothFeed,
    reconcileDayBoothFeed: reconcileDayBoothFeed
  };
});
