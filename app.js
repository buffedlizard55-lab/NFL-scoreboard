/* ------------------------------------------------------------------------- *\
 * NFL Scoreboard — client app.
 * Data source: ESPN's public NFL API (CORS-enabled, no key required):
 *   - scoreboard: site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
 *   - game detail: site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary
 * No videos are rendered anywhere.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
  const SUMMARY_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary';
  const LIVE_REVIEW_SECONDS = NFLRefresh.LIVE_REVIEWS_INTERVAL_MS / 1000;
  const BOOTH_SOUND_KEY = 'nflBoothSoundEnabled'; // persisted toggle for the booth alert sound

  const TABS = [
    { id: 'plays', label: 'Play-by-Play' },
    { id: 'drives', label: 'Scoring Drives' },
    { id: 'booth', label: 'Flags & Reviews' },
    { id: 'redzone', label: 'Red Zone' },
    { id: 'team', label: 'Team Stats' },
    { id: 'players', label: 'Player Stats' }
  ];

  const BOOTH_KIND_LABEL = {
    penalty: 'Flag',
    challenge: 'Challenge',
    replay: 'Replay',
    review: 'Under review'
  };

  const BOOTH_RESULT_LABEL = {
    pending: 'In progress',
    overturned: 'Overturned',
    confirmed: 'Confirmed',
    stands: 'Stands',
    declined: 'Declined',
    offsetting: 'Offsetting'
  };

  /* One shared filter row for all three booth feeds (day chat, Flags &
   * Reviews, Red Zone). "Nullified" selects the events that took a score off
   * the board: a touchdown, field goal, PAT or 2-point conversion nullified,
   * or points ESPN actually removed from the running score. */
  const BOOTH_FILTERS = [
    ['all', 'All'],
    ['penalty', 'Flags'],
    ['challenge', 'Challenges'],
    ['replay', 'Replay'],
    ['review', 'Under review'],
    ['nullified', 'Nullified']
  ];

  /* The all-games live booth gets one extra chip: the per-game Red Zone cut
   * (same as a game's Red Zone tab — see NFLMap.isRedZonePlay) applied
   * across every game of the day. The single-game feeds don't need the chip:
   * Flags & Reviews badges red-zone plays with RZ instead, and the Red Zone
   * tab already IS this cut for one game. */
  const DAY_BOOTH_FILTERS = BOOTH_FILTERS.concat([['redzone', 'Red zone']]);

  /* A booth event counts as a nullification when a score came off the board:
   * ESPN's running score dropped, or the play text reports the score as
   * NULLIFIED / wiped by a "- No Play" foul / REVERSED on review. The whole
   * decision lives in NFLMap so the feeds, the Red Zone tab and the alert
   * sound can never disagree about what a nullified play is. */
  function boothEventNullified(e) {
    if (!e) return false;
    if (e.nullified != null) return !!e.nullified;
    return NFLMap.boothEventNullifies(e);
  }

  function boothKindCounts(events) {
    const counts = { all: events.length, penalty: 0, challenge: 0, replay: 0, review: 0, nullified: 0, redzone: 0 };
    events.forEach(function (e) {
      if (e && e.kind != null && counts[e.kind] != null) counts[e.kind] += 1;
      if (boothEventNullified(e)) counts.nullified += 1;
      if (e && e.redZone && boothEventNullified(e)) counts.redzone += 1;
    });
    return counts;
  }

  function boothEventShown(e, filter) {
    if (!filter || filter === 'all') return true;
    if (filter === 'nullified') return boothEventNullified(e);
    if (filter === 'redzone') return !!(e.redZone && boothEventNullified(e));
    return e.kind === filter;
  }

  function boothFiltersHTML(filter, counts, attr, extraClass, filters) {
    return (filters || BOOTH_FILTERS).map(function (pair) {
      const id = pair[0], label = pair[1];
      const n = counts[id];
      const extra = id === 'all' ? '' : ' · ' + n;
      return '<button type="button" class="booth-filter' + (extraClass || '') +
        (filter === id ? ' active' : '') +
        '" ' + attr + '="' + id + '"' +
        (n === 0 && id !== 'all' ? ' disabled' : '') + '>' +
        esc(label) + extra + '</button>';
    }).join('');
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
    lastGameContentRenderAt: 0, // preserve the old 5s cadence outside the booth/redzone tabs
    boothFilter: 'all',    // all | penalty | challenge | replay | review
    redZoneFilter: 'all',  // same kinds, for the Red Zone tab
    seenBoothIds: {},      // play ids already shown in the booth feed
    boothPrimed: false,    // first paint of a game's booth marks history as seen
    daySummaries: {},      // eventId -> { drives, situation, final }
    summaryRequests: {},   // eventId -> { promise, final } for an in-flight fetch
    dayFeed: { items: [], primed: false }, // day-wide booth chat feed
    dayBoothNullified: {}, // eventId -> newest booth event's nullification state, for card badges
    dayBoothFilter: 'all', // day-wide booth filter, incl. the 'redzone' cut
    alertedBoothKeys: {},   // nullified booth events already announced
    audioContext: null,     // created only after a user gesture (autoplay policy)
    soundEnabled: true,     // booth alert sound; ON by default so existing alerts still play
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
          if ((state.activeTab === 'booth' || state.activeTab === 'redzone') && state.summary) {
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
    const liveBooth = lastPlayBooth(ev);
    const reviewBadge = (liveBooth && liveBooth.kind === 'review')
      ? '<span class="badge review">REVIEW</span>'
      : '';
    // Nullification state of this game's newest booth event, recomputed on
    // every one-second booth pass (see renderDayBooth): a score was taken
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
          reviewBadge + nullBadge + bcast +
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

  function lastPlayBooth(ev) {
    const cached = ev && state.daySummaries[ev.id];
    const cachedPlay = cached && cached.situation && cached.situation.lastPlay;
    const lp = cachedPlay || (ev && ev.situation && ev.situation.lastPlay);
    if (!lp) return null;
    const kind = NFLMap.classifyBooth(lp);
    if (!kind) return null;
    return { kind: kind, play: lp, text: lp.text || lp.shortText || '' };
  }

  /* Everything a game card can show about the booth right now, folded into
   * one comparable string so a one-second tick only repaints the scoreboard
   * when a badge actually appears, changes, or disappears. */
  function boothCardSignature(ev) {
    if (!ev) return '';
    const liveBooth = lastPlayBooth(ev);
    const nullified = state.dayBoothNullified[ev.id];
    return (liveBooth && liveBooth.kind === 'review' ? 'review' : '') + ':' +
      (nullified ? (nullified.removesPoints ? 'removed' : 'nullified') : '');
  }

  /* ----------------------- day-wide live booth chat ---------------------- */
  /*
   * A chat-style feed of every flag, challenge and replay review from every
   * game of the selected day. It is built from the same two verified
   * sources as a game's own Flags & Reviews tab:
   *   - each played game's summary play-by-play (summary.drives), and
   *   - each game's latest play from the summary or scoreboard situation.
   * Messages are kept in discovery order (games are seeded in kickoff
   * order; newly discovered messages are appended at the bottom), so it
   * reads like a chat. No per-play timestamps are invented: ordering is by
   * the sequence ESPN assigns inside each game and by kickoff time across
   * games.
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
   * Fetch the play-by-play of every game that has (or had) action:
   * live games on every one-second review cycle, then one final snapshot after
   * the scoreboard reports the game as finished. Each response updates cached
   * data and the review feeds; larger non-review tabs repaint at most every 5s.
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
            const cardSigBefore = boothCardSignature(ev);
            cacheDaySummary(ev.id, json, request.final);

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
            if (boothCardSignature(ev) !== cardSigBefore &&
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
   * Browsers block unsolicited audio until the listener has interacted with
   * the page. A gesture unlocks Web Audio; later live booth updates can then
   * announce challenges, replay reviews, and under-review plays. Penalties are
   * deliberately excluded here.
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

  function buzzBoothAlert() {
    const ctx = state.audioContext;
    if (!ctx) return;
    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(180, start);
      gain.gain.setValueAtTime(0.0001, start);
      // A pulsing three-second tone is clearly a buzz without being continuous.
      for (let i = 0; i < 6; i += 1) {
        const at = start + i * 0.5;
        gain.gain.linearRampToValueAtTime(0.12, at + 0.04);
        gain.gain.linearRampToValueAtTime(0.0001, at + 0.24);
      }
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 3);
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
    renderDayBooth(); // refresh the button label/state in the booth header
    // The click is itself a user gesture, so it can unlock Web Audio and play
    // the exact same alert buzz — the button doubles as a sound test.
    unlockBoothAudio();
    if (state.audioContext && state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    buzzBoothAlert();
  }

  function announceNewBoothEvents(fresh) {
    let shouldBuzz = false;
    (fresh || []).forEach(function (event) {
      const key = event && event.key != null ? String(event.key) : '';
      if (!key || state.alertedBoothKeys[key]) return;
      state.alertedBoothKeys[key] = true;
      // The buzzer is reserved for nullifications: a touchdown, field goal,
      // PAT or 2-point conversion wiped out, or points ESPN took off the
      // running score. Ordinary flags, challenges and pending reviews stay
      // silent — they are still listed in the feed.
      if (boothEventNullified(event)) shouldBuzz = true;
    });
    if (shouldBuzz && state.soundEnabled) buzzBoothAlert();
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

    const fresh = NFLMap.dayBoothFeed(dayBoothGames().map(function (ev) {
      const cached = state.daySummaries[ev.id] || null;
      const cachedPlay = cached && cached.situation && cached.situation.lastPlay;
      const lastPlay = cachedPlay || (ev.situation && ev.situation.lastPlay) || null;
      const events = NFLMap.boothEvents(cached && cached.drives, lastPlay);
      // The newest nullification drives the game card's NULLIFIED /
      // PTS REMOVED badge (events are sorted by sequence, newest last).
      let lastNullified = null;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        if (boothEventNullified(events[i])) { lastNullified = events[i]; break; }
      }
      state.dayBoothNullified[ev.id] = lastNullified
        ? {
          removesPoints: !!lastNullified.removesPoints,
          points: lastNullified.pointsRemoved || 0
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
        events: events
      };
    }));

    // Keep discovery order, append new messages, and replace an existing item
    // when ESPN updates that same play with the review result. The first load
    // establishes history silently; only later discoveries can alert.
    if (!state.dayFeed.primed) {
      state.dayFeed.items = fresh;
      state.dayFeed.primed = true;
      fresh.forEach(function (event) {
        if (event && event.key != null) state.alertedBoothKeys[String(event.key)] = true;
      });
    } else {
      announceNewBoothEvents(fresh);
      state.dayFeed.items = NFLMap.reconcileDayBoothFeed(state.dayFeed.items, fresh);
    }

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

  function dayBoothHTML() {
    const filter = state.dayBoothFilter || 'all';
    const items = state.dayFeed.items || [];
    const liveNow = liveGamesNow();
    const counts = boothKindCounts(items);
    const visible = items.filter(function (e) {
      return boothEventShown(e, filter);
    });

    const filters = boothFiltersHTML(filter, counts, 'data-day-filter', ' day-filter', DAY_BOOTH_FILTERS);

    const scannable = state.events.filter(dayBoothScannable).length;
    const scanned = Object.keys(state.daySummaries).length;
    const liveCount = state.events.filter(function (e) {
      return e.status && e.status.state === 'in';
    }).length;
    const foot =
      'Every flag &amp; review from all of today&rsquo;s games · pulled from ESPN play-by-play · ' +
      'tracks score before &rarr; during &rarr; after when a nullified score comes off the board · ' +
      'nullified &amp; red zone cover TD, FG, PAT &amp; 2-pt only · ' +
      LIVE_REVIEW_SECONDS + 's live polling schedule' +
      (scannable ? ' · games scanned ' + scanned + ' of ' + scannable : '') +
      (liveCount ? ' · ' + liveCount + ' game' + (liveCount === 1 ? '' : 's') + ' live' : '');

    // Top banner listing the day's nullified scores – the only thing these
    // feeds track beyond the plain flag/review log.
    const nullifiedAll = items.filter(boothEventNullified);
    let topBanner = '';
    if (nullifiedAll.length) {
      const summary = nullifiedAll.slice(0, 3).map(function (e) {
        const pts = e.removesPoints ? ' ' + e.pointsRemoved + 'pts' : '';
        return esc(e.shortName + ':' + pts);
      }).join(', ');
      const more = nullifiedAll.length > 3 ? ' +' + (nullifiedAll.length - 3) + ' more' : '';
      topBanner = '<div class="booth-banner removed-banner day-removed-banner" role="status">' +
        '<span class="badge removed">' + nullifiedAll.length + ' NULLIFIED</span>' +
        '<span>Scores taken off the board: ' + summary + more + ' – filter Nullified.</span>' +
      '</div>';
    }

    let body;
    if (!visible.length) {
      body = '<div class="empty booth-empty">' +
        (scanned < scannable
          ? 'Scanning today&rsquo;s games for flags and reviews&hellip;'
          : (filter === 'redzone' && counts.all
            ? 'No nullified scores in the red zone (the opponent&rsquo;s 20 or inside) ' +
              'today &mdash; no touchdown, field goal, PAT or 2-pt conversion has been ' +
              'wiped out from there.'
            : (filter === 'nullified' && counts.all
              ? 'No nullified scores today &mdash; no touchdown, field goal, PAT or ' +
                '2-pt conversion has been taken off the board.'
              : 'No flags or reviews on this day yet &mdash; kickoff hasn&rsquo;t happened, or the games were clean.'))) +
        '</div>';
    } else {
      body = '<div class="day-feed" role="log" aria-live="polite" aria-relevant="additions">' +
        visible.map(function (e) {
          return dayBoothMsgHTML(e, !!liveNow[e.gameId]);
        }).join('') +
      '</div>';
    }

    const soundOn = !!state.soundEnabled;
    const soundTitle = soundOn
      ? 'Alert sound ON - buzzes only when a score is nullified. Click to mute.'
      : 'Alert sound OFF - click to enable and test the alert buzz.';
    return '<div class="booth day-booth">' +
      '<div class="booth-head">' +
        '<div class="booth-head-main">' +
          '<div class="booth-title">Live booth &middot; flags &amp; reviews &middot; all games</div>' +
          '<div class="booth-sub">' + foot + '</div>' +
        '</div>' +
        '<button type="button" class="day-sound-btn' + (soundOn ? ' on' : '') +
          '" aria-pressed="' + (soundOn ? 'true' : 'false') + '"' +
          ' title="' + soundTitle + '">' +
          (soundOn ? '&#128276; Sound On' : '&#128263; Sound Off') +
        '</button>' +
      '</div>' +
      topBanner +
      '<div class="booth-filters">' + filters + '</div>' +
      body +
    '</div>';
  }

  function scorePair(away, home) {
    return String(away != null ? away : 0) + '–' + String(home != null ? home : 0);
  }

  function boothScoreTrailHTML(e, awayAbbr, homeAbbr) {
    if (e.beforeAwayScore == null || e.duringAwayScore == null || e.afterAwayScore == null) return '';
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
    const related = boothEventNullified(e) && e.relatedScoringPlay && e.relatedScoringPlay.text
      ? '<span class="booth-note">' + esc(e.relatedScoringPlay.text) + '</span>'
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
    related;
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
    const nullChip = (isNullified && !e.removesPoints)
      ? '<span class="badge removed" title="A score was nullified on this play">NULLIFIED</span>'
      : '';
    const state = boothScoreTrailHTML(e, e.awayAbbr, e.homeAbbr);
    const aria = esc(e.shortName) + ', ' + esc(kind) + ': ' + esc(e.text) +
      (e.removesPoints ? ', removed ' + esc(e.pointsRemoved) + ' points' : '') +
      (isNullified && !e.removesPoints ? ', score nullified' : '') +
      (e.redZone ? ', in the red zone' : '') +
      '. Open this game.';
    return '' +
      '<button type="button" class="booth-msg day-msg ' + esc(e.kind) +
        (isNullified ? ' pts-removed' : '') +
        '" data-id="' + esc(e.gameId) + '" aria-label="' + aria + '">' +
        '<span class="booth-msg-top">' +
          '<span class="day-game">' + esc(e.shortName) + '</span>' +
          liveTag +
          '<span class="badge ' + esc(e.kind) + '">' + esc(kind) + '</span>' +
          rz +
          nullChip +
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
    state.boothFilter = 'all';
    state.redZoneFilter = 'all';
    state.seenBoothIds = {};
    state.boothPrimed = false;
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
    else if (state.activeTab === 'booth') renderBooth(el);
    else if (state.activeTab === 'redzone') renderRedZone(el);
    else if (state.activeTab === 'team') el.innerHTML = teamStatsHTML();
    else if (state.activeTab === 'players') el.innerHTML = playerStatsHTML();
  }

  function liveLastPlay() {
    let sit = summarySituation(state.summary);
    if ((!sit || !sit.lastPlay) && current()) sit = current().situation;
    return (sit && sit.lastPlay) ? sit.lastPlay : null;
  }

  function currentBoothEvents() {
    return NFLMap.boothEvents(
      state.summary && state.summary.drives,
      liveLastPlay()
    );
  }

  function boothEventsById(events) {
    const map = {};
    (events || []).forEach(function (e) {
      if (e && e.id != null) map[String(e.id)] = e;
    });
    return map;
  }

  function renderBooth(el) {
    const events = NFLMap.boothEvents(
      state.summary && state.summary.drives,
      liveLastPlay()
    );
    const feed = el.querySelector('.booth-feed');
    const prevScroll = feed ? feed.scrollTop : 0;
    const nearBottom = !feed ||
      (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 56);

    el.innerHTML = boothHTML(events);

    const feed2 = el.querySelector('.booth-feed');
    if (feed2) {
      if (nearBottom) feed2.scrollTop = feed2.scrollHeight;
      else feed2.scrollTop = prevScroll;
    }
  }

  function boothHTML(events) {
    const filter = state.boothFilter || 'all';
    const counts = boothKindCounts(events);
    const visible = events.filter(function (e) {
      return boothEventShown(e, filter);
    });

    const newIds = [];
    visible.forEach(function (e) {
      const id = e.id != null ? String(e.id) : '';
      if (!id) return;
      if (state.boothPrimed && !state.seenBoothIds[id]) newIds.push(id);
    });
    if (!state.boothPrimed) {
      events.forEach(function (e) {
        if (e.id != null) state.seenBoothIds[String(e.id)] = true;
      });
      state.boothPrimed = true;
    } else {
      events.forEach(function (e) {
        if (e.id != null) state.seenBoothIds[String(e.id)] = true;
      });
    }

    const filters = boothFiltersHTML(filter, counts, 'data-booth-filter', '');

    const lastPlay = liveLastPlay();
    const lastText = lastPlay ? (lastPlay.text || lastPlay.shortText || '') : '';
    const livePending = !!(current() && current().status && current().status.state === 'in' && lastPlay &&
      (NFLMap.classifyBooth(lastPlay) === 'review' || NFLMap.boothResult(lastText) === 'pending'));
    // A persistent banner whenever ANY event in the feed nullified a score,
    // even if the live lastPlay is not currently under review.
    const nullifiedEvents = events.filter(boothEventNullified);
    const nullifiedBanner = (!livePending && nullifiedEvents.length)
      ? '<div class="booth-banner removed-banner" role="status">' +
          '<span class="badge removed">' + nullifiedEvents.length + ' NULLIFIED</span>' +
          '<span>Score taken off the board – ' +
            nullifiedEvents.map(function (e) {
              if (!e.removesPoints) return esc(e.heading || 'nullified score');
              const team = e.removedTeam === 'away' ? (current() && current().away ? current().away.abbr : 'AWAY')
                : (current() && current().home ? current().home.abbr : 'HOME');
              return esc(team + ' ' + e.pointsRemoved + 'pts');
            }).join(', ') +
          ' – switch to the Nullified filter.</span>' +
        '</div>'
      : '';

    const underReviewBanner = livePending
      ? '<div class="booth-banner" role="status">' +
          '<span class="badge review">UNDER REVIEW</span>' +
          '<span>' + esc(lastText) + '</span>' +
        '</div>'
      : '';

    const banner = underReviewBanner + nullifiedBanner;

    let body;
    if (!visible.length) {
      body = '<div class="empty booth-empty">No flags, challenges, or replay reviews in the play-by-play yet.</div>';
    } else {
      body = '<div class="booth-feed" role="log" aria-live="polite" aria-relevant="additions">' +
        visible.map(function (e) {
          return boothMsgHTML(e, newIds.indexOf(e.id != null ? String(e.id) : '') >= 0);
        }).join('') +
      '</div>';
    }

    // Literal arrows (not &rarr; entities): foot passes through esc() below.
    const live = current() && current().status && current().status.state === 'in';
    const foot = live
      ? 'Live booth log · pulled from ESPN play-by-play · tracks score before → during → after when a nullified score comes off the board · ' +
        LIVE_REVIEW_SECONDS + 's polling schedule'
      : 'Booth log · pulled from ESPN play-by-play · tracks score before → during → after when a nullified score comes off the board · nullified covers TD, FG, PAT & 2-pt';

    return '<div class="booth">' +
      '<div class="booth-head">' +
        '<div class="booth-title">Flags, challenges &amp; replay reviews</div>' +
        '<div class="booth-sub">' + esc(foot) + '</div>' +
      '</div>' +
      '<div class="booth-filters">' + filters + '</div>' +
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
    const nullChip = (isNullified && !e.removesPoints)
      ? '<span class="badge removed" title="A score was nullified on this play">NULLIFIED</span>'
      : '';
    return '' +
      '<article class="booth-msg ' + esc(e.kind) + (isNew ? ' new' : '') +
        (isNullified ? ' pts-removed' : '') + '">' +
        '<div class="booth-msg-top">' +
          '<span class="booth-when">' + esc(when) + '</span>' +
          liveTag +
          '<span class="badge ' + esc(e.kind) + '">' + esc(kind) + '</span>' +
          rz +
          nullChip +
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

  /* ------------------------------- red zone ------------------------------ */
  /*
   * The Red Zone tab: booth events (flags, challenges, replay reviews) that
   * BOTH
   *   - started in the red zone — the opponent's 20-yard line or inside.
   *     Membership comes from NFLMap.boothEvent(...).redZone, computed only
   *     from the verified play position fields (see lib/mapping.js); an
   *     event whose distance could not be established is never shown, AND
   *   - nullified a score: a touchdown / field goal / PAT / 2-pt conversion
   *     reported as NULLIFIED, wiped by a "- No Play" foul, or REVERSED on
   *     review, or points ESPN actually removed from the running score
   *     (NFLMap.boothEventNullifies — see lib/mapping.js).
   */

  function renderRedZone(el) {
    const events = NFLMap.boothEvents(
      state.summary && state.summary.drives,
      liveLastPlay()
    ).filter(function (e) { return e.redZone && boothEventNullified(e); });
    const feed = el.querySelector('.booth-feed');
    const prevScroll = feed ? feed.scrollTop : 0;
    const nearBottom = !feed ||
      (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 56);

    el.innerHTML = redZoneHTML(events);

    const feed2 = el.querySelector('.booth-feed');
    if (feed2) {
      if (nearBottom) feed2.scrollTop = feed2.scrollHeight;
      else feed2.scrollTop = prevScroll;
    }
  }

  function redZoneHTML(events) {
    const filter = state.redZoneFilter || 'all';
    const counts = boothKindCounts(events);
    const visible = events.filter(function (e) {
      return boothEventShown(e, filter);
    });

    const filters = boothFiltersHTML(filter, counts, 'data-redzone-filter', '');

    let topBanner = '';
    if (events.length) {
      const removedPts = events.reduce(function (sum, e) {
        return sum + (e.removesPoints ? Number(e.pointsRemoved) || 0 : 0);
      }, 0);
      topBanner = '<div class="booth-banner removed-banner" role="status">' +
        '<span class="badge removed">' + events.length + ' NULLIFIED IN RZ</span>' +
        '<span>' + events.length + ' red zone scoring play(s) taken off the board' +
          (removedPts ? ' – ' + removedPts + ' pts removed' : '') + '.</span>' +
      '</div>';
    }

    let body;
    if (!visible.length) {
      body = '<div class="empty booth-empty">No nullified red zone scores yet &mdash; ' +
        'no touchdown, field goal, PAT or 2-pt conversion has been wiped out ' +
        'from the opponent&rsquo;s 20 or inside.</div>';
    } else {
      body = '<div class="booth-feed" role="log" aria-live="polite" aria-relevant="additions">' +
        visible.map(function (e) { return boothMsgHTML(e, false); }).join('') +
      '</div>';
    }

    const live = current() && current().status && current().status.state === 'in';
    // Literal arrow: foot passes through esc() below.
    const foot = 'Nullified scores on plays that started in the opponent’s 20 or ' +
      'inside · TD, FG, PAT & 2-pt wiped by NULLIFIED / No Play / REVERSED wording, ' +
      'or points removed from the running score' +
      (live ? ' · updated every ' + LIVE_REVIEW_SECONDS + 's while live' : '');

    return '<div class="booth">' +
      '<div class="booth-head">' +
        '<div class="booth-title">Red zone nullified scores</div>' +
        '<div class="booth-sub">' + esc(foot) + '</div>' +
      '</div>' +
      topBanner +
      '<div class="booth-filters">' + filters + '</div>' +
      body +
    '</div>';
  }

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
    const nullifiedInGame = boothEvents.filter(boothEventNullified);
    let topBanner = '';
    if (nullifiedInGame.length) {
      topBanner = '<div class="booth-banner removed-banner" role="status">' +
        '<span class="badge removed">' + nullifiedInGame.length + ' NULLIFIED</span>' +
        '<span>' + nullifiedInGame.length + ' scoring play(s) taken off the board in this game – see the highlighted rows, or the Flags &amp; Reviews Nullified filter.</span>' +
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
    state.boothFilter = 'all';
    state.redZoneFilter = 'all';
    state.seenBoothIds = {};
    state.boothPrimed = false;
    state.daySummaries = {};
    state.summaryRequests = {};
    state.dayFeed = { items: [], primed: false };
    state.dayBoothNullified = {};
    state.dayBoothFilter = 'all';
    state.alertedBoothKeys = {};
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

    // The day-wide booth chat: sound toggle + filter buttons + click a message
    // to open that game's own Flags & Reviews tab (or its Red Zone tab while the
    // Red zone filter is active — the same cut the user was just browsing).
    $('day-booth').addEventListener('click', function (e) {
      if (e.target.closest('.day-sound-btn')) {
        toggleBoothSound();
        return;
      }
      const filt = e.target.closest('.day-filter');
      if (filt) {
        state.dayBoothFilter = filt.getAttribute('data-day-filter');
        renderDayBooth();
        return;
      }
      const msg = e.target.closest('.day-msg');
      if (msg) {
        openGame(msg.getAttribute('data-id'),
          state.dayBoothFilter === 'redzone' ? 'redzone' : 'booth');
        return;
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

    // The Flags & Reviews and Red Zone filter buttons live inside
    // #game-content, which is rebuilt on every refresh, so they use one
    // delegated listener on that container.
    $('game-content').addEventListener('click', function (e) {
      const btn = e.target.closest('.booth-filter');
      if (!btn) return;
      const el = $('game-content');
      const booth = btn.getAttribute('data-booth-filter');
      const redzone = btn.getAttribute('data-redzone-filter');
      if (booth) {
        state.boothFilter = booth;
        renderBooth(el);
      } else if (redzone) {
        state.redZoneFilter = redzone;
        renderRedZone(el);
      }
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
