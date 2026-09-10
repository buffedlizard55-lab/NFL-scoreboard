# NFL Scoreboard

A dependency-free, single-page NFL scoreboard with a focused **all-games live
nullified-scoring-play feed**. Pick a day and the app scans every game on that
day for a scoring-linked review, coach's challenge, replay, under-review record,
or penalty; the live all-games feed publishes only confirmed nullifications.

**Live on GitHub Pages:** <https://buffedlizard55-lab.github.io/NFL-scoreboard/>

> **Source boundary:** live records come from ESPN Gamecast web endpoints. They
> are not an NFL officiating feed. NFL Football Operations material is used to
> constrain the scoring and replay vocabulary, not to represent a direct live
> NFL data connection. See [verification.md](verification.md) for each source,
> field, and limitation.

## What the scoring-rulings watch does

- Scans **every in-progress or completed game on the selected day**
  automatically; no game IDs or manual play entry are required.
- The all-games live panel shows **confirmed nullified scoring plays only**.
  It never shows potential, retained, or data-check records as live
  nullifications.
- Tracks only scoring-linked **flags, coach challenges, replay rulings, and
  under-review records**. Ordinary flags and ordinary reviews stay out of the
  focused tracking views.
- Provides separate single-game tabs for **Flags, Challenges, Replay, Under
  review, Nullified, Red Zone, and Data checks**, plus nullified-score
  highlighting in Play-by-Play.
- The all-games panel mirrors those categories in its own **separate tabs**
  (Live nullified, Flags, Challenges, Replay, Under review, Red zone, and
  Data checks). Only the **Live nullified** tab is an outcome feed and may
  alert; every other all-games tab is a silent tracking view. A flag,
  challenge, replay, under-review, or red-zone record can only be promoted to
  the live panel when it is a confirmed nullification of the exact scoring play
  that added the points (a direct result, never the end result of a drive or a
  previous drive).
- Keeps a potential ruling in its relevant game-level category while its source
  outcome is unresolved, then records a final source-supported result. It never
  turns a possibility into a claimed nullification.
- Covers touchdowns (offensive, defensive, and special teams), field goals,
  PATs, two-point tries, and safeties when the provider's fields/text support
  that classification. Red Zone contains confirmed nullifications from downs
  whose starting location can be established at the opponent's 20 or inside.

### Watch states and alerts

| State | Meaning | Where it appears | Sound / desktop notification |
| --- | --- | --- | --- |
| **Potential** | A scoring-linked ruling (review, challenge, or penalty) is pending, or a red zone play is being challenged for breaking the boundary for a touchdown. | Its relevant game-level category, the Red Zone tab, and the all-games live replay feed. | Pleasant bell chime sound and desktop notification alert. |
| **Nullified** | The source gives explicit nullification wording, a contiguous overturned scoring ruling, or a complete, causally tied one-team score rollback. | The live all-games feed and the Nullified / Red Zone tabs (per-game and all-games). | Pleasant bell chime sound and desktop notification alert. |
| **Awarded** | A red zone touchdown boundary challenge is overturned to award a touchdown. | The live all-games feed and the Red Zone / Challenges / Replay tabs. | Pleasant bell chime sound and desktop notification alert. |
| **No rollback** | The source published a final retaining result or moved to a normal next play without a rollback. | Its relevant game-level category only (and the matching all-games tracking tab). | Never; remains a silent tracking record. |
| **Data check** | The provider's score changed without a causal ruling, or a pending record disappeared before a result. The record needs review. | The separate all-games and game-level Data checks views. | Never; remains a silent audit record. |

Notifications are deduplicated by scoring play and watch state. Thus a pending record updated
in place to a nullified ruling can notify once for the initial pending review and once for the confirmed
nullification; repeated responses, multiple source rows in the same ruling sequence, retained outcomes,
and data checks do not create extra alerts.

## Evidence rules

The mapper uses only fields actually present in the ESPN play-by-play/header
payloads. It requires one of the following before calling a scoring play
nullified:

1. Explicit scoring nullification language such as `TOUCHDOWN NULLIFIED by
   Penalty`, a scoring `- No Play` penalty record, or a scoring replay/challenge
   reversal;
2. A contiguous scoring review/challenge result reported as overturned; or
3. A complete `awayScore` / `homeScore` running-score decrease on a causally
   tied scoring ruling.

