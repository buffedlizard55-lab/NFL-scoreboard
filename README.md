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
  kind (All / Flags / Challenges / Replay / Under review / **At risk** /
  **Red zone** — the same cut as a game's Red Zone tab, applied across every
  game of the day: only the flags, challenges, replay reviews, and
  under-review plays on downs that **started in the opponent's 20-yard line
  or inside**). New
  messages appear at the bottom as the feed discovers them, and clicking one
  opens that game's own **Flags & Reviews** tab (or its **Red Zone** tab
  while the Red zone filter is active). The scoreboard also keeps a
  **REVIEW** badge on a game card while its last play is under review, plus a
  **PTS AT RISK** / **PTS REMOVED** badge while the game's newest booth event
  could still take points off the board (or just did) — cards with at-risk
  points get an orange pulsing outline so they pop in the grid. Booth events
  also show the **score before → during → after** the event and badge the
  events that **removed points** (for example, a touchdown taken away by an
  offensive penalty or a replay reversal), including the scoring play that was
  nullified. Events whose points **could still come off** — a touchdown,
  field goal, safety, **extra point or 2-pt conversion** initially ruled good
  with a pending review, an unresolved challenge, or a fresh flag right after
  the score (within **6 plays** and before the ensuing kickoff) — carry a
  pulsing orange **PTS AT RISK** badge (with the point value and the scoring
  play at stake) so the possibility is obvious the moment it happens live,
  before ESPN's running score ever drops. When any game has points at risk,
  a top **PTS AT RISK banner** appears in the day booth with a summary
  (game + points) for manual review. The booth header has a **sound toggle
  button** (🔔 Sound On / 🔇 Sound Off) like the MLB replay feed: it is ON by
  default so automatic alerts keep working as before, and each click plays the
  exact same 3-second alert buzz so you can test the sound. Challenges, replay
  reviews and under-review plays always announce; ordinary penalties stay
  silent **except** when they remove or endanger points. The preference is
  remembered in the browser.
- **Game view** (click any game) — team header with scores, records, a Q1–Q4 + T
  line-score table, venue, broadcast, and attendance, plus a prev/next game
  switcher and six tabs:
  - **Play-by-Play** — every play of every drive (down & distance, clock, play
    description, yardage, running score), highlighted for scoring plays,
    turnovers, penalties, **PTS AT RISK** (a flag/review/challenge that could
    still wipe a nearby TD/FG/PAT/2-pt) and **PTS REMOVED** (score actually
    taken off). At-risk games also show a top banner in this tab.
  - **Flags & Reviews** — a chat-style booth log of **penalties**, **coach
    challenges**, **replay reviews**, and **plays under review**, rebuilt from
    ESPN play-by-play on a 1-second schedule while a game is live. If the same
    classified play arrives with a changed review result, its existing message
    is updated in place. Each entry tracks the running score **before →
    during → after** the flag/review/challenge, flags events that **removed
    points** (e.g. a 5-yard TD erased by an offensive penalty or a TD
    reversed by replay), and names the scoring play that was nullified.
    Events that **could still remove points** — a ruled TD/FG/safety/PAT/2-pt
    with the review still open, a challenge awaiting its verdict, a flag right
    after a fresh score (within 6 plays, before kickoff, and covering current-
    play "TOUCHDOWN. Play under review." as well as delayed reviews after the
    PAT/timeout) — get the pulsing **PTS AT RISK** badge (in the message, the
    score trail, the live UNDER REVIEW banner, and a persistent top banner when
    any at-risk or removed events exist), and the At-risk filter isolates
    exactly those moments for manual review. The detection picks the
    max-points scoring play in the window (so a review after the PAT still
    highlights the 6-pt TD) but keeps a 1-pt PAT flag immediate after the PAT
    as 1-pt at risk.
  - **Red Zone** — the same booth log filtered to the red zone: only the
    flags, challenges, replay reviews, and under-review plays on downs that
    **started in the opponent's 20-yard line or inside**. Red-zone entries
    carry a small red **RZ** badge in the Flags & Reviews tab and in the
    all-games live booth chat, so red-zone trouble is visible without
    switching tabs — and the all-games booth's filter row has a **Red zone**
    chip that applies this same cut across every game of the day. Like the
    booth log, it repaints on every 1-second
    response while the game is live and can be filtered by kind
    (All / Flags / Challenges / Replay / Under review / At risk), and its
    entries carry the same points-removed / points-at-risk highlights.
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
under review), red-zone location detection (the verified `yardsToEndzone` /
"Goal" / possession-line rules, the `0`-sentinel guard, and the no-guessing
fallback), booth before/during/after score tracking, called-back-score
detection, and points-at-risk detection (pending reviews of fresh scores
including single-entry "TOUCHDOWN. Play under review.", live score-less
lastPlay overlays, settled-safe outcomes, the kickoff-settles rule, the
expanded 6-play lookback window before kickoff, max-points selection so a
delayed review after the PAT still highlights the TD, immediate PAT flag
kept as 1-pt at risk, extra point / 2-pt / FG no-good vs good distinction,
and no re-flagging after a completed removal), day-wide feed merging /
attribution / dedupe, in-place review result updates, null-safety, the
15-second/1-second polling cadences, immediate repaint of both the booth and
red zone tabs plus the new persistent at-risk top banners and play-by-play
highlighting, visibility gating, immediate refresh, timer cleanup,
browser-app wiring, request dedupe, the booth sound button (renders, toggles,
and triggers the alert buzz), and rendering against an injected API-shaped
payload — including opening a game and verifying the Red Zone tab shows only
red-zone booth events, checking the all-games booth's Red zone filter chip
(its count, that it cuts the day feed to red-zone flags/challenges/reviews
only, that it counts and keeps red-zone events from **each** game of a
two-game day, and that clicking a message while it is active opens that
game's Red Zone tab), and that a pending review of a ruled touchdown is
badged POINTS AT RISK in the feed and on its game card while a newly
appearing at-risk penalty triggers the alert buzz.

The booth feed does **not** call or invent a separate reviews endpoint. It
classifies the play records returned by the summary endpoint using fields
present in those records (`isPenalty`, `penalty.yards`, `penalty.type.text`,
`type.text`, `text`) and tested description phrases such as "PENALTY on …",
"The replay official reviewed…", "challenged the…", and "Play under review."
The before/during/after score tracking and `points removed` badge also use
only the per-play running scores already returned by ESPN
(`awayScore` / `homeScore`); an event is reported as removing points only when
that running score actually drops, so the app does not invent corrections.

The `points at risk` badge is the forward-looking companion: it is raised when
a booth event sits within a few play entries of a fresh touchdown / field
goal / safety whose points are still counted and the event is not settled
(`Play under review.`, a challenge without a verdict, a reversal whose score
drop ESPN has not published yet, or an accepted/undecided flag after the
score). It clears for settled outcomes (confirmed / stands / declined /
offsetting), once the ensuing kickoff has been played (a flag on the kick or
return can no longer wipe the score), and as soon as the running score
actually drops — at which point the verified `points removed` badge takes
over. It is a possibility flag for manual review, not a verdict, so e.g. a
defensive flag declined after a score, or a flag during the ensuing try, can
briefly light up before the resolution arrives.

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
