/* ------------------------------------------------------------------------- *\
 * NFL Scoreboard — client app.
 * Live provider source: ESPN Gamecast web endpoints (not an NFL officiating
 * API):
 *   - scoreboard: site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
 *   - game detail: site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary
 * The endpoint fields are documented in verification.md. No videos are rendered
 * anywhere.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
  const SUMMARY_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary';
  // ESPN's compact header feed exposes the live event status, scores, and
  // last-play situation for the entire league in one response.
  const LIVE_HEADER_URL = 'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=football&league=nfl';
  const LIVE_REVIEW_SECONDS = NFLRefresh.LIVE_REVIEWS_INTERVAL_MS / 1000;
  const LIVE_SCORE_SECONDS = NFLRefresh.LIVE_SCORES_INTERVAL_MS / 1000;
  const BOOTH_SOUND_KEY = 'nflBoothSoundEnabled'; // persisted toggle for the booth alert sound

  /* Keep each ruling type in its own game tab. The all-games panel is more
   * restrictive: it is a nullified-score feed only. */
  const TABS = [
    { id: 'plays', label: 'Play-by-Play' },
    { id: 'drives', label: 'Scoring Drives' },
    { id: 'flags', label: 'Flags' },
    { id: 'challenges', label: 'Challenges' },
    { id: 'replay', label: 'Replay' },
    { id: 'review', label: 'Under review' },
    { id: 'nullified', label: 'Nullified' },
    { id: 'redzone', label: 'Red Zone' },
    { id: 'integrity', label: 'Data checks' },
    { id: 'team', label: 'Team Stats' },
    { id: 'players', label: 'Player Stats' }
  ];

  const RULING_TABS = ['flags', 'challenges', 'replay', 'review', 'nullified', 'redzone', 'integrity'];
  const DAY_WATCH_TABS = [
    ['nullified', 'Live nullified'],
    ['integrity', 'Data checks']
  ];

  const BOOTH_KIND_LABEL = {
    penalty: 'Flag',
    challenge: 'Challenge',
    replay: 'Replay',
    review: 'Under review',
    integrity: 'Data check'
  };

  const SCORING_WATCH_LABEL = {
    pending: 'POTENTIAL',
    nullified: 'NULLIFIED',
    retained: 'NO ROLLBACK',
    irregular: 'DATA CHECK'
  };

  const BOOTH_RESULT_LABEL = {
    pending: 'In progress',
    overturned: 'Overturned',
    confirmed: 'Confirmed',
    stands: 'Stands',
    declined: 'Declined',
    offsetting: 'Offsetting'
  };

  /* Potential records are tracked in their dedicated game categories. Only a
   * confirmed nullification can enter the all-games stream or alert. */

  function boothEventNullified(e) {
    if (!e) return false;
    // Contextual mapper events always provide an explicit boolean. Respect a
    // false value so an integrity record with score-like text cannot bypass
    // the causal checks and become an alert. The fallback supports older/raw
    // event objects that have no contextual decision yet.
    if (e.nullified != null) return !!e.nullified;
    return NFLMap.boothEventNullifies(e);
  }

  function confirmedNullifiedScoringEvent(e) {
    // Current mapper records always take the strict final-state route. Keep a
    // narrow fallback only for an older mapper loaded alongside this client.
    return typeof NFLMap.isConfirmedNullifiedScoringEvent === 'function'
      ? NFLMap.isConfirmedNullifiedScoringEvent(e)
      : boothEventNullified(e);
  }

  /* A scoring play can yield more than one source row (e.g. "under review"
   * followed by the replay verdict). Counts and notification identities use
   * the scoring play, rather than double-counting that ruling sequence. */
  function scoringIdentity(e) {
    if (!e) return '';
    const scoring = e.scoringPlay || e.relatedScoringPlay || null;
    const playId = scoring && scoring.id != null ? String(scoring.id) :
      (scoring && scoring.index != null
        ? 'source-index:' + String(scoring.index) + ':' + String(scoring.text || '')
        : (e.id != null ? String(e.id) : (e.key != null ? String(e.key) : '')));
    const gameId = e.gameId != null ? String(e.gameId) : '';
    return gameId + ':' + playId;
  }

  function uniqueScoringEvents(events, predicate) {
    const out = [];
    const positions = {};
    (events || []).forEach(function (event) {
      if (!event || (predicate && !predicate(event))) return;
      const key = scoringIdentity(event) || ('event:' + (event.id != null ? event.id : out.length));
      if (Object.prototype.hasOwnProperty.call(positions, key)) {
        const old = out[positions[key]];
        // Prefer the later/stronger ruling row for banners and notifications.
        if ((!old.removesPoints && event.removesPoints) || event.kind === 'replay') {
          out[positions[key]] = event;
        }
        return;
      }
      positions[key] = out.length;
      out.push(event);
    });
    return out;
  }

  const TEAM_STAT_ORDER = [
    ['firstDowns', 'First Downs'],
    ['thirdDownEff', '3rd Down Efficiency'],
    ['fourthDownEff', '4th Down Efficiency'],
    ['totalOffensivePlays', 'Total Plays'],
    ['totalYards', 'Total Yards'],
    ['yardsPerPlay', 'Yards per Play'],
    ['totalDrives', 'Total Drives'],
    ['netPassingYards', 'Passing Yards'],
    ['completionAttempts', 'Comp / Att'],
    ['yardsPerPass', 'Yards per Pass'],
    ['sacksYardsLost', 'Sacks – Yards Lost'],
    ['rushingYards', 'Rushing Yards'],
    ['rushingAttempts', 'Rushing Attempts'],
    ['yardsPerRushAttempt', 'Yards per Rush'],
    ['redZoneAttempts', 'Red Zone (Made–Att)'],
    ['totalPenaltiesYards', 'Penalties – Yards'],
    ['turnovers', 'Turnovers'],
    ['fumblesLost', 'Fumbles Lost'],
    ['interceptions', 'Interceptions'],
    ['defensiveTouchdowns', 'Def / ST Touchdowns'],
    ['possessionTime', 'Time of Possession']
  ];

  const PLAYER_CATEGORY_ORDER = [
    ['passing', 'Passing'],
    ['rushing', 'Rushing'],
    ['receiving', 'Receiving'],
    ['defensive', 'Defense'],
    ['interceptions', 'Interceptions'],
    ['fumbles', 'Fumbles'],
    ['kicking', 'Kicking'],
    ['punting', 'Punting'],
    ['kickReturns', 'Kick Returns'],
    ['puntReturns', 'Punt Returns']
  ];

  const state = {
    date: new Date(),      // selected day (local time)
    events: [],            // summarized events for the selected day
    weeks: [],             // flattened league calendar [{label, start, end}]
    phases: [],            // league calendar phases [{label, start, end}]
    seasonName: '',        // e.g. "Preseason", "Regular Season", "Postseason"
    eventIndex: -1,        // open game within state.events
    summary: null,         // raw summary JSON for the open game
    activeTab: 'plays',
    lastGameContentRenderAt: 0, // preserve the 5s cadence outside ruling-category tabs
    daySummaries: {},      // eventId -> { drives, situation, final }
    summaryRequests: {},   // eventId -> { promise, final } for an in-flight fetch
    liveHeaderRequest: null, // one in-flight league-wide live-score request
    dayFeed: { items: [], primed: false }, // confirmed nullified scores only
    dayAuditItems: [],     // current source irregularities; separate from live feed
    dayPendingRulings: {}, // prior pending source rows, for disappearance audits
    dayDisappearanceAuditItems: [], // current pending rows lost by the source
    dayBoothNullified: {}, // eventId -> newest scoring nullification, for card badges
    dayWatchTab: 'nullified', // selected all-games panel: nullified or audit
    alertedScoringKeys: {}, // scoring-play identities already announced
    fastPlaySignatures: {}, // eventId -> last fast-header play fingerprint
    audioContext: null,     // created only after a user gesture (browser policy)
    soundEnabled: true,     // only confirmed nullified scores can use this channel
    polling: null
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* -------------------------------- dates -------------------------------- */

  function toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return '' + y + m + day;
  }

  function fromYMD(ymd) {
    return new Date(
      Number(ymd.slice(0, 4)),
      Number(ymd.slice(4, 6)) - 1,
      Number(ymd.slice(6, 8))
    );
  }

  function addDays(d, n) {
    const x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function fmtDateLabel(d) {
    return d.toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  function fmtChipLabel(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function localTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function current() {
    return state.eventIndex >= 0 ? state.events[state.eventIndex] : null;
  }

  function recordLabel(c) {
    if (!c) return '';
    const recs = c.records || [];
    for (let i = 0; i < recs.length; i++) {
      if (recs[i].type === 'total' || recs[i].name === 'overall') {
        return recs[i].summary || '';
      }
    }
    return '';
  }

  function statusLabel(ev) {
    const st = ev.status || {};
    if (st.state === 'post') {
      return { cls: 'post', text: (st.period > 4 ? 'Final/OT' : 'Final'), sub: '' };
    }
    if (st.state === 'in') {
      return {
        cls: 'live',
        text: st.shortDetail || st.detail || 'Live',
        sub: st.clock || ''
      };
    }
    return { cls: 'pre', text: localTime(ev.date) || 'Scheduled', sub: '' };
  }

  /* ------------------------- league calendar / week ---------------------- */

  function parseCalendar(data) {
    state.weeks = [];
    state.phases = [];
    state.seasonName = '';
    const league = (data && data.leagues && data.leagues[0]) || null;
    if (!league) return;
    if (league.season && league.season.type) state.seasonName = league.season.type.name || '';
    (league.calendar || []).forEach(function (phase) {
      state.phases.push({
        label: phase.label || '',
        start: new Date(phase.startDate),
        end: new Date(phase.endDate)
      });
      (phase.entries || []).forEach(function (e) {
        state.weeks.push({
          label: e.label || '',
          start: new Date(e.startDate),
          end: new Date(e.endDate)
        });
      });
    });
  }

  function weekLabelFor(d) {
    const probe = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
    let i;
    for (i = 0; i < state.weeks.length; i++) {
      if (probe >= state.weeks[i].start && probe <= state.weeks[i].end) {
        return state.weeks[i].label;
      }
    }
    for (i = 0; i < state.phases.length; i++) {
      if (probe >= state.phases[i].start && probe <= state.phases[i].end) {
        return state.phases[i].label;
      }
    }
    const ev = state.events[0];
    if (ev && ev.week != null) return (state.seasonName || 'NFL') + ' · Week ' + ev.week;
    return '';
  }

  function updateWeekLabel() {
    const label = weekLabelFor(state.date);
    const el = $('week-label');
    el.textContent = label;
    el.classList.toggle('hidden', !label);
  }

  /* ------------------------------ scoreboard ----------------------------- */

  function fetchScoreboard(d) {
    return fetch(SCOREBOARD_URL + '?dates=' + encodeURIComponent(toYMD(d || state.date)), {
      cache: 'no-store'
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function loadScoreboard() {
    $('scoreboard-view').innerHTML = skeletonHTML();
    fetchScoreboard()
      .then(function (data) {
        parseCalendar(data);
        state.events = (data.events || []).map(NFLMap.summarizeEvent).filter(Boolean);
        renderScoreboard();
        updateLiveIndicator();
        refreshDayBooth();
      })
      .catch(function (err) {
        $('scoreboard-view').innerHTML =
          '<div class="error">Could not load scores: ' + esc(err && err.message || err) +
          '<br><small>Check your connection and try again.</small></div>';
      });
  }

  function refreshScoreboard() {
    fetchScoreboard()
      .then(function (data) {
        parseCalendar(data);
        const events = (data.events || []).map(NFLMap.summarizeEvent).filter(Boolean);
        const prevOpen = current();
        state.events = events;
        if (prevOpen) {
          state.eventIndex = state.events.findIndex(function (e) { return e.id === prevOpen.id; });
        }
        renderScoreboard();
        updateWeekLabel();
        updateLiveIndicator();
        if (state.eventIndex >= 0) {
          renderGameHeader();
          if (RULING_TABS.indexOf(state.activeTab) >= 0 && state.summary) {
            renderTabContent();
          }
        }
      })
      .catch(function () { /* keep last good data on transient failure */ });
  }

  function skeletonHTML() {
    let cards = '';
    for (let i = 0; i < 3; i++) {
      cards += '<div class="game-card skeleton" aria-hidden="true">' +
        '<div class="sk" style="width:42%"></div>' +
        '<div class="sk" style="width:88%"></div>' +
        '<div class="sk" style="width:88%"></div>' +
      '</div>';
    }
    return '<div class="cards">' + cards + '</div>';
  }

  function renderScoreboard() {
    const evs = state.events;
    updateWeekLabel();

    let html = '';
    if (!evs.length) {
      html = emptyDayHTML();
    } else {
      const live = evs.filter(function (e) { return e.status.state === 'in'; });
      const done = evs.filter(function (e) { return e.status.state === 'post'; });
      const pre = evs.filter(function (e) { return e.status.state === 'pre'; });
      html += groupHTML('In Progress', live);
      html += groupHTML('Final', done);
      html += groupHTML('Upcoming', pre);
    }
    $('scoreboard-view').innerHTML = html;

    if (!evs.length) findNearbyGameDays(state.date);
  }

  function groupHTML(title, list) {
    if (!list.length) return '';
    return '<h2 class="group-title">' + esc(title) + '</h2>' +
      '<div class="cards">' + list.map(cardHTML).join('') + '</div>';
  }

  function cardHTML(ev) {
    const st = statusLabel(ev);
    const away = ev.away, home = ev.home;
    if (!away || !home) return '';
    const sub = st.sub ? ' <span class="st-sub">' + esc(st.sub) + '</span>' : '';
    const bcast = ev.broadcast ? '<span class="card-bcast">' + esc(ev.broadcast) + '</span>' : '';
    // Potential rulings remain in the watch list without producing an alert
    // badge on a game card. Only a confirmed scoring nullification is promoted
    // to card-level visual emphasis.
    // Nullification state of this game's newest scoring-ruling event,
    // recomputed on every full play-by-play pass (see renderDayBooth): a score was taken
    // off the board on that play.
    const nullified = state.dayBoothNullified[ev.id];
    const nullBadge = nullified
      ? (nullified.removesPoints
        ? '<span class="badge removed">PTS REMOVED</span>'
        : '<span class="badge removed">NULLIFIED</span>')
      : '';
    const aria = esc(away.abbr) + ' at ' + esc(home.abbr) + ', ' + esc(st.text) +
      (away.score !== '' && home.score !== '' ? ', ' + esc(away.score) + ' to ' + esc(home.score) : '') +
      '. Open game details.';
    return '' +
      '<article class="game-card" data-id="' + esc(ev.id) + '" tabindex="0" role="button" aria-label="' + aria + '">' +
        '<div class="card-top">' +
          '<span class="badge ' + st.cls + '">' + esc(st.text) + sub + '</span>' +
          nullBadge + bcast +
        '</div>' +
        teamRowHTML(away) +
        teamRowHTML(home) +
      '</article>';
  }

  function teamRowHTML(t) {
    const rec = recordLabel(t);
    return '' +
      '<div class="team-row' + (t.winner ? ' winner' : '') + '">' +
        '<div class="team-id">' +
          '<img class="logo" src="' + esc(t.logo) + '" alt="" loading="lazy">' +
          '<div class="team-name"><span class="abbr">' + esc(t.abbr) + '</span>' +
            '<span class="rec">' + esc(rec) + '</span></div>' +
        '</div>' +
        '<div class="team-score">' + esc(t.score) + '</div>' +
      '</div>';
  }

  /* ------------------------- empty days & nearby games ------------------- */

  function emptyDayHTML() {
    return '<div class="empty">' +
      '<div class="empty-title">No games on ' + esc(fmtDateLabel(state.date)) + '</div>' +
      '<div class="empty-sub">The NFL doesn&rsquo;t play every day &mdash; use the &#8249; &#8250; arrows to browse,<br>' +
      'or jump straight to a nearby game day:</div>' +
      '<div id="nearby-days" class="nearby-days"><span class="muted">Looking for nearby games&hellip;</span></div>' +
    '</div>';
  }

  function findNearbyGameDays(base) {
    const stamp = toYMD(base);
    const offsets = [-7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7];
    Promise.all(offsets.map(function (off) {
      const d = addDays(base, off);
      return fetchScoreboard(d)
        .then(function (data) { return { date: d, count: (data.events || []).length }; })
        .catch(function () { return null; });
    })).then(function (results) {
      if (toYMD(state.date) !== stamp) return; // the user moved on
      const el = $('nearby-days');
      if (!el) return;
      const hits = results
        .filter(function (r) { return r && r.count > 0; })
        .sort(function (a, b) {
          return Math.abs(a.date - base) - Math.abs(b.date - base);
        })
        .slice(0, 6);
      if (!hits.length) {
        el.innerHTML = '<span class="muted">No games found within a week.</span>';
        return;
      }
      el.innerHTML = hits.map(function (r) {
        const past = r.date.getTime() < base.getTime();
        return '<button class="day-chip" data-ymd="' + toYMD(r.date) + '">' +
          '<span class="chip-dir">' + (past ? '&#8249;' : '&#8250;') + '</span>' +
          esc(fmtChipLabel(r.date)) +
          '<span class="chip-n">' + r.count + (r.count === 1 ? ' game' : ' games') + '</span>' +
        '</button>';
      }).join('');
    });
  }

  function updateLiveIndicator() {
    const live = state.events.some(function (e) { return e.status.state === 'in'; });
    $('live-indicator').classList.toggle('hidden', !live);
  }

  /* Everything a game card can show about the scoring-rulings watch, folded
   * into one comparable string so a fast-header tick repaints cards only for
   * a confirmed nullification badge. */
  function boothCardSignature(ev) {
    if (!ev) return '';
    const nullified = state.dayBoothNullified[ev.id];
    return nullified ? (nullified.removesPoints ? 'removed' : 'nullified') : '';
  }

  /* ---------------- day-wide confirmed-nullification watch --------------- */
  /*
   * The live all-games stream contains confirmed score nullifications only.
   * Every scoring-linked flag, challenge, replay, and under-review record is
   * still mapped from observed ESPN Gamecast fields (summary.drives and each
   * game's latest compact-header lastPlay), but it stays in its dedicated
   * game tab until a final nullification is evidenced. Data irregularities
   * use a separate audit view; no source outcome is invented.
   */

  function summarySituation(summary) {
    const competitions = summary && summary.header && summary.header.competitions;
    const competition = competitions && competitions[0];
    return (competition && competition.situation) || null;
  }

  /* Share one request when the day feed and an open game need the same JSON. */
  function fetchSummaryQuiet(id, isFinalSnapshot) {
    if (state.summaryRequests[id]) return state.summaryRequests[id];

    const entry = {
      final: !!isFinalSnapshot,
      promise: fetch(SUMMARY_URL + '?event=' + encodeURIComponent(id), {
        cache: 'no-store'
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
    };
    state.summaryRequests[id] = entry;

    function clearRequest() {
      if (state.summaryRequests[id] === entry) delete state.summaryRequests[id];
    }
    entry.promise.then(clearRequest, clearRequest);
    return entry;
  }

  function cacheDaySummary(id, json, isFinal) {
    state.daySummaries[id] = {
      drives: json.drives || null,
      situation: summarySituation(json),
      final: !!isFinal
    };
  }

  /*
   * The summary response is already fetched every second for each live game
   * so the booth can inspect its play-by-play. Its header competition carries
   * the same score/status-shaped fields used by the scoreboard. Apply only
   * fields that are actually present; a partial summary (for example one
   * containing just situation.lastPlay) must never overwrite a good card with
   * blank data. This removes the former 0–14.999s wait for the separate
   * scoreboard poll to paint a score that ESPN has already published in the
   * summary response.
   */
  function eventCardSignature(ev) {
    if (!ev) return '';
    const away = ev.away || {};
    const home = ev.home || {};
    const st = ev.status || {};
    return [away.score, home.score, st.state, st.shortDetail, st.detail,
      st.clock, st.period, !!st.completed].join('|') + '|' + boothCardSignature(ev);
  }

  function hydrateEventFromSummary(ev, json) {
    const competition = json && json.header && json.header.competitions &&
      json.header.competitions[0];
    if (!ev || !competition) return false;

    let changed = false;
    const bySide = {};
    (competition.competitors || []).forEach(function (competitor) {
      if (competitor && (competitor.homeAway === 'away' || competitor.homeAway === 'home')) {
        bySide[competitor.homeAway] = competitor;
      }
    });

    ['away', 'home'].forEach(function (side) {
      const target = ev[side];
      const source = bySide[side];
      if (!target || !source) return;
      if (source.score != null && target.score !== String(source.score)) {
        target.score = String(source.score);
        changed = true;
      }
      if (source.winner != null && target.winner !== !!source.winner) {
        target.winner = !!source.winner;
        changed = true;
      }
      if (Array.isArray(source.linescores)) {
        const nextLinescores = source.linescores;
        if (JSON.stringify(target.linescores || []) !== JSON.stringify(nextLinescores)) {
          target.linescores = nextLinescores;
          changed = true;
        }
      }
    });

    // statusInfo is the existing, fixture-tested mapper for a competition.
    // Do not replace status unless the response includes its type object.
    if (competition.status && competition.status.type) {
      const nextStatus = NFLMap.statusInfo(competition);
      if (JSON.stringify(ev.status || {}) !== JSON.stringify(nextStatus)) {
        ev.status = nextStatus;
        changed = true;
      }
    }
    if (competition.situation && ev.situation !== competition.situation) {
      ev.situation = competition.situation;
      changed = true;
    }
    if (competition.playByPlayAvailable != null &&
        ev.playByPlayAvailable !== competition.playByPlayAvailable) {
      ev.playByPlayAvailable = competition.playByPlayAvailable;
      changed = true;
    }
    return changed;
  }

  /*
   * ESPN's live header endpoint does not use the scoreboard's nested
   * `competition` shape. Adapt only its observed live fields, then share the
   * guarded summary hydrator above. This keeps the two feeds consistent and
   * ignores any missing/partial header fields.
   */
  function liveHeaderEvents(data) {
    const out = [];
    (data && data.sports || []).forEach(function (sport) {
      (sport && sport.leagues || []).forEach(function (league) {
        (league && league.events || []).forEach(function (event) { out.push(event); });
      });
    });
    return out;
  }

  function headerCompetition(event) {
    if (!event) return null;
    const full = event.fullStatus || {};
    return {
      competitors: (event.competitors || []).map(function (team) {
        return {
          homeAway: team.homeAway,
          score: team.score,
          winner: team.winner
        };
      }),
      status: full.type ? {
        type: full.type,
        displayClock: full.displayClock != null ? full.displayClock : full.clock,
        period: full.period
      } : null,
      situation: event.situation || null,
      playByPlayAvailable: event.playByPlayAvailable
    };
  }

  function fastHeaderPlaySignature(ev) {
    const play = ev && ev.situation && ev.situation.lastPlay;
    if (!play) return '';
    return [
      play.id != null ? play.id : '',
      play.sequenceNumber != null ? play.sequenceNumber : '',
      play.text || play.shortText || '',
      play.awayScore != null ? play.awayScore : '',
      play.homeScore != null ? play.homeScore : '',
      play.scoringPlay === true ? '1' : '0',
      play.isPenalty === true ? '1' : '0',
      play.type && play.type.text || ''
    ].join('|');
  }

  function recordFastHeaderPlay(ev) {
    if (!ev || ev.id == null) return false;
    const id = String(ev.id);
    const signature = fastHeaderPlaySignature(ev);
    if (state.fastPlaySignatures[id] === signature) return false;
    state.fastPlaySignatures[id] = signature;
    return true;
  }

  function refreshLiveScores() {
    // This endpoint is for ESPN's current live header; it is not a substitute
    // for browsing an arbitrary historical day, and is skipped when nothing
    // selected is live.
    if (!state.events.some(function (ev) { return ev.status && ev.status.state === 'in'; })) return;
    // A timer tick never starts a second league-wide request while the prior
    // one is still on the wire. This bounds traffic and prevents an older
    // response from racing a newer one.
    if (state.liveHeaderRequest) return;
    const stamp = toYMD(state.date);
    // `cache: no-store` controls the browser cache. A unique, ignored query
    // value also prevents a query-keyed intermediary from reusing the prior
    // poll response; it cannot force ESPN's origin to publish a newer update.
    const url = LIVE_HEADER_URL + '&_=' + Date.now();
    const request = fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    state.liveHeaderRequest = request;
    request
      .then(function (data) {
        if (toYMD(state.date) !== stamp) return;
        const byId = {};
        liveHeaderEvents(data).forEach(function (event) {
          if (event && event.id != null) byId[String(event.id)] = event;
        });
        let cardsChanged = false;
        let openChanged = false;
        let fastPlayChanged = false;
        const cardSignatures = {};
        state.events.forEach(function (ev) {
          const source = byId[String(ev.id)];
          if (!source) return;
          cardSignatures[String(ev.id)] = eventCardSignature(ev);
          const competition = headerCompetition(source);
          if (!competition) return;
          hydrateEventFromSummary(ev, { header: { competitions: [competition] } });
          // The 250 ms header is the fast lane for a new scoring review or
          // penalty. It updates the all-games scoring watch immediately; the
          // full play-by-play response reconciles it on the next detail pass.
          if (recordFastHeaderPlay(ev)) fastPlayChanged = true;
        });
        if (fastPlayChanged) {
          renderDayBooth();
          // The fast header is also useful while a listener is watching one
          // of the focused ruling categories: render that view immediately,
          // while the full one-second play-by-play response reconciles it.
          if (state.summary && current() && RULING_TABS.indexOf(state.activeTab) >= 0) {
            renderGameHeader();
            renderTabContent();
            state.lastGameContentRenderAt = Date.now();
          }
        }
        state.events.forEach(function (ev) {
          if (cardSignatures[String(ev.id)] === eventCardSignature(ev)) return;
          cardsChanged = true;
          if (current() === ev) openChanged = true;
        });
        if (cardsChanged && !$('scoreboard-view').classList.contains('hidden')) renderScoreboard();
        if (openChanged && current()) renderGameHeader();
      })
      .catch(function () { /* the detail/scoreboard paths remain fallbacks */ })
      .then(function () {
        if (state.liveHeaderRequest === request) state.liveHeaderRequest = null;
      });
  }

  function dayBoothGames() {
    return state.events.slice().sort(function (a, b) {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return ta - tb;
    });
  }

  function dayBoothScannable(ev) {
    const st = ev.status && ev.status.state;
    if (st !== 'in' && st !== 'post') return false;      // pre-game: no plays yet
    if (ev.playByPlayAvailable === false) return false;  // ESPN has no pbp for it
    return true;
  }

  /*
   * Fetch play-by-play for every selected-day game that has (or had) action:
   * live games on every one-second scoring-rulings cycle, then one final
   * snapshot after the scoreboard reports it finished. Each response updates
   * cached data and the focused watch; larger non-ruling tabs repaint at most
   * every five seconds. The interval is an attempted client schedule, not an
   * upstream-data latency guarantee.
   */
  function refreshDayBooth() {
    if (!state.events.length) {
      renderDayBooth();
      return;
    }
    const stamp = toYMD(state.date);
    const jobs = [];
    state.events.forEach(function (ev) {
      if (!ev.id || !dayBoothScannable(ev)) return;
      if (state.summaryRequests[ev.id]) return;
      const st = ev.status && ev.status.state;
      const cached = state.daySummaries[ev.id];
      if (st === 'post' && cached && cached.final) return;

      const request = fetchSummaryQuiet(ev.id, st === 'post');
      jobs.push(
        request.promise
          .then(function (json) {
            if (toYMD(state.date) !== stamp) return; // the user moved on
            const cardSigBefore = eventCardSignature(ev);
            cacheDaySummary(ev.id, json, request.final);
            hydrateEventFromSummary(ev, json);

            const open = current();
            if (open && open.id === ev.id) {
              state.summary = json;
              // Reviews render on every response. Other large tabs retain their
              // prior five-second paint cadence to avoid one-second DOM churn.
              const now = Date.now();
              const shouldRenderGame = NFLRefresh.shouldRenderGameContent(
                state.activeTab, state.lastGameContentRenderAt, now);
              if (shouldRenderGame) {
                renderGameHeader();
                renderTabContent();
                state.lastGameContentRenderAt = now;
              }
            }
            // renderDayBooth refreshes the day feed and this game's card-badge
            // state; then repaint the cards only when a badge (review /
            // nullified / points removed) actually changed.
            renderDayBooth();
            if (eventCardSignature(ev) !== cardSigBefore &&
                !$('scoreboard-view').classList.contains('hidden')) {
              renderScoreboard();
            }
          })
          .catch(function () { /* keep last good data on transient failure */ })
      );
    });
    // Paint an empty/loading feed once, but do not rebuild an unchanged feed on
    // every one-second tick when there is no request to make.
    if (!jobs.length && !state.dayFeed.primed) renderDayBooth();
  }

  /*
   * Browsers may block audio until the listener has interacted with the page.
   * A gesture unlocks Web Audio for a later confirmed scoring nullification;
   * pending reviews, challenges, flags, and integrity checks never play sound.
   */
  function unlockBoothAudio() {
    if (state.audioContext || typeof AudioContext === 'undefined') return;
    try {
      state.audioContext = new AudioContext();
      if (state.audioContext.state === 'suspended') state.audioContext.resume();
    } catch (e) {
      state.audioContext = null;
    }
  }

  /*
   * A gentle 3-second "rain" alert: a soft low-passed noise bed (steady
   * rainfall) that fades in and out, plus three quiet descending sine
   * "droplet" plips so it clearly reads as water. This replaced an earlier
   * 180 Hz sawtooth buzzer that was unpleasant to hear repeatedly.
   */
  function playBoothAlert(events) {
    // Keep the sound primitive itself outcome-gated as a second line of
    // defense. It is invoked with newly discovered mapper records below.
    if (!(events || []).some(confirmedNullifiedScoringEvent)) return;
    const ctx = state.audioContext;
    if (!ctx) return;
    try {
      const start = ctx.currentTime;
      const DURATION = 3; // seconds — matches the old alert length

      // --- Rain bed: brown-ish noise, softened by a low-pass filter ---
      const sampleRate = ctx.sampleRate || 44100;
      const frameCount = Math.floor(sampleRate * DURATION);
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);
      // Integrate white noise (leaky integrator) so the hiss is deep and
      // soft like rainfall instead of harsh static.
      let last = 0;
      for (let i = 0; i < frameCount; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
      const rain = ctx.createBufferSource();
      rain.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, start);
      const rainGain = ctx.createGain();
      rainGain.gain.setValueAtTime(0.0001, start);
      rainGain.gain.linearRampToValueAtTime(0.22, start + 0.5);   // gentle fade in
      rainGain.gain.setValueAtTime(0.22, start + 2.3);            // hold
      rainGain.gain.linearRampToValueAtTime(0.0001, start + DURATION); // fade out
      rain.connect(filter);
      filter.connect(rainGain);
      rainGain.connect(ctx.destination);
      rain.start(start);
      rain.stop(start + DURATION);

      // --- Water droplets: quiet falling sine "plips" over the rain bed ---
      [
        { at: 0.7, freq: 1200 },
        { at: 1.4, freq: 900 },
        { at: 2.1, freq: 1050 }
      ].forEach(function (drop) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = start + drop.at;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(drop.freq, t);
        osc.frequency.linearRampToValueAtTime(drop.freq * 0.55, t + 0.15);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.07, t + 0.02);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.3);
      });
    } catch (e) {
      // Audio is an enhancement; a browser/device audio failure must not stop polling.
    }
  }

  function loadBoothSoundPref() {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = localStorage.getItem(BOOTH_SOUND_KEY);
      if (stored === '0') state.soundEnabled = false;
      else if (stored === '1') state.soundEnabled = true;
    } catch (e) { /* storage unavailable — keep the default (on) */ }
  }

  function saveBoothSoundPref() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(BOOTH_SOUND_KEY, state.soundEnabled ? '1' : '0');
    } catch (e) { /* storage unavailable — ignore */ }
  }

  function toggleBoothSound() {
    state.soundEnabled = !state.soundEnabled;
    saveBoothSoundPref();
    renderDayBooth(); // refresh the button label/state in the watch header
    // This user gesture can unlock Web Audio for a later *real* alert. It
    // intentionally does not play a preview: sound is reserved for a
    // confirmed nullified scoring play.
    unlockBoothAudio();
    if (state.audioContext && state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
  }

  function nullificationNotificationBody(event) {
    const scoring = event && (event.scoringPlay || event.relatedScoringPlay);
    const type = scoring && scoring.scoreLabel ? scoring.scoreLabel : 'Scoring play';
    const game = event && event.shortName ? event.shortName : 'NFL game';
    const detail = event && event.removesPoints && event.pointsRemoved
      ? ' ' + event.pointsRemoved + ' point' + (event.pointsRemoved === 1 ? '' : 's') + ' removed.'
      : ' Source text reports the score was nullified.';
    return game + ' — ' + type + ' nullified.' + detail;
  }

  function notifyNullifiedScoringPlays(events) {
    // Do not request permission or prompt the user. If the browser has already
    // granted desktop notifications, use that channel only for a confirmed
    // nullified score; otherwise the visual feed remains the notification.
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    (events || []).forEach(function (event) {
      if (!confirmedNullifiedScoringEvent(event)) return;
      try {
        new Notification('NFL scoring play nullified', {
          body: nullificationNotificationBody(event),
          tag: 'nfl-nullified-' + scoringIdentity(event),
          renotify: true
        });
      } catch (e) { /* desktop notifications are optional enhancement */ }
    });
  }

  function primeScoringAlerts(events) {
    (events || []).forEach(function (event) {
      if (!confirmedNullifiedScoringEvent(event)) return;
      const key = scoringIdentity(event);
      if (key) state.alertedScoringKeys[key] = true;
    });
  }

  function announceNewBoothEvents(fresh) {
    const announced = [];
    (fresh || []).forEach(function (event) {
      // Pending, retained and integrity rows are intentionally silent.
      if (!confirmedNullifiedScoringEvent(event)) return;
      const key = scoringIdentity(event);
      if (!key || state.alertedScoringKeys[key]) return;
      state.alertedScoringKeys[key] = true;
      announced.push(event);
    });
    if (!announced.length) return;
    // One sound per completed polling pass even if the source publishes a
    // pending row and a replay verdict together for the same scoring play.
    if (state.soundEnabled) playBoothAlert(announced);
    notifyNullifiedScoringPlays(announced);
  }

  /*
   * The day-wide feed is deliberately narrower than the per-game tracking
   * views. We still map every scoring-linked potential/ruling on each fast
   * response, but pass only an evidence-backed NULLIFIED record into this
   * all-games feed. Source irregularities are kept in a separate audit tab.
   */
  function dayWatchGames() {
    return dayBoothGames().map(function (ev) {
      const cached = state.daySummaries[ev.id] || null;
      const cachedPlay = cached && cached.situation && cached.situation.lastPlay;
      // The 250 ms header can be newer than the cached full summary.
      const lastPlay = (ev.situation && ev.situation.lastPlay) || cachedPlay || null;
      const sourceEvents = NFLMap.scoringWatchEvents(cached && cached.drives, lastPlay)
        .map(function (event) {
          const isFastHeaderPlay = !!(lastPlay && event.id != null && lastPlay.id != null &&
            String(event.id) === String(lastPlay.id));
          return Object.assign({}, event, {
            sourceLane: isFastHeaderPlay ? 'fast-header' : 'play-by-play'
          });
        });

      // More than one source record can describe one scoring play. The day
      // feed represents that play once, preferring its later verdict.
      const nullified = uniqueScoringEvents(sourceEvents, confirmedNullifiedScoringEvent);
      const audit = sourceEvents.filter(function (event) {
        return !!(event && (event.irregularity || event.scoringWatch === 'irregular' ||
          event.kind === 'integrity'));
      });
      const latestNullified = nullified.length ? nullified[nullified.length - 1] : null;
      // Card badges remain outcome-only: a potential or audit record cannot
      // make a card look like points were removed.
      state.dayBoothNullified[ev.id] = latestNullified
        ? {
          removesPoints: !!latestNullified.removesPoints,
          points: latestNullified.pointsRemoved || 0
        }
        : null;

      return {
        id: ev.id,
        shortName: ev.shortName ||
          (ev.away && ev.home ? ev.away.abbr + ' @ ' + ev.home.abbr : ''),
        awayAbbr: (ev.away && ev.away.abbr) || '',
        homeAbbr: (ev.home && ev.home.abbr) || '',
        date: ev.date || null,
        live: !!(ev.status && ev.status.state === 'in'),
        events: sourceEvents,
        pending: sourceEvents.filter(function (event) {
          return !!(event && event.scoringWatch === 'pending');
        }),
        nullified: nullified,
        audit: audit
      };
    });
  }

  function asDayFeed(games, field) {
    return NFLMap.dayBoothFeed((games || []).map(function (game) {
      return Object.assign({}, game, { events: game[field] || [] });
    }));
  }

  function pendingRulingMap(items) {
    const map = {};
    (items || []).forEach(function (event) {
      if (event && event.key != null && event.scoringWatch === 'pending') {
        map[String(event.key)] = event;
      }
    });
    return map;
  }

  function pendingDisappearanceAudits(previous, current) {
    const currentKeys = {};
    const currentScoring = {};
    (current || []).forEach(function (event) {
      if (!event) return;
      if (event.key != null) currentKeys[String(event.key)] = true;
      const scoringKey = scoringIdentity(event);
      if (scoringKey) currentScoring[scoringKey] = true;
    });
    return Object.keys(previous || {}).reduce(function (out, key) {
      const prior = previous[key];
      // If a revised source row still identifies the same scoring play, it is
      // a resolved/updated ruling rather than a provider disappearance.
      if (!prior || currentKeys[key] || currentScoring[scoringIdentity(prior)]) return out;
      out.push(Object.assign({}, prior, {
        kind: 'integrity',
        heading: 'Pending scoring ruling no longer in source',
        scoringWatch: 'irregular',
        irregularity: true,
        nullified: false,
        removesPoints: false,
        pointsRemoved: 0,
        removedTeam: '',
        nullificationEvidence: 'pending source ruling disappeared before a final outcome'
      }));
      return out;
    }, []);
  }

  function activeDisappearanceAudits(existing, additions, current) {
    const currentKeys = {};
    const currentScoring = {};
    (current || []).forEach(function (event) {
      if (!event) return;
      if (event.key != null) currentKeys[String(event.key)] = true;
      const scoringKey = scoringIdentity(event);
      if (scoringKey) currentScoring[scoringKey] = true;
    });
    const seen = {};
    return (existing || []).concat(additions || []).reduce(function (out, event) {
      if (!event || (event.key != null && currentKeys[String(event.key)]) ||
          currentScoring[scoringIdentity(event)]) return out;
      const key = event.key != null ? String(event.key) : scoringIdentity(event);
      if (key && seen[key]) return out;
      if (key) seen[key] = true;
      out.push(event);
      return out;
    }, []);
  }

  function renderDayBooth() {
    const el = $('day-booth');
    if (!el) return;
    if (!state.events.length) {
      el.classList.add('hidden');
      return;
    }
    // Keep the section hidden while the game view is open (background refresh
    // still updates its content, but it must not reappear underneath).
    if ($('scoreboard-view').classList.contains('hidden')) {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }

    const games = dayWatchGames();
    const freshAll = asDayFeed(games, 'events');
    const freshPending = asDayFeed(games, 'pending');
    const freshNullified = asDayFeed(games, 'nullified');
    const sourceAudit = asDayFeed(games, 'audit');
    const disappearedAudit = pendingDisappearanceAudits(state.dayPendingRulings, freshAll);
    const activeDisappearances = activeDisappearanceAudits(
      state.dayDisappearanceAuditItems, disappearedAudit, freshAll);
    const freshAudit = sourceAudit.concat(activeDisappearances);
    state.dayPendingRulings = pendingRulingMap(freshPending);
    state.dayDisappearanceAuditItems = activeDisappearances;

    // This is a live outcome feed, not a historical transcript: a row stays
    // visible only while the current provider snapshot still calls it
    // nullified. First paint is silent; later new nullifications are the only
    // events allowed through alerting.
    if (!state.dayFeed.primed) {
      state.dayFeed.primed = true;
      primeScoringAlerts(freshNullified);
    } else {
      announceNewBoothEvents(freshNullified);
    }
    state.dayFeed.items = freshNullified;
    // Audit items reflect current source irregularities plus a pending record
    // that just disappeared without an equivalent result. They remain silent
    // and never enter the confirmed-nullification stream.
    state.dayAuditItems = freshAudit;

    const feed = el.querySelector('.day-feed');
    const prevScroll = feed ? feed.scrollTop : 0;
    const nearBottom = !feed ||
      (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 56);

    el.innerHTML = dayBoothHTML();

    const feed2 = el.querySelector('.day-feed');
    if (feed2) {
      if (nearBottom) feed2.scrollTop = feed2.scrollHeight;
      else feed2.scrollTop = prevScroll;
    }
  }

  function liveGamesNow() {
    const live = {};
    state.events.forEach(function (ev) {
      if (ev.id && ev.status && ev.status.state === 'in') live[ev.id] = true;
    });
    return live;
  }

  function dayWatchTabsHTML(tab, nullifiedCount, auditCount) {
    const counts = { nullified: nullifiedCount, integrity: auditCount };
    return DAY_WATCH_TABS.map(function (pair) {
      const id = pair[0];
      const count = counts[id] || 0;
      return '<button type="button" class="booth-filter day-watch-tab' +
        (tab === id ? ' active' : '') + '" data-day-tab="' + id + '">' +
        esc(pair[1]) + ' · ' + count + '</button>';
    }).join('');
  }

  function dayBoothHTML() {
    const tab = state.dayWatchTab === 'integrity' ? 'integrity' : 'nullified';
    const nullifiedItems = state.dayFeed.items || [];
    const auditItems = state.dayAuditItems || [];
    const items = tab === 'integrity' ? auditItems : nullifiedItems;
    const liveNow = liveGamesNow();
    const scannable = state.events.filter(dayBoothScannable).length;
    const scanned = Object.keys(state.daySummaries).length;
    const liveCount = state.events.filter(function (e) {
      return e.status && e.status.state === 'in';
    }).length;
    const tabs = dayWatchTabsHTML(tab,
      uniqueScoringEvents(nullifiedItems, confirmedNullifiedScoringEvent).length,
      auditItems.length);
    const baseFoot =
      'TD (offense / defense / special teams), FG, PAT, 2-point and safety · fast last-play header ' +
      LIVE_SCORE_SECONDS + 's attempted · full play-by-play ' + LIVE_REVIEW_SECONDS + 's' +
      (scannable ? ' · games scanned ' + scanned + ' of ' + scannable : '') +
      (liveCount ? ' · ' + liveCount + ' game' + (liveCount === 1 ? '' : 's') + ' live' : '');
    const title = tab === 'integrity'
      ? 'Source data checks · all games'
      : 'Confirmed nullified scoring plays · all games';
    const foot = tab === 'integrity'
      ? 'Current provider score irregularities and unresolved disappeared pending records · alerts are suppressed · ' + baseFoot
      : 'Only confirmed, scoring-linked nullifications appear here · potential and retained rulings remain in their separate game tabs · ' + baseFoot;

    // Count distinct scoring plays, not every row in a review sequence.
    const nullifiedAll = uniqueScoringEvents(nullifiedItems, confirmedNullifiedScoringEvent);
    let topBanner = '';
    if (tab === 'nullified' && nullifiedAll.length) {
      const summary = nullifiedAll.slice(0, 3).map(function (e) {
        const pts = e.removesPoints ? ' ' + e.pointsRemoved + 'pts' : '';
        return esc(e.shortName + ':' + pts);
      }).join(', ');
      const more = nullifiedAll.length > 3 ? ' +' + (nullifiedAll.length - 3) + ' more' : '';
      topBanner = '<div class="booth-banner removed-banner day-removed-banner" role="status">' +
        '<span class="badge removed">' + nullifiedAll.length + ' NULLIFIED</span>' +
        '<span>Provider-published nullification evidence: ' + summary + more + '.</span>' +
      '</div>';
    }

    let body;
    if (!items.length) {
      const empty = tab === 'integrity'
        ? 'No current provider score irregularities need review.'
        : (scanned < scannable
          ? 'Scanning today&rsquo;s games for confirmed nullified scoring plays&hellip;'
          : 'No confirmed nullified scoring plays today &mdash; no touchdown, field goal, try, or safety has been taken off the board.');
      body = '<div class="empty booth-empty">' + empty + '</div>';
    } else {
      body = '<div class="day-feed" role="log" aria-live="off">' +
        items.map(function (e) {
          return dayBoothMsgHTML(e, !!liveNow[e.gameId]);
        }).join('') +
      '</div>';
    }

    const soundOn = !!state.soundEnabled;
    const soundTitle = soundOn
      ? 'Alert sound ON — it plays only after a confirmed nullified scoring play. Click to mute.'
      : 'Alert sound OFF — click to enable alerts for confirmed nullified scoring plays.';
    const provenance = '<div class="watch-provenance">' +
      '<span class="source-tag">LIVE PROVIDER: ESPN GAMECAST</span>' +
      '<span>Fast header detection is reconciled against full play-by-play. ' +
      '<a href="https://operations.nfl.com/rules-officiating/2026-nfl-rulebook" target="_blank" rel="noopener noreferrer">NFL rules source</a> ' +
      'is used for scoring/replay criteria; this app does not claim a direct NFL officiating feed. ' +
      '<a href="verification.md" target="_blank" rel="noopener noreferrer">Field verification &amp; limits</a>. ' +
      'Polling is attempted on a schedule, not a freshness guarantee: upstream publication, network/rate limits, background-tab scheduling, and browser autoplay can delay an update or sound.</span>' +
    '</div>';
    return '<div class="booth day-booth">' +
      '<div class="booth-head">' +
        '<div class="booth-head-main">' +
          '<div class="booth-title">' + esc(title) + '</div>' +
          '<div class="booth-sub">' + esc(foot) + '</div>' +
        '</div>' +
        '<button type="button" class="day-sound-btn' + (soundOn ? ' on' : '') +
          '" aria-pressed="' + (soundOn ? 'true' : 'false') + '"' +
          ' title="' + soundTitle + '">' +
          (soundOn ? '&#128276; Sound On' : '&#128263; Sound Off') +
        '</button>' +
      '</div>' +
      provenance +
      '<div class="booth-filters day-watch-tabs">' + tabs + '</div>' +
      topBanner +
      body +
    '</div>';
  }

  function scorePair(away, home) {
    return String(away != null ? away : 0) + '–' + String(home != null ? home : 0);
  }

  function scoringWatchNoteHTML(e) {
    if (!e) return '';
    const scoring = e.scoringPlay || e.relatedScoringPlay || null;
    const scoreLabel = scoring && scoring.scoreLabel ? scoring.scoreLabel : 'scoring play';
    const sourcePlay = scoring && scoring.text
      ? '<span class="booth-note">Scoring play: ' + esc(scoring.text) + '</span>'
      : '';
    if (e.irregularity || e.scoringWatch === 'irregular') {
      const detail = e.nullificationEvidence === 'pending source ruling disappeared before a final outcome'
        ? 'the provider no longer includes the pending scoring ruling in its latest play-by-play'
        : 'the provider lowered a running score, but no contiguous scoring ruling identifies why';
      return '<span class="booth-note integrity-note">Data check: ' + esc(detail) +
        '. Alert suppressed; review the source record.</span>';
    }
    if (e.scoringWatch === 'pending') {
      return '<span class="booth-note pending-note">Potential ' + esc(scoreLabel) +
        ' ruling — awaiting a final source update. No alert has been sent.</span>' + sourcePlay;
    }
    if (e.scoringWatch === 'retained') {
      return '<span class="booth-note retained-note">No score rollback was published before the source moved on. This is not a nullification.</span>' + sourcePlay;
    }
    if (boothEventNullified(e)) {
      const evidence = e.nullificationEvidence
        ? '<span class="booth-note">Evidence: ' + esc(e.nullificationEvidence) + '.</span>'
        : '';
      return evidence + sourcePlay;
    }
    return sourcePlay;
  }

  function boothScoreTrailHTML(e, awayAbbr, homeAbbr) {
    const note = scoringWatchNoteHTML(e);
    if (e.beforeAwayScore == null || e.duringAwayScore == null || e.afterAwayScore == null) return note;
    const before = scorePair(e.beforeAwayScore, e.beforeHomeScore);
    const during = scorePair(e.duringAwayScore, e.duringHomeScore);
    const after = scorePair(e.afterAwayScore, e.afterHomeScore);
    const removedAbbr = e.removedTeam === 'away' ? awayAbbr
      : (e.removedTeam === 'home' ? homeAbbr : '');
    const removedBadge = e.removesPoints
      ? '<span class="badge removed">' +
          (removedAbbr ? esc(removedAbbr) + ' ' : '') +
          '&minus;' + esc(e.pointsRemoved) + ' PTS</span>'
      : '';
    // A nullification ESPN has not published a score drop for yet (the text
    // says NULLIFIED / No Play / REVERSED) still gets flagged here.
    const nullifiedBadge = (!e.removesPoints && boothEventNullified(e))
      ? '<span class="badge removed">NULLIFIED</span>'
      : '';
    const stateCls = boothEventNullified(e) ? ' removed' : '';
    return '<span class="booth-state' + stateCls + '">' +
      '<span class="bsh-label">Score</span>' +
      '<span class="bsh-before">' + esc(before) + '</span>' +
      '<span class="bsh-arrow">&#8594;</span>' +
      '<span class="bsh-during' + stateCls + '">' + esc(during) + '</span>' +
      '<span class="bsh-arrow">&#8594;</span>' +
      '<span class="bsh-after' + (e.removesPoints ? ' removed' : '') + '">' + esc(after) + '</span>' +
      removedBadge +
      nullifiedBadge +
    '</span>' +
    note;
  }

  function scoringWatchChipHTML(e) {
    if (!e) return '';
    const watch = e.scoringWatch || (boothEventNullified(e) ? 'nullified' : '');
    if (!watch) return '';
    const label = SCORING_WATCH_LABEL[watch] || watch;
    const cls = watch === 'nullified' ? ' removed' :
      (watch === 'pending' ? ' pending-score' :
        (watch === 'retained' ? ' retained-score' : ' integrity'));
    const title = watch === 'pending'
      ? 'Potential scoring ruling. It is not a nullification and will not alert.'
      : (watch === 'retained'
        ? 'The source moved on without a score rollback.'
        : (watch === 'irregular'
          ? 'Source score correction needs review. Alert suppressed.'
          : 'Confirmed nullified scoring play.'));
    return '<span class="badge watch-status' + cls + '" title="' + esc(title) + '">' +
      esc(label) + '</span>';
  }

  function sourceLaneChipHTML(e) {
    if (!e || e.sourceLane !== 'fast-header') return '';
    return '<span class="badge source-lane" title="Detected on the fast live-header lane; full play-by-play will reconcile it.">FAST</span>';
  }

  function dayBoothMsgHTML(e, liveNow) {
    const q = NFLMap.quarterLabel(e.quarter);
    const when = [q, e.clock].filter(Boolean).join(' · ');
    const kind = BOOTH_KIND_LABEL[e.kind] || e.kind;
    const result = e.result ? BOOTH_RESULT_LABEL[e.result] || e.result : '';
    const duringScore = (e.duringAwayScore != null && e.duringHomeScore != null)
      ? scorePair(e.duringAwayScore, e.duringHomeScore)
      : ((e.awayScore != null && e.homeScore != null)
        ? scorePair(e.awayScore, e.homeScore)
        : '');
    const score = duringScore
      ? esc(e.awayAbbr) + ' ' + esc(duringScore) + ' ' + esc(e.homeAbbr)
      : '';
    const logo = e.team && e.team.logo
      ? '<img class="logo" src="' + esc(e.team.logo) + '" alt="">'
      : '';
    const team = e.team && e.team.abbr
      ? '<span class="booth-team">' + esc(e.team.abbr) + '</span>'
      : '';
    const dd = e.downDistance
      ? '<span class="booth-dd">' + esc(e.downDistance) + '</span>'
      : '';
    const liveTag = liveNow ? '<span class="badge live">LIVE</span>' : '';
    const rz = e.redZone
      ? '<span class="badge rz" title="Play started in the red zone (opponent&rsquo;s 20 or inside)">RZ</span>'
      : '';
    const isNullified = boothEventNullified(e);
    const watchChip = scoringWatchChipHTML(e);
    const sourceLane = sourceLaneChipHTML(e);
    const state = boothScoreTrailHTML(e, e.awayAbbr, e.homeAbbr);
    // The all-games feed links directly to a focused category. A red-zone
    // nullification preserves its red-zone route; source audit rows never
    // masquerade as an outcome.
    const targetTab = e.irregularity || e.scoringWatch === 'irregular' || e.kind === 'integrity'
      ? 'integrity'
      : (isNullified && e.redZone ? 'redzone' : 'nullified');
    const aria = esc(e.shortName) + ', ' + esc(kind) + ': ' + esc(e.text) +
      (e.removesPoints ? ', removed ' + esc(e.pointsRemoved) + ' points' : '') +
      (isNullified && !e.removesPoints ? ', score nullified' : '') +
      (e.redZone ? ', in the red zone' : '') +
      '. Open this game.';
    return '' +
      '<button type="button" class="booth-msg day-msg ' + esc(e.kind) +
        (isNullified ? ' pts-removed' : '') +
        (e.scoringWatch === 'pending' ? ' scoring-pending' : '') +
        (e.scoringWatch === 'retained' ? ' scoring-retained' : '') +
        (e.irregularity ? ' scoring-integrity' : '') +
        '" data-id="' + esc(e.gameId) + '" data-ruling-tab="' + targetTab +
        '" aria-label="' + aria + '">' +
        '<span class="booth-msg-top">' +
          '<span class="day-game">' + esc(e.shortName) + '</span>' +
          liveTag +
          '<span class="badge ' + esc(e.kind) + '">' + esc(kind) + '</span>' +
          rz +
          watchChip +
          sourceLane +
          (result ? '<span class="badge result ' + esc(e.result) + '">' + esc(result) + '</span>' : '') +
          '<span class="booth-when">' + esc(when) + '</span>' +
          (score ? '<span class="booth-score">' + score + '</span>' : '') +
        '</span>' +
        '<span class="booth-msg-head">' + logo + team +
          '<span class="booth-heading">' + esc(e.heading) + '</span>' + dd +
        '</span>' +
        '<span class="booth-text">' + esc(e.text) + '</span>' +
        state +
      '</button>';
  }

  /* ------------------------------- game view ----------------------------- */

  function openGame(id, tab) {
    const idx = state.events.findIndex(function (e) { return e.id === id; });
    if (idx < 0) return;
    state.eventIndex = idx;
    state.summary = null;
    state.activeTab = tab || 'plays';
    state.lastGameContentRenderAt = 0;
    showGameView();
    renderTabs();
    renderGameHeader();
    $('game-content').innerHTML = '<div class="loading">Loading game data…</div>';

    const requestedFinal = state.events[idx].status && state.events[idx].status.state === 'post';
    const request = fetchSummaryQuiet(id, requestedFinal);
    request.promise
      .then(function (json) {
        const open = current();
        if (!open || open.id !== id) return; // stale response
        cacheDaySummary(id, json, request.final);
        hydrateEventFromSummary(open, json);
        state.summary = json;
        renderGameHeader();
        renderTabContent();
        state.lastGameContentRenderAt = Date.now();
        renderScoreboard();
        renderDayBooth();
      })
      .catch(function (err) {
        const open = current();
        if (!open || open.id !== id) return;
        $('game-content').innerHTML =
          '<div class="error">Could not load game data: ' + esc(err && err.message || err) + '</div>';
      });
  }

  function stepGame(dir) {
    if (!state.events.length) return;
    const n = state.events.length;
    const idx = ((state.eventIndex + dir) % n + n) % n;
    openGame(state.events[idx].id);
  }

  function renderGameHeader() {
    const ev = current();
    if (!ev) return;
    const away = ev.away, home = ev.home;
    if (!away || !home) return;

    const st = statusLabel(ev);
    const sit = liveSituation();
    let statusLine = st.text;
    if (st.cls === 'live') {
      if (st.sub) statusLine += ' · ' + st.sub;
      if (sit) statusLine += ' · ' + sit;
    }

    const meta = [];
    if (ev.venue && ev.venue.fullName) {
      meta.push(esc(ev.venue.fullName) + (ev.venue.city ? ', ' + esc(ev.venue.city) : ''));
    }
    if (ev.broadcast) meta.push(esc(ev.broadcast));
    if (ev.attendance != null) meta.push('Attendance ' + Number(ev.attendance).toLocaleString());

    $('game-pos').textContent = (state.eventIndex + 1) + ' of ' + state.events.length;

    $('game-header').innerHTML =
      '<div class="g-status-row"><span class="badge ' + st.cls + '">' + esc(statusLine) + '</span>' +
        '<span class="g-venue">' + meta.join(' · ') + '</span></div>' +
      '<div class="g-teams">' +
        bigTeamHTML(away) +
        '<div class="g-mid"><div class="g-score">' + esc(away.score) + ' – ' + esc(home.score) + '</div></div>' +
        bigTeamHTML(home) +
      '</div>' +
      linescoreTable(away, home);
  }

  function bigTeamHTML(t) {
    return '' +
      '<div class="g-team">' +
        '<img class="logo big" src="' + esc(t.logo) + '" alt="">' +
        '<div class="g-name">' + esc(t.displayName || t.abbr) + '</div>' +
        '<div class="g-rec">' + esc(recordLabel(t)) + '</div>' +
      '</div>';
  }

  function linescoreTable(away, home) {
    const periods = [1, 2, 3, 4];
    const rows = [away, home].map(function (t) {
      const cells = periods.map(function (p) {
        const ls = (t.linescores || []).find(function (l) { return l.period === p; });
        return '<td>' + (ls && ls.displayValue != null ? esc(String(ls.displayValue)) : '—') + '</td>';
      }).join('');
      return '<tr><th><img class="logo" src="' + esc(t.logo) + '" alt=""><span>' + esc(t.abbr) + '</span></th>' +
        cells + '<td class="tot">' + esc(t.score) + '</td></tr>';
    }).join('');
    return '<div class="table-wrap"><table class="linescore">' +
      '<thead><tr><th>Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>T</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function liveSituation() {
    let sit = summarySituation(state.summary);
    if (!sit && current()) sit = current().situation;
    if (!sit) return '';
    const parts = [];
    if (sit.downDistanceText) parts.push(sit.downDistanceText);
    return parts.join(' · ');
  }

  function renderTabs() {
    $('tabs').innerHTML = TABS.map(function (t) {
      return '<button class="tab' + (t.id === state.activeTab ? ' active' : '') +
        '" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
    }).join('');
  }

  function renderTabContent() {
    const el = $('game-content');
    if (!state.summary) {
      el.innerHTML = '<div class="loading">Loading game data…</div>';
      return;
    }
    if (state.activeTab === 'plays') el.innerHTML = playsHTML();
    else if (state.activeTab === 'drives') el.innerHTML = drivesHTML();
    else if (RULING_TABS.indexOf(state.activeTab) >= 0) renderRulingCategory(el, state.activeTab);
    else if (state.activeTab === 'team') el.innerHTML = teamStatsHTML();
    else if (state.activeTab === 'players') el.innerHTML = playerStatsHTML();
  }

  function liveLastPlay() {
    // The current event receives the 250 ms header updates. Prefer it over the
    // cached full summary so an in-progress scoring ruling appears in the UI
    // before the next one-second play-by-play reconciliation.
    let sit = current() && current().situation;
    if ((!sit || !sit.lastPlay) && state.summary) sit = summarySituation(state.summary);
    return (sit && sit.lastPlay) ? sit.lastPlay : null;
  }

  function currentBoothEvents() {
    return NFLMap.scoringWatchEvents(
      state.summary && state.summary.drives,
      liveLastPlay()
    );
  }

  function boothEventsById(events) {
    const map = {};
    (events || []).forEach(function (e) {
      if (!e) return;
      if (e.id != null) map[String(e.id)] = e;
      // Highlight the original touchdown / safety / kick as well as the
      // ruling record that removed it. A review often has its own play id.
      if (boothEventNullified(e) && e.scoringPlay && e.scoringPlay.id != null) {
        map[String(e.scoringPlay.id)] = e;
      }
    });
    return map;
  }

  function rulingTabInfo(tab) {
    const info = {
      flags: {
        title: 'Scoring-linked flags',
        description: 'Penalty records tied by the provider to a scoring play',
        empty: 'No scoring-linked flags are being tracked for this game.'
      },
      challenges: {
        title: 'Scoring-linked challenges',
        description: 'Coach challenge records tied by the provider to a scoring play',
        empty: 'No scoring-linked challenges are being tracked for this game.'
      },
      replay: {
        title: 'Scoring-linked replay',
        description: 'Replay verdict records tied by the provider to a scoring play',
        empty: 'No scoring-linked replay rulings are being tracked for this game.'
      },
      review: {
        title: 'Scoring plays under review',
        description: 'Active or published under-review records tied to a scoring play',
        empty: 'No scoring-linked under-review records are being tracked for this game.'
      },
      nullified: {
        title: 'Nullified scoring plays',
        description: 'Confirmed only — explicit provider nullification evidence or an attributed score rollback',
        empty: 'No confirmed nullified scoring plays for this game.'
      },
      redzone: {
        title: 'Red zone nullified scores',
        description: 'Confirmed nullifications on downs that started at the opponent’s 20 or inside',
        empty: 'No confirmed nullified red-zone scores for this game.'
      },
      integrity: {
        title: 'Source data checks',
        description: 'Provider score irregularities that require review; these are not inferred outcomes',
        empty: 'No current provider score irregularities need review for this game.'
      }
    };
    return info[tab] || info.nullified;
  }

  function eventsForRulingTab(tab, allEvents) {
    const events = allEvents || currentBoothEvents();
    if (tab === 'flags') return events.filter(function (e) { return e && e.kind === 'penalty'; });
    if (tab === 'challenges') return events.filter(function (e) { return e && e.kind === 'challenge'; });
    if (tab === 'replay') return events.filter(function (e) { return e && e.kind === 'replay'; });
    if (tab === 'review') return events.filter(function (e) { return e && e.kind === 'review'; });
    if (tab === 'redzone') {
      return uniqueScoringEvents(events, function (e) {
        return !!(e && e.redZone && confirmedNullifiedScoringEvent(e));
      });
    }
    if (tab === 'integrity') {
      const sourceIssues = events.filter(function (e) {
        return !!(e && (e.irregularity || e.scoringWatch === 'irregular' || e.kind === 'integrity'));
      });
      const game = current();
      const disappearanceIssues = (state.dayDisappearanceAuditItems || []).filter(function (e) {
        return !!(game && e && String(e.gameId) === String(game.id));
      });
      return sourceIssues.concat(disappearanceIssues);
    }
    return uniqueScoringEvents(events, confirmedNullifiedScoringEvent);
  }

  function nullifiedBannerHTML(events, redZone) {
    const confirmed = uniqueScoringEvents(events, confirmedNullifiedScoringEvent);
    if (!confirmed.length) return '';
    const removedPts = confirmed.reduce(function (sum, e) {
      return sum + (e.removesPoints ? Number(e.pointsRemoved) || 0 : 0);
    }, 0);
    const label = redZone ? ' NULLIFIED IN RZ' : ' NULLIFIED';
    const sentence = redZone
      ? confirmed.length + ' red zone scoring play(s) taken off the board'
      : confirmed.length + ' confirmed scoring play(s) taken off the board';
    return '<div class="booth-banner removed-banner" role="status">' +
      '<span class="badge removed">' + confirmed.length + label + '</span>' +
      '<span>' + sentence + (removedPts ? ' – ' + removedPts + ' pts removed' : '') + '.</span>' +
    '</div>';
  }

  function renderRulingCategory(el, tab) {
    const events = eventsForRulingTab(tab);
    const feed = el.querySelector('.booth-feed');
    const prevScroll = feed ? feed.scrollTop : 0;
    const nearBottom = !feed ||
      (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 56);

    el.innerHTML = rulingCategoryHTML(tab, events);

    const feed2 = el.querySelector('.booth-feed');
    if (feed2) {
      if (nearBottom) feed2.scrollTop = feed2.scrollHeight;
      else feed2.scrollTop = prevScroll;
    }
  }

  function rulingCategoryHTML(tab, events) {
    const info = rulingTabInfo(tab);
    const live = current() && current().status && current().status.state === 'in';
    const cadence = live ? ' · refreshed on the ' + LIVE_REVIEW_SECONDS + 's full-play schedule' : '';
    const banner = (tab === 'nullified' || tab === 'redzone')
      ? nullifiedBannerHTML(events, tab === 'redzone')
      : '';
    const body = events.length
      ? '<div class="booth-feed" role="log" aria-live="off">' +
          events.map(function (e) { return boothMsgHTML(e, false); }).join('') +
        '</div>'
      : '<div class="empty booth-empty">' + esc(info.empty) + '</div>';

    return '<div class="booth ruling-category ruling-' + esc(tab) + '">' +
      '<div class="booth-head">' +
        '<div class="booth-title">' + esc(info.title) + '</div>' +
        '<div class="booth-sub">' + esc(info.description + ' · scoring-linked only' + cadence) + '</div>' +
      '</div>' +
      banner +
      body +
    '</div>';
  }

  function boothMsgHTML(e, isNew) {
    const q = NFLMap.quarterLabel(e.quarter);
    const when = [q, e.clock].filter(Boolean).join(' · ');
    const kind = BOOTH_KIND_LABEL[e.kind] || e.kind;
    const result = e.result ? BOOTH_RESULT_LABEL[e.result] || e.result : '';
    const duringScore = (e.duringAwayScore != null && e.duringHomeScore != null)
      ? scorePair(e.duringAwayScore, e.duringHomeScore)
      : ((e.awayScore != null && e.homeScore != null)
        ? scorePair(e.awayScore, e.homeScore)
        : '');
    const score = duringScore ? esc(duringScore) : '';
    const logo = e.team && e.team.logo
      ? '<img class="logo" src="' + esc(e.team.logo) + '" alt="">'
      : '';
    const team = e.team && e.team.abbr
      ? '<span class="booth-team">' + esc(e.team.abbr) + '</span>'
      : '';
    const dd = e.downDistance
      ? '<span class="booth-dd">' + esc(e.downDistance) + '</span>'
      : '';
    const liveTag = e.live ? '<span class="badge live">LIVE</span>' : '';
    const game = current();
    const awayAbbr = game && game.away ? game.away.abbr : '';
    const homeAbbr = game && game.home ? game.home.abbr : '';
    const state = boothScoreTrailHTML(e, awayAbbr, homeAbbr);
    const rz = e.redZone
      ? '<span class="badge rz" title="Play started in the red zone (opponent&rsquo;s 20 or inside)">RZ</span>'
      : '';
    const isNullified = boothEventNullified(e);
    const watchChip = scoringWatchChipHTML(e);
    return '' +
      '<article class="booth-msg ' + esc(e.kind) +
        (isNullified ? ' pts-removed' : '') +
        (e.scoringWatch === 'pending' ? ' scoring-pending' : '') +
        (e.scoringWatch === 'retained' ? ' scoring-retained' : '') +
        (e.irregularity ? ' scoring-integrity' : '') + '">' +
        '<div class="booth-msg-top">' +
          '<span class="booth-when">' + esc(when) + '</span>' +
          liveTag +
          '<span class="badge ' + esc(e.kind) + '">' + esc(kind) + '</span>' +
          rz +
          watchChip +
          (result ? '<span class="badge result ' + esc(e.result) + '">' + esc(result) + '</span>' : '') +
          '<span class="booth-score">' + score + '</span>' +
        '</div>' +
        '<div class="booth-msg-head">' + logo + team +
          '<span class="booth-heading">' + esc(e.heading) + '</span>' + dd +
        '</div>' +
        '<p class="booth-text">' + esc(e.text) + '</p>' +
        state +
      '</article>';
  }

  /* The red-zone cut is rendered by the dedicated `redzone` ruling category. */

  /* ------------------------------- play by play -------------------------- */

  function playsHTML() {
    const drives = NFLMap.drivesList(state.summary.drives);
    if (!drives.length) {
      return '<div class="empty">Play-by-play is not available for this game.</div>';
    }
    // Build a map of playId -> booth event, so the play-by-play can highlight
    // the exact rows where a score was nullified.
    const boothEvents = currentBoothEvents();
    const boothById = boothEventsById(boothEvents);

    let out = [];
    let lastQ = null;
    drives.forEach(function (d) {
      const q = (d.start && d.start.period) ? d.start.period.number : null;
      const ql = NFLMap.quarterLabel(q);
      if (ql !== lastQ) {
        out.push('<h3 class="quarter">' + esc(ql) + '</h3>');
        lastQ = ql;
      }
      out.push(driveSectionHTML(d, boothById));
    });
    // If a score was nullified anywhere in this game, add a top banner to the
    // play-by-play too, so it is obvious without switching to the Flags tab.
    const nullifiedInGame = uniqueScoringEvents(boothEvents, boothEventNullified);
    let topBanner = '';
    if (nullifiedInGame.length) {
      topBanner = '<div class="booth-banner removed-banner" role="status">' +
        '<span class="badge removed">' + nullifiedInGame.length + ' NULLIFIED</span>' +
        '<span>' + nullifiedInGame.length + ' scoring play(s) taken off the board in this game – see the highlighted rows or the Nullified tab.</span>' +
      '</div>';
    }
    return '<div class="pbp">' + topBanner + out.join('') + '</div>';
  }

  function driveSectionHTML(d, boothById) {
    const t = d.team || {};
    const logo = (t.logos && t.logos.length) ? t.logos[0].href : '';
    const result = d.displayResult
      ? '<span class="drive-result">' + esc(d.displayResult) + '</span>'
      : '';
    const rows = (d.plays || []).map(function (p) {
      return playRowHTML(NFLMap.playRow(p), boothById && p && p.id != null ? boothById[String(p.id)] : null);
    }).join('');
    return '' +
      '<div class="drive">' +
        '<div class="drive-head">' +
          '<img class="logo" src="' + esc(logo) + '" alt="">' +
          '<span class="drive-team">' + esc(t.abbreviation || '') + '</span>' +
          '<span class="drive-desc">' + esc(d.description || '') + '</span>' +
          result +
        '</div>' +
        '<div class="table-wrap"><table class="plays"><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  function playRowHTML(p, boothEvent) {
    const cls = [];
    if (p.scoring) cls.push('scoring');
    if (p.turnover) cls.push('turnover');
    if (p.penalty) cls.push('penalty');
    const nullified = boothEventNullified(boothEvent);
    if (nullified) cls.push('pts-removed');
    const yard = p.yardage != null ? '<span class="yds">' + esc(p.yardage) + ' yds</span>' : '';
    const pen = p.penaltyText ? ' <span class="pen">(' + esc(p.penaltyText) + ')</span>' : '';
    let nullBadge = '';
    if (nullified) {
      nullBadge = boothEvent.removesPoints
        ? ' <span class="badge removed">' + esc(boothEvent.pointsRemoved) + ' PTS REMOVED</span>'
        : ' <span class="badge removed">NULLIFIED</span>';
    }
    return '' +
      '<tr class="' + cls.join(' ') + '">' +
        '<td class="dd">' + esc(p.downDistance) + '</td>' +
        '<td class="clock">' + esc(p.clock) + '</td>' +
        '<td class="desc">' + esc(p.text) + pen + yard + nullBadge + '</td>' +
        '<td class="score">' + esc(p.awayScore) + '–' + esc(p.homeScore) + '</td>' +
      '</tr>';
  }

  /* ----------------------------- scoring drives -------------------------- */

  function drivesHTML() {
    const sc = NFLMap.scoringDrives(state.summary.drives);
    if (!sc.length) {
      return '<div class="empty">No scoring plays yet.</div>';
    }
    const rows = sc.map(function (d) {
      const r = NFLMap.driveRow(d);
      const score = (r.awayScore != null && r.homeScore != null)
        ? esc(r.awayScore) + '–' + esc(r.homeScore)
        : '';
      return '' +
        '<tr>' +
          '<td class="sd-team"><img class="logo" src="' + esc(r.team.logo) + '" alt=""><span>' + esc(r.team.abbr) + '</span></td>' +
          '<td class="sd-result">' + esc(r.result) + '</td>' +
          '<td class="sd-meta">PLAYS ' + esc(r.plays) + ' · YDS ' + esc(r.yards) + ' · TTL ' + esc(r.timeElapsed) + '</td>' +
          '<td class="sd-score">' + score + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="scoring-drives"><tbody>' + rows + '</tbody></table></div>';
  }

  /* -------------------------------- team stats --------------------------- */

  function teamStatsHTML() {
    const teams = NFLMap.teamStatsTables(state.summary.boxscore.teams);
    if (!teams.length) return '<div class="empty">Team stats are not available.</div>';
    const away = teams.find(function (t) { return t.team.homeAway === 'away'; });
    const home = teams.find(function (t) { return t.team.homeAway === 'home'; });

    const rows = TEAM_STAT_ORDER.map(function (pair) {
      const name = pair[0], label = pair[1];
      const av = away && away.stats[name];
      const hv = home && home.stats[name];
      if (av == null && hv == null) return '';
      return '<tr><th>' + esc(label) + '</th>' +
        '<td>' + esc(av != null ? av : '—') + '</td>' +
        '<td>' + esc(hv != null ? hv : '—') + '</td></tr>';
    }).join('');

    const head = (away || home)
      ? '<tr class="head"><th></th>' +
        '<td>' + teamCell(away) + '</td>' +
        '<td>' + teamCell(home) + '</td></tr>'
      : '';
    return '<div class="table-wrap"><table class="team-stats"><tbody>' + head + rows + '</tbody></table></div>';
  }

  function teamCell(t) {
    if (!t) return '';
    return '<img class="logo" src="' + esc(t.team.logo) + '" alt=""><span>' + esc(t.team.abbr) + '</span>';
  }

  /* ------------------------------- player stats -------------------------- */

  function playerStatsHTML() {
    const teams = NFLMap.playerStatTeams(state.summary.boxscore.players);
    if (!teams.length) return '<div class="empty">Player stats are not available.</div>';
    let out = [];
    PLAYER_CATEGORY_ORDER.forEach(function (pair) {
      const name = pair[0], label = pair[1];
      const blocks = teams.map(function (t) {
        const cat = t.categories.find(function (c) { return c.name === name; });
        if (!cat || !cat.athletes.length) return '';
        return teamCatTable(t, cat);
      }).filter(Boolean);
      if (blocks.length) {
        out.push('<h3 class="cat-title">' + esc(label) + '</h3><div class="player-cols">' +
          blocks.join('') + '</div>');
      }
    });
    return out.join('') || '<div class="empty">Player stats are not available.</div>';
  }

  function teamCatTable(t, cat) {
    const team = t.team;
    const headCells = '<th class="pl">Player</th>' +
      cat.labels.map(function (l) { return '<th>' + esc(l) + '</th>'; }).join('');

    const body = cat.athletes.map(function (a) {
      const cells = a.stats.map(function (s) { return '<td>' + esc(s) + '</td>'; }).join('');
      return '<tr><td class="pl"><span class="jersey">' + esc(a.jersey) + '</span>' +
        '<span class="pname">' + esc(a.name) + '</span></td>' + cells + '</tr>';
    }).join('');

    const totals = '<tr class="totals"><td class="pl">Team</td>' +
      cat.totals.map(function (s) { return '<td>' + esc(s) + '</td>'; }).join('') + '</tr>';

    const teamHead = '<tr class="team-h"><th colspan="' + (cat.labels.length + 1) + '">' +
      '<img class="logo" src="' + esc(team.logo) + '" alt=""><span>' +
      esc(team.displayName || team.abbr) + '</span></th></tr>';

    return '<div class="table-wrap"><table class="player-stats"><thead>' + teamHead +
      '<tr class="col-h">' + headCells + '</tr></thead><tbody>' + body + totals + '</tbody></table></div>';
  }

  /* ------------------------------ view toggling -------------------------- */

  function showScoreboardView() {
    $('game-view').classList.add('hidden');
    $('scoreboard-view').classList.remove('hidden');
    if (state.events.length) $('day-booth').classList.remove('hidden');
  }

  function showGameView() {
    $('scoreboard-view').classList.add('hidden');
    $('day-booth').classList.add('hidden');
    $('game-view').classList.remove('hidden');
  }

  function setDate(d) {
    state.date = d;
    state.events = [];
    state.eventIndex = -1;
    state.summary = null;
    state.lastGameContentRenderAt = 0;
    state.daySummaries = {};
    state.summaryRequests = {};
    state.dayFeed = { items: [], primed: false };
    state.dayAuditItems = [];
    state.dayPendingRulings = {};
    state.dayDisappearanceAuditItems = [];
    state.dayBoothNullified = {};
    state.dayWatchTab = 'nullified';
    state.alertedScoringKeys = {};
    state.fastPlaySignatures = {};
    $('day-booth').classList.add('hidden');
    $('date-label').textContent = fmtDateLabel(d);
    showScoreboardView();
    loadScoreboard();
  }

  /* -------------------------------- polling ------------------------------ */

  function startPolling() {
    if (state.polling) state.polling.stop();
    state.polling = NFLRefresh.start({
      refreshScoreboard: refreshScoreboard,
      refreshLiveScores: refreshLiveScores,
      refreshReviews: refreshDayBooth,
      isVisible: function () { return document.visibilityState !== 'hidden'; }
    });
  }

  /* --------------------------------- init -------------------------------- */

  function init() {
    // Unlock audio from an explicit user gesture; this is required by browsers
    // and keeps the initial page load silent.
    document.addEventListener('click', unlockBoothAudio);
    document.addEventListener('keydown', unlockBoothAudio);
    loadBoothSoundPref();

    $('prev-day').addEventListener('click', function () { setDate(addDays(state.date, -1)); });
    $('next-day').addEventListener('click', function () { setDate(addDays(state.date, 1)); });
    $('today-btn').addEventListener('click', function () { setDate(new Date()); });
    $('back-btn').addEventListener('click', showScoreboardView);
    $('prev-game').addEventListener('click', function () { stepGame(-1); });
    $('next-game').addEventListener('click', function () { stepGame(1); });

    $('scoreboard-view').addEventListener('click', function (e) {
      const chip = e.target.closest('.day-chip');
      if (chip) {
        setDate(fromYMD(chip.getAttribute('data-ymd')));
        return;
      }
      const card = e.target.closest('.game-card');
      if (card) openGame(card.getAttribute('data-id'));
    });

    // The day-wide panel exposes a confirmed-nullification stream and a
    // separate, silent audit view. A row opens its corresponding game tab.
    $('day-booth').addEventListener('click', function (e) {
      if (e.target.closest('.day-sound-btn')) {
        toggleBoothSound();
        return;
      }
      const tab = e.target.closest('.day-watch-tab');
      if (tab) {
        state.dayWatchTab = tab.getAttribute('data-day-tab') === 'integrity'
          ? 'integrity'
          : 'nullified';
        renderDayBooth();
        return;
      }
      const msg = e.target.closest('.day-msg');
      if (msg) {
        openGame(msg.getAttribute('data-id'), msg.getAttribute('data-ruling-tab') || 'nullified');
      }
    });

    // Keyboard access: Enter / Space opens a focused game card.
    $('scoreboard-view').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.game-card');
      if (card) {
        e.preventDefault();
        openGame(card.getAttribute('data-id'));
      }
    });

    $('tabs').addEventListener('click', function (e) {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      state.activeTab = btn.getAttribute('data-tab');
      const tabs = document.querySelectorAll('#tabs .tab');
      tabs.forEach(function (t) { t.classList.toggle('active', t === btn); });
      renderTabContent();
      state.lastGameContentRenderAt = Date.now();
    });

    // Escape returns from the game view to the scoreboard.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('game-view').classList.contains('hidden')) {
        showScoreboardView();
      }
    });

    // Browsers throttle timers in background tabs. Refresh immediately when
    // the page becomes visible instead of waiting for the next timer tick.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'hidden' && state.polling) {
        state.polling.refreshNow();
      }
    });

    $('date-label').textContent = fmtDateLabel(state.date);
    loadScoreboard();
    startPolling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