The all-games outcome feed applies a strict final-state gate: a record must be
scoring-linked, have a final `nullified` state, carry an explicit nullified
flag, and not be an irregularity. Pending, retained, and audit records cannot
enter that feed or trigger an alert.

A chain stops at a substantive football play. That means a generic foul on an
ensuing kickoff, punt, return, or later snap cannot be attributed to a prior
score. Partial score objects, two-team drops, and unexplained decreases are
shown as a **Data check** instead of being guessed as officiating outcomes.

The official rules/replay references and field-by-field rationale are in
[verification.md](verification.md). Official NFL static game summaries were
used only to validate wording semantics in tests; they are not used as a
production live feed.

## Live cadence and limits

While selected-day games are live and the page is visible, the app attempts:

| Lane | Nominal schedule | Purpose |
| --- | ---: | --- |
| ESPN compact live header | every 150 ms | Lowest-latency score/status/last-play detection across the league |
| Targeted ESPN game detail | immediately after a changed scoring/scoring-ruling header play or score | One-shot full-play-by-play reconciliation for that game; does not wait for the next base cycle |
| ESPN game detail | every 1 second per live selected-day game | Full play-by-play reconciliation and score-ruling context |
| Selected-day scoreboard | every 15 seconds | Game list and scheduled/final status refresh |

Requests use `cache: 'no-store'` and a shared in-flight guard prevents
overlapping requests in each lane. A changed header can therefore start one
scoring-relevant game's detail request immediately; once that game has cached
play context, ordinary unrelated flags stay on the base cadence. A scoring play
is recognized not only from the provider's `scoringPlay` flag but also from its
own play text (touchdown / field goal / safety / try), so a header play that
omits the flag still triggers targeted reconciliation instead of waiting a
second for the full play-by-play. If a compact-header reply outlasts its
150 ms interval, one missed tick is queued and starts immediately after that
successful reply, rather than waiting for another interval boundary. These
attempted intervals are not a freshness or end-to-end latency guarantee:
upstream publication, network delay/failure, rate limits, browser
scheduling/background tabs, caching outside this app, and autoplay policy are
outside the app's control. A browser may also suppress sound until a user has
interacted with the page.

## Quick start

```bash
npm start        # serves http://0.0.0.0:8080 (no install step)
npm test         # mapping, scheduler, and browser-app smoke tests
```

There are no npm dependencies. `server.js` is a small Node `http` static
server; the app itself is vanilla HTML, CSS, and JavaScript.

## Data endpoints

The application directly requests these ESPN Gamecast web endpoints:

```text
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYYMMDD
https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=football&league=nfl
https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=<eventId>
```

They supply the selected-day games, compact live header, and game detail/play
records respectively. These endpoint shapes are treated as provider data, not
as a guaranteed or official public API contract. The app does not call an NFL
live officiating endpoint, does not use a secret/client credential, and does
not claim NFL source provenance for provider rulings.

## Project layout

```text
index.html                App shell
styles.css                UI styling
app.js                    Fetching, latency lanes, UI, and notification gating
lib/mapping.js            Pure ESPN payload mapping and causal ruling logic
lib/refresh.js            Poll scheduling and visibility/in-flight guards
verification.md           Source, field, evidence, and latency verification
server.js                 Dependency-free local static server
test/
  mapping.test.js         Ruling-state and field-mapping unit tests
  refresh.test.js         Scheduler tests
  app.test.js             Browser-app/fetch smoke test
  fixtures/sample.json    API-shaped fixture
```

## Testing

```bash
npm test
```

The test suite runs without a network connection. It covers the four watch
states; accepted and rejected causal paths; score types including defensive and
special-teams touchdowns, field goals, PATs, two-point tries, and safeties;
partial/malformed score safety; all-games merging; fast-header refreshes;
pending-to-nullified behavior; disappearance/audit behavior; separate category
views; the separate all-games tracking tabs for flags, challenges, replay,
under-review and red zone; and the strict rule that only a confirmed nullified
score can enter the all-games live feed or trigger the
sound/desktop-notification paths.

## GitHub Pages

The app is static and is served from the repository root. `_config.yml`
excludes local development scaffolding; merging the configured Pages source
branch deploys the site without a build step.

## Affiliation

This is an independent scoreboard UI. It is not affiliated with the NFL,
NFL.com, or ESPN.
