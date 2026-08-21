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
    quarterLabel: quarterLabel
  };
});
