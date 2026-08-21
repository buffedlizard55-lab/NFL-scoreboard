/* ------------------------------------------------------------------------- *
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

  const TABS = [
    { id: 'plays', label: 'Play-by-Play' },
    { id: 'drives', label: 'Scoring Drives' },
    { id: 'team', label: 'Team Stats' },
    { id: 'players', label: 'Player Stats' }
  ];

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
    eventIndex: -1,        // open game within state.events
    summary: null,         // raw summary JSON for the open game
    activeTab: 'plays',
    pollTimer: null
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return '' + y + m + day;
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

  /* ------------------------------ scoreboard ----------------------------- */

  function loadScoreboard() {
    $('scoreboard-view').innerHTML = '<div class="loading">Loading scores…</div>';
    fetchScoreboard()
      .then(function (data) {
        state.events = (data.events || []).map(NFLMap.summarizeEvent).filter(Boolean);
        renderScoreboard();
        updateLiveIndicator();
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
        const events = (data.events || []).map(NFLMap.summarizeEvent).filter(Boolean);
        const prevOpen = current();
        state.events = events;
        if (prevOpen) {
          state.eventIndex = state.events.findIndex(function (e) { return e.id === prevOpen.id; });
        }
        renderScoreboard();
        updateLiveIndicator();
        if (state.eventIndex >= 0) renderGameHeader();
      })
      .catch(function () { /* keep last good data on transient failure */ });
  }

  function fetchScoreboard() {
    return fetch(SCOREBOARD_URL + '?dates=' + encodeURIComponent(toYMD(state.date)))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function renderScoreboard() {
    const evs = state.events;
    const live = evs.filter(function (e) { return e.status.state === 'in'; });
    const done = evs.filter(function (e) { return e.status.state === 'post'; });
    const pre = evs.filter(function (e) { return e.status.state === 'pre'; });

    let html = '';
    if (!evs.length) {
      html = '<div class="empty">No games scheduled for ' + esc(fmtDateLabel(state.date)) + '.</div>';
    } else {
      html += groupHTML('In Progress', live);
      html += groupHTML('Final', done);
      html += groupHTML('Upcoming', pre);
    }
    $('scoreboard-view').innerHTML = html;
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
    return '' +
      '<article class="game-card" data-id="' + esc(ev.id) + '">' +
        '<div class="card-top">' +
          '<span class="badge ' + st.cls + '">' + esc(st.text) + sub + '</span>' + bcast +
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

  function updateLiveIndicator() {
    const live = state.events.some(function (e) { return e.status.state === 'in'; });
    $('live-indicator').classList.toggle('hidden', !live);
  }

  /* ------------------------------- game view ----------------------------- */

  function openGame(id) {
    const idx = state.events.findIndex(function (e) { return e.id === id; });
    if (idx < 0) return;
    state.eventIndex = idx;
    state.summary = null;
    state.activeTab = 'plays';
    showGameView();
    renderTabs();
    renderGameHeader();
    $('game-content').innerHTML = '<div class="loading">Loading game data…</div>';

    fetch(SUMMARY_URL + '?event=' + encodeURIComponent(id))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        if (current() && current().id !== id) return; // stale response
        state.summary = json;
        renderGameHeader();
        renderTabContent();
      })
      .catch(function (err) {
        if (current() && current().id !== id) return;
        $('game-content').innerHTML =
          '<div class="error">Could not load game data: ' + esc(err && err.message || err) + '</div>';
      });
  }

  function refreshSummary(id) {
    fetch(SUMMARY_URL + '?event=' + encodeURIComponent(id))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        if (current() && current().id !== id) return;
        state.summary = json;
        renderGameHeader();
        renderTabContent();
      })
      .catch(function () { /* keep last good data */ });
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
    return '<table class="linescore"><thead><tr><th>Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>T</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  }

  function liveSituation() {
    let sit = null;
    if (state.summary && state.summary.header &&
        state.summary.header.competitions && state.summary.header.competitions[0]) {
      sit = state.summary.header.competitions[0].situation;
    }
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
    else if (state.activeTab === 'team') el.innerHTML = teamStatsHTML();
    else if (state.activeTab === 'players') el.innerHTML = playerStatsHTML();
  }

  /* ------------------------------- play by play -------------------------- */

  function playsHTML() {
    const drives = NFLMap.drivesList(state.summary.drives);
    if (!drives.length) {
      return '<div class="empty">Play-by-play is not available for this game.</div>';
    }
    let out = [];
    let lastQ = null;
    drives.forEach(function (d) {
      const q = (d.start && d.start.period) ? d.start.period.number : null;
      const ql = NFLMap.quarterLabel(q);
      if (ql !== lastQ) {
        out.push('<h3 class="quarter">' + esc(ql) + '</h3>');
        lastQ = ql;
      }
      out.push(driveSectionHTML(d));
    });
    return '<div class="pbp">' + out.join('') + '</div>';
  }

  function driveSectionHTML(d) {
    const t = d.team || {};
    const logo = (t.logos && t.logos.length) ? t.logos[0].href : '';
    const result = d.displayResult
      ? '<span class="drive-result">' + esc(d.displayResult) + '</span>'
      : '';
    const rows = (d.plays || []).map(function (p) {
      return playRowHTML(NFLMap.playRow(p));
    }).join('');
    return '' +
      '<div class="drive">' +
        '<div class="drive-head">' +
          '<img class="logo" src="' + esc(logo) + '" alt="">' +
          '<span class="drive-team">' + esc(t.abbreviation || '') + '</span>' +
          '<span class="drive-desc">' + esc(d.description || '') + '</span>' +
          result +
        '</div>' +
        '<table class="plays"><tbody>' + rows + '</tbody></table>' +
      '</div>';
  }

  function playRowHTML(p) {
    const cls = [];
    if (p.scoring) cls.push('scoring');
    if (p.turnover) cls.push('turnover');
    if (p.penalty) cls.push('penalty');
    const yard = p.yardage != null ? '<span class="yds">' + esc(p.yardage) + ' yds</span>' : '';
    const pen = p.penaltyText ? ' <span class="pen">(' + esc(p.penaltyText) + ')</span>' : '';
    return '' +
      '<tr class="' + cls.join(' ') + '">' +
        '<td class="dd">' + esc(p.downDistance) + '</td>' +
        '<td class="clock">' + esc(p.clock) + '</td>' +
        '<td class="desc">' + esc(p.text) + pen + yard + '</td>' +
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
    return '<table class="scoring-drives"><tbody>' + rows + '</tbody></table>';
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
    return '<table class="team-stats"><tbody>' + head + rows + '</tbody></table>';
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

    return '<table class="player-stats"><thead>' + teamHead +
      '<tr class="col-h">' + headCells + '</tr></thead><tbody>' + body + totals + '</tbody></table>';
  }

  /* ------------------------------ view toggling -------------------------- */

  function showScoreboardView() {
    $('game-view').classList.add('hidden');
    $('scoreboard-view').classList.remove('hidden');
  }

  function showGameView() {
    $('scoreboard-view').classList.add('hidden');
    $('game-view').classList.remove('hidden');
  }

  function setDate(d) {
    state.date = d;
    state.events = [];
    state.eventIndex = -1;
    state.summary = null;
    $('date-label').textContent = fmtDateLabel(d);
    showScoreboardView();
    loadScoreboard();
  }

  /* -------------------------------- polling ------------------------------ */

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(function () {
      refreshScoreboard();
      const ev = current();
      if (ev && ev.status.state === 'in') {
        refreshSummary(ev.id);
      }
    }, 15000);
  }

  /* --------------------------------- init -------------------------------- */

  function init() {
    $('prev-day').addEventListener('click', function () { setDate(addDays(state.date, -1)); });
    $('next-day').addEventListener('click', function () { setDate(addDays(state.date, 1)); });
    $('today-btn').addEventListener('click', function () { setDate(new Date()); });
    $('back-btn').addEventListener('click', showScoreboardView);
    $('prev-game').addEventListener('click', function () { stepGame(-1); });
    $('next-game').addEventListener('click', function () { stepGame(1); });

    $('scoreboard-view').addEventListener('click', function (e) {
      const card = e.target.closest('.game-card');
      if (card) openGame(card.getAttribute('data-id'));
    });

    $('tabs').addEventListener('click', function (e) {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      state.activeTab = btn.getAttribute('data-tab');
      const tabs = document.querySelectorAll('#tabs .tab');
      tabs.forEach(function (t) { t.classList.toggle('active', t === btn); });
      renderTabContent();
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
