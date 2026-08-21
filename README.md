# NFL Scoreboard

A clean, single-page NFL scoreboard. Pick a day, browse **every game** on it,
and drill into a game to see **live play-by-play**, **team stats**, and
**player stats** — with the same level of detail as NFL.com's Game Center.
**No videos.**

**Live on GitHub Pages → <https://buffedlizard55-lab.github.io/NFL-scoreboard/>**

![status: works](https://img.shields.io/badge/status-works-green)

## Quick start

```bash
npm start        # serves the app on http://0.0.0.0:8080 (no install step needed)
npm test         # runs the data-mapping unit tests (no network required)
```

There are **no dependencies** — the local server is plain Node's `http` module
and the frontend is vanilla HTML/CSS/JS. You can also open `index.html`
through any static host — that is exactly how GitHub Pages serves it.

## GitHub Pages

The app is 100% static (all data comes from ESPN's CORS-enabled public API,
fetched straight from the browser), so GitHub Pages publishes it directly from
the repository root — no build step:

- Pages source: branch `main`, path `/` (the app files live at the repo root).
- `_config.yml` tells the Pages (Jekyll) build to skip dev scaffolding
  (`server.js`, `package.json`, `test/`, …) so only the app ships.
- Every merge to `main` redeploys the site automatically.

## What it does

- **Scoreboard view** — all games for a selected day, grouped into *In Progress*,
  *Final*, and *Upcoming*, with team logos, records, scores, status, and broadcast.
  Navigate days with the ‹ › arrows or jump back to **Today**. The header shows
  which **NFL week** the selected day belongs to (e.g. "Preseason Week 2"), and
  days with no games suggest **nearby game days** you can jump to with one tap.
  Cards are keyboard-accessible (Tab + Enter), and Escape returns from a game.
- **Game view** (click any game) — team header with scores, records, a Q1–Q4 + T
  line-score table, venue, broadcast, and attendance, plus a prev/next game
  switcher and four tabs:
  - **Play-by-Play** — every play of every drive (down & distance, clock, play
    description, yardage, running score), highlighted for scoring plays,
    turnovers, and penalties.
  - **Scoring Drives** — each scoring drive with team, result, plays / yards /
    time, and the score after the play (NFL.com's "Scoring Drives" style).
  - **Team Stats** — full team box score comparison (first downs, total yards,
    passing, rushing, 3rd/4th down, red zone, turnovers, time of possession…).
  - **Player Stats** — passing, rushing, receiving, defense, kicking, punting,
    and return stats per player, with team totals.
- **Live updates** — the scoreboard refreshes every 15 seconds; when a game is
  in progress its play-by-play and stats also refresh every 15 seconds. A red
  **LIVE** badge appears whenever a game is live.

## Where the data comes from (the honest answer on "reverse-engineering NFL.com")

NFL.com's own game data is served from `api.nfl.com`, which requires a paid
**NFL Developer Portal API key** (an OAuth client credential that cannot be
embedded in a browser app) and does not allow cross-origin browser requests.
So a purely client-side scoreboard cannot call NFL.com's API directly.

Instead, this app uses **ESPN's public NFL API**, which is free, requires no
key, and is CORS-enabled (callable directly from a browser):

- Scoreboard: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYYMMDD`
- Game detail (box score, player stats, scoring drives, full play-by-play):
  `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=<id>`

This is the same data ESPN's own site uses, and it carries everything NFL.com's
Game Center shows (scores, line scores, team/player stats, and complete
play-by-play). The field names in `public/lib/mapping.js` were verified against
real API responses (e.g. Raiders @ Texans, 2026 preseason, event `401873286`).

## Project layout

```
index.html                # app shell (repo root = what GitHub Pages serves)
styles.css                # styling
app.js                    # UI + data fetching (scoreboard & game detail)
lib/mapping.js            # pure data-mapping helpers (browser + Node)
favicon.svg               # site icon
_config.yml               # GitHub Pages (Jekyll) excludes for dev files
server.js                 # dependency-free dev server (Node built-ins)
test/
  mapping.test.js         # unit tests for the mapping helpers
  fixtures/sample.json    # fixtures mirroring the real API response shapes
```

## Testing / verification

The data-mapping layer is intentionally pure (no network, no DOM) so it can be
verified in Node against fixtures that mirror the real API shapes:

```bash
npm test
```

This validates score/team/linescore extraction, team stats, player stat
categories (passing, rushing, …), play-by-play flattening & ordering, scoring
drives, quarter labels, and null-safety.

## Notes & limits

- Live latency is bounded by the polling cadence (15 s), not real-time push.
- Preseason games sometimes have `playByPlayAvailable: false`; the app shows a
  friendly "not available" message rather than erroring.
- This project is **not affiliated with the NFL, NFL.com, or ESPN**; it is an
  independent scoreboard UI over ESPN's public API.
