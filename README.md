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
  kind (All / Flags / Challenges / Replay / Under review / **Nullified** /
  **Red zone** — the same cut as a game's Red Zone tab, applied across every
  game of the day: only the **nullified scores** on downs that **started in
  the opponent's 20-yard line or inside**). New
  messages appear at the bottom as the feed discovers them, and clicking one
  opens that game's own **Flags & Reviews** tab (or its **Red Zone** tab
  while the Red zone filter is active). The scoreboard also keeps a
  **REVIEW** badge on a game card while its last play is under review, plus a
  **NULLIFIED** / **PTS REMOVED** badge when the game's newest booth event
  took a score off the board. Booth events also show the **score before →
  during → after** the event and badge the events that **nullified a score**
  (for example, a touchdown taken away by an offensive penalty or a replay
  reversal), including the scoring play that was wiped out. The booth header
  has a **sound toggle button** (🔔 Sound On / 🔇 Sound Off) like the MLB
  replay feed: it is ON by default, and each click plays the exact same
  gentle 3-second rain alert sound so you can test it. The alert fires
  **only for nullified scores** — flags, challenges, replay reviews and
  under-review plays that take nothing off the board stay silent. The
  preference is remembered in the browser.
- **Game view** (click any game) — team header with scores, records, a Q1–Q4 + T
  line-score table, venue, broadcast, and attendance, plus a prev/next game
  switcher and six tabs:
  - **Play-by-Play** — every play of every drive (down & distance, clock, play
    description, yardage, running score), highlighted for scoring plays,
    turnovers, penalties, **NULLIFIED** (a TD/FG/PAT/2-pt wiped out by an
    accepted foul or a replay reversal) and **PTS REMOVED** (score actually
    taken off ESPN's running total). Games with nullified scores also show a
    top banner in this tab.
  - **Flags & Reviews** — a chat-style booth log of **penalties**, **coach
    challenges**, **replay reviews**, and **plays under review**, rebuilt from
    ESPN play-by-play on a 1-second schedule while a game is live. If the same
    classified play arrives with a changed review result, its existing message
    is updated in place. Each entry tracks the running score **before →
    during → after** the flag/review/challenge, and flags the events that
    **nullified a score** (e.g. a 5-yard TD erased by an offensive penalty or
    a TD reversed by replay), naming the scoring play that was wiped out.
    A **touchdown, field goal, PAT or 2-point conversion nullified** — the
    play text says `TOUCHDOWN NULLIFIED by Penalty`, the score is wiped by an
    accepted `- No Play` foul, or a replay review came back `REVERSED` — or
    points ESPN actually removed from the running score get the **NULLIFIED**
    / **PTS REMOVED** badge (in the message, the score trail, and a persistent
    top banner listing every nullified score of the game), and the
    **Nullified** filter isolates exactly those moments. Nothing else is
    tracked here: a flag or an open review that leaves the score alone is
    listed as an ordinary booth event, never as a nullification.
  - **Red Zone** — the **nullified scores** of the red zone: TD / FG / PAT /
    2-pt wiped out on downs that **started in the opponent's 20-yard line or
    inside**. Red-zone entries carry a small red **RZ** badge in the Flags &
    Reviews tab and in the all-games live booth chat, so red-zone trouble is
    visible without switching tabs — and the all-games booth's filter row has
    a **Red zone** chip that applies this same cut across every game of the
    day. Like the booth log, it repaints on every 1-second response while the
    game is live, headlines the count with an `N NULLIFIED IN RZ` banner, and
    can be filtered by kind (All / Flags / Challenges / Replay / Under review
    / Nullified).
  - **Scoring Drives** — each scoring drive with team, result, plays / yards /
    time, and the score after the play (NFL.com's "Scoring Drives" style).
  - **Team Stats** — full team box score comparison (first downs, total yards,
    passing, rushing, 3rd/4th down, red zone, turnovers, time of possession…).
  - **Player Stats** — passing, rushing, receiving, defense, kicking, punting,
    and return stats per player, with team totals.
- **Live updates** — the selected-day scoreboard endpoint refreshes every 15
  seconds. Separately, while a selected game is live and the tab is visible,
  the app checks ESPN's league-wide live header every 250ms and each game's
  detail every second. The compact header supplies current score/status/situation
  across the league, while game detail supplies play-by-play, flags/reviews, and
  stats. Both requests bypass the browser cache and are independently
  de-duplicated, so a slow play-by-play response cannot hold up score/status
  painting. Review feeds paint on every completed response; the larger
  non-review tabs retain their previous 5-second paint cadence to avoid
  unnecessary DOM churn. Finished games
  receive one final detail snapshot and are then cached for the selected day.
  Returning to a backgrounded tab triggers an immediate refresh. A red
  **LIVE** badge appears whenever a game is live.

## Where the data comes from (the honest answer on "reverse-engineering NFL.com")

NFL.com's own game data is served from `api.nfl.com`, which requires a paid
**NFL Developer Portal API key** (an OAuth client credential that cannot be
embedded in a browser app) and does not allow cross-origin browser requests.
So a purely client-side scoreboard cannot call NFL.com's API directly.

Instead, this app uses **ESPN's public NFL API**, which is free, requires no
key, and is CORS-enabled (callable directly from a browser):

- Scoreboard: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYYMMDD`
- League-wide live header (current score, status, and last-play situation):
  `https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=football&league=nfl`
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
under review), red-zone location detection (the verified `yardsToEndzone` /
"Goal" / possession-line rules, the `0`-sentinel guard, and the no-guessing
fallback), booth before/during/after score tracking, and **nullified-score
detection** (`TOUCHDOWN NULLIFIED by Penalty`, the `- No Play` accepted-foul
form with and without punctuation between `Penalty` and `PENALTY`, a replay
review returning `REVERSED` on a scoring play, the FG / PAT / 2-pt variants,
and a drop in ESPN's own running score — plus the negative cases: a plain
flag, an open review, and a confirmed/stands verdict nullify nothing),
day-wide feed merging / attribution / dedupe, in-place review result updates,
null-safety, the 15-second/1-second polling cadences, immediate repaint of
both the booth and red zone tabs plus the persistent nullified top banners and
play-by-play highlighting, visibility gating, immediate refresh, timer
cleanup, browser-app wiring, request dedupe, the booth sound button (renders,
toggles, and triggers the rain alert sound), and rendering against an injected
API-shaped payload — including opening a game and verifying the Red Zone tab
shows only nullified red-zone scores, checking the all-games booth's Red zone
filter chip (its count, that it cuts the day feed to nullified red-zone
scores only, that it counts and keeps them from **each** game of a two-game
day, and that clicking a message while it is active opens that game's Red
Zone tab), that a touchdown wiped by an accepted foul is badged NULLIFIED in
the feed and on its game card, and that **only** nullified scores play the
alert — a plain penalty leaves the alert silent while a replay reversal that
takes points off fires it.

The booth feed does **not** call or invent a separate reviews endpoint. It
classifies the play records returned by the summary endpoint using fields
present in those records (`isPenalty`, `penalty.yards`, `penalty.type.text`,
`type.text`, `text`) and tested description phrases such as "PENALTY on …",
"The replay official reviewed…", "challenged the…", and "Play under review."
The before/during/after score tracking and `points removed` badge also use
only the per-play running scores already returned by ESPN
(`awayScore` / `homeScore`). A decrease is accepted as a removal only when the
booth event can be the ruling that caused it: a scoring/nullification play, a
review/challenge/replay, or a standalone penalty correction immediately tied
to the scoring play. This causal check also prevents a stale or malformed
lower per-play score on the ensuing kickoff from being mistaken for an
officials' ruling. A routine
kickoff, punt, or return foul cannot erase the preceding score and is never
promoted to a nullification from that feed glitch.

The `NULLIFIED` badge covers the cases where the score is already off the
board but ESPN's running total has not moved (or never will, because the
points were never posted). It is raised only from the officials' own wording
in the play description — `TOUCHDOWN NULLIFIED by Penalty`, a scoring play
wiped by an accepted foul `enforced at … - No Play`, or a replay review of a
scoring play that came back `REVERSED` — applied to the four nullifiable
scores (touchdown, field goal, extra point, 2-point conversion) plus a safety.
There is no forward-looking / speculative mode: a flag that might wipe a score,
an open `Play under review.`, and a verdict of confirmed / stands / declined /
offsetting are all reported as ordinary booth events. The earlier
"points at risk" prediction has been removed from the app entirely — the
At-risk filter, its badges, its banners and its manual-review list are gone,
and the Nullified / Red zone filters and the alert sound now agree on one
single definition of a nullified play.

Red zone membership is likewise computed only from position fields present on
the play records. Verified against real summary responses (Raiders @ Texans,
2026 preseason, event `401873286`):

- `start.yardsToEndzone` is the distance from the play spot to the end zone
  the offense is driving toward — the only side-independent distance on a
  play. It is treated as authoritative when it is a positive number; ESPN
  sends `0` for non-snap entries (timeouts, two-minute warning,
  end-of-period plays), so `0` means "not provided", never "at the end zone".
- `start.downDistanceText` switching to "Goal" ("1st & Goal at HOU 4") marks
  goal-to-go but does not happen consistently ("1st & 10 at HOU 19" stays
  plain), so it is only a fallback.
- As a last resort, `start.possessionText` ("HOU 19" names the nearer goal
  line) is combined with the drive's offense to compute the distance — but
  only when no numeric field is available.

`start.yardLine` is deliberately not used: it is measured from the home
team's goal line (0–100), so its meaning flips with each game's home/away
pairing. When no field can establish the distance, a play is **not** treated
as a red zone play — the app never guesses.

## Notes & limits

- This is polling, not real-time push. In a visible tab, the nominal interval
  is 250ms for the league-wide live-header score/status feed and 1 second for
  each live game's detail/review feed. The separate selected-day scoreboard
  endpoint is refreshed every 15 seconds. In-flight requests are not duplicated.
  Network time, browser scheduling, and ESPN's own update timing are additional
  and outside this app's control.
- The live-score timer attempts up to 240 header refreshes per minute; the
  in-flight guard skips ticks while a prior header fetch is pending. The detail
  timer attempts up to 60 refreshes per live game per minute and likewise skips
  an in-flight request. Initial-load and tab-resume refreshes are separate.
- Preseason games sometimes have `playByPlayAvailable: false`; the app shows a
  friendly "not available" message rather than erroring.
- The day-wide booth chat does not invent per-play timestamps: plays are
  ordered by the sequence ESPN assigns inside each game, games are seeded in
  kickoff order, and newly discovered messages are appended at the bottom of
  the chat as they arrive.
- This project is **not affiliated with the NFL, NFL.com, or ESPN**; it is an
  independent scoreboard UI over ESPN's public API.
