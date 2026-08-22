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
npm test         # runs mapping, polling, and app smoke tests (no network required)
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
- **Live booth chat (all games)** — a chat-style feed at the top of the
  scoreboard that merges **every flag, coach challenge, and replay review from
  every game of the selected day** into one live log. Messages carry the game
  (e.g. "LV @ HOU"), a LIVE badge while that game is in progress, the flag
  type and result, quarter & clock, and the play text, and can be filtered by
  kind (All / Flags / Challenges / Replay / Under review). New messages appear
  at the bottom as the feed discovers them, and clicking one opens that game's
  own **Flags & Reviews** tab. The scoreboard also keeps a **REVIEW** badge on
  a game card while its last play is under review.
- **Game view** (click any game) — team header with scores, records, a Q1–Q4 + T
  line-score table, venue, broadcast, and attendance, plus a prev/next game
  switcher and five tabs:
  - **Play-by-Play** — every play of every drive (down & distance, clock, play
    description, yardage, running score), highlighted for scoring plays,
    turnovers, and penalties.
  - **Flags & Reviews** — a chat-style booth log of **penalties**, **coach
    challenges**, **replay reviews**, and **plays under review**, rebuilt from
    ESPN play-by-play on a 1-second schedule while a game is live. If the same
    classified play arrives with a changed review result, its existing message
    is updated in place.
  - **Scoring Drives** — each scoring drive with team, result, plays / yards /
    time, and the score after the play (NFL.com's "Scoring Drives" style).
  - **Team Stats** — full team box score comparison (first downs, total yards,
    passing, rushing, 3rd/4th down, red zone, turnovers, time of possession…).
  - **Player Stats** — passing, rushing, receiving, defense, kicking, punting,
    and return stats per player, with team totals.
- **Live updates** — score/status data refreshes every 15 seconds. In a visible
  browser tab, live game detail (play-by-play, flags/reviews, and stats) is
  checked independently every second, so it does not wait for the scoreboard
  request. Review feeds paint on every completed response; the larger non-review
  tabs retain their previous 5-second paint cadence to avoid unnecessary DOM
  churn. Poll requests bypass the browser HTTP cache, and in-flight detail
  requests are shared instead of duplicated. Finished games receive one final
  detail snapshot and are then cached for the selected day. Returning to a
  backgrounded tab triggers an immediate refresh. A red
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

These endpoints provide the score, line-score, team/player-stat, drive, and
play-by-play fields used by this app. The field names in `lib/mapping.js` were
checked against real endpoint responses (including Raiders @ Texans, 2026
preseason, event `401873286`).

## Project layout

```
index.html                # app shell (repo root = what GitHub Pages serves)
styles.css                # styling
app.js                    # UI + data fetching (scoreboard & game detail)
lib/mapping.js            # pure data-mapping helpers (browser + Node)
lib/refresh.js            # independently tested score/review poll scheduler
favicon.svg               # site icon
_config.yml               # GitHub Pages (Jekyll) excludes for dev files
server.js                 # dependency-free dev server (Node built-ins)
test/
  mapping.test.js         # unit tests for the mapping helpers
  refresh.test.js         # unit tests for cadence, visibility, and cleanup
  app.test.js             # DOM/fetch smoke test with injected API-shaped data
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
drives, quarter labels, booth classification (flags / challenges / replay /
under review), day-wide feed merging / attribution / dedupe, in-place review
result updates, null-safety, the 15-second/1-second polling cadences, visibility
gating, immediate refresh, timer cleanup, browser-app wiring, request dedupe,
and rendering against an injected API-shaped payload.

The booth feed does **not** call or invent a separate reviews endpoint. It
classifies the play records returned by the summary endpoint using fields
present in those records (`isPenalty`, `penalty.yards`, `penalty.type.text`,
`type.text`, `text`) and tested description phrases such as "PENALTY on …",
"The replay official reviewed…", "challenged the…", and "Play under review."

## Notes & limits

- This is polling, not real-time push. In a visible tab, the nominal polling
  intervals are 1 second for live game-detail/review data and 15 seconds for
  score/status data. In-flight requests are not duplicated. Network time,
  browser scheduling, and ESPN's own update timing are additional and are
  outside this app's control.
- The one-second timer attempts up to 60 detail refreshes per minute for each
  live game. A tick is skipped when that game's previous request is still in
  flight; initial-load and tab-resume refreshes are separate.
- Preseason games sometimes have `playByPlayAvailable: false`; the app shows a
  friendly "not available" message rather than erroring.
- The day-wide booth chat does not invent per-play timestamps: plays are
  ordered by the sequence ESPN assigns inside each game, games are seeded in
  kickoff order, and newly discovered messages are appended at the bottom of
  the chat as they arrive.
- This project is **not affiliated with the NFL, NFL.com, or ESPN**; it is an
  independent scoreboard UI over ESPN's public API.
