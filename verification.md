# Live nullified-score feed and scoring-ruling views: source and field verification

Last reviewed: **2026-08-30**

This document distinguishes the data the app actually reads from the official
rules material used to constrain its interpretation. It is intentionally not a
claim that this application receives an NFL officiating feed.

## 1. Production ingestion paths

The browser reads these ESPN Gamecast web endpoints:

| Purpose | Endpoint used by the app | Fields consumed |
| --- | --- | --- |
| Selected-day game list | `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYYMMDD` | `events[]`, event `id`, `shortName`, `date`, `competitions[0]`, teams/competitors, status, `situation`, and `playByPlayAvailable` |
| Fast current-game lane | `https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=football&league=nfl` | league `events[]`, event `id`, flat `competitors`, `fullStatus`, `situation.lastPlay`, and `playByPlayAvailable` |
| Game detail / reconciliation | `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=<eventId>` | `header.competitions[0]`, `drives.previous`, `drives.current`, and each drive's `plays[]` |

The field shapes above were checked against completed-game payloads for ESPN
event `401873286` (Raiders at Texans, 2026 preseason). The fixture at
`test/fixtures/sample.json` preserves the checked shape so the mapping tests do
not need a live network request.

### Play fields used for the watch

The mapper reads only the following play fields when deciding whether a record
belongs in the scoring-rulings watch:

| Field | How it is used | Safety rule |
| --- | --- | --- |
| `id`, `sequenceNumber` | Deduplication and source order | The app does not invent a timestamp; missing IDs are handled defensively. |
| `text`, `shortText`, `type.text` | Identifies a penalty, challenge, replay review, pending review, and explicit score-nullification wording | Text alone is not used to fabricate a score rollback. |
| `isPenalty`, `penalty.yards`, `penalty.type.text` | Displays an observed penalty record | A generic penalty is excluded unless causally tied to a scoring play. |
| `scoringPlay` | Provider signal that a play scored | It is preferred over broad word matching. |
| `awayScore`, `homeScore` | Before/during/after running-score evidence | Both values must be present and numeric before a score decrease is trusted. |
| `period.number`, `clock.displayValue` | Display-only game context | Missing values remain blank. |
| `start.yardsToEndzone`, `start.downDistanceText`, `start.possessionText` | Optional red-zone membership | Unknown location is not guessed. |

No separate live reviews, officiating, challenge, or NFL gamebook endpoint is
called by the application.

## 2. Interpretation rules grounded in NFL material

- NFL Football Operations' [2026 NFL Rulebook](https://operations.nfl.com/rules-officiating/2026-nfl-rulebook)
  is the rules reference. Its Rule 11 structure covers touchdowns, tries,
  field goals, and safeties. The app therefore watches those score categories,
  including offensive, defensive, and special-teams touchdowns where the
  provider labels/describes them as such.
- NFL Football Operations' [Replay Officials](https://operations.nfl.com/rules-officiating/instant-replay/replay-officials)
  page says replay officials confirm every scoring play, turnover, failed
  fourth-down attempt, and try attempt. That supports monitoring scoring
  review records; it does **not** provide a public live-event API.
- Official NFL static game summaries were used only to validate wording
  semantics in tests, including “TOUCHDOWN NULLIFIED by Penalty” and “field
  goal is GOOD, NULLIFIED by Penalty.” They are postgame artifacts rather than
  a production feed and have not been adopted for automated ingestion:
  - [Lions at Chiefs, 2025 game summary](https://static.www.nfl.com/image/upload/v1760325253/gamecenter/f7325837-311e-11f0-b670-ae1250fadad1.pdf)
  - [Chiefs at Titans, 2025 game summary](https://static.www.nfl.com/image/upload/v1766403333/gamecenter/f8fa11ba-311e-11f0-b670-ae1250fadad1.pdf)

## 3. What counts as a displayed state

The mapper intentionally separates source evidence from an inferred ruling:

| Watch state | Required evidence | Display location | Notification behavior |
| --- | --- | --- | --- |
| **Potential** | A penalty/review/challenge is causally contiguous with a score, or a red zone play is challenged/reviewed for breaking the boundary for a touchdown | Relevant category tabs (Flags, Challenges, Replay, or Under review), Red Zone tab, and the all-games replay feed | Auditory pleasant bell chime and desktop notification alert. |
| **Nullified** | Explicit score-nullification wording; a contiguous overturned scoring ruling; or a complete, causally tied one-team running-score rollback | The all-games **Live nullified** feed and the Nullified / Red Zone tabs (per-game and all-games) | Auditory pleasant bell chime and desktop notification alert. |
| **Awarded** | A red zone touchdown boundary challenge is overturned to award a touchdown | Red Zone tab, Challenges/Replay tabs, and live feed | Auditory pleasant bell chime and desktop notification alert. |
| **No rollback** | A final non-nullified result, or the source moves to a normal next play without a rollback | Its separate scoring-linked game category only and the matching all-games tracking tab | Visual audit record only; stays silent. |
| **Data check** | A complete provider running score falls without a causal scoring ruling, or a pending source record disappears before an outcome | Separate all-games and game-level Data checks views | Visual audit record only; the app does not guess a nullification. |

The all-games panel renders these categories in **separate tabs** (Live
nullified, Flags, Challenges, Replay, Under review, Red zone, Data checks).
The **Live nullified** tab is the single outcome stream that may alert; the
remaining tabs are silent tracking views. A category record advances into the
Live nullified tab only when the source evidences a confirmed nullification of
the exact scoring play that originally added the points — a direct result of
that play, never the end result of a drive or of an earlier drive.

The all-games outcome path applies the mapper's strict
`isConfirmedNullifiedScoringEvent` gate: it requires a scoring-linked event
whose final watch state is `nullified`, whose explicit `nullified` flag is
true, and which is not an irregularity. Pending, retained, and audit records
cannot enter that feed or any alert path.

A causal chain may include nearby administrative/review records. It stops at a
substantive football play, including a kickoff, punt, or return. This avoids
claiming that a later enforcement action nullified an earlier score. A
simultaneous decrease for both teams is likewise left as a data check rather
than assigned to either team.

## 4. Source limitations and latency

- The ESPN endpoints are provider web endpoints, not official NFL rules or
  officiating endpoints. Third-party documentation describes them as
  undocumented/unofficial; see [sportsapis.dev's ESPN API note](https://sportsapis.dev/espn-api).
  That page is cited only for the limitation, not as a data authority.
- The official NFL identity documentation at
  [api.nfl.com/docs/identity/register](https://api.nfl.com/docs/identity/register/index.html)
  describes OAuth client-credential access. This repository has no such
  credential or demonstrated browser-facing NFL live-data contract.
- The app schedules the compact header request every 150 ms while selected-day
  games are live, game-detail reconciliation every second, and a selected-day
  scoreboard refresh every 15 seconds. When a changed header play is provider-
  classified as a scoring play or a scoring-linked ruling—or the header score
  changes without a usable last play—it also starts one targeted detail
  reconciliation immediately rather than waiting for that base second. A
  scoring play is recognized from the provider's `scoringPlay` flag and, as a
  fallback, from the play's own text (`scoreKindFromText`: touchdown, field
  goal, safety, extra point, two-point try). That removes the up-to-one-second
  wait for the full play-by-play on the common case where the compact header
  publishes a scoring play without the flag. Shared in-flight guards prevent
  duplicate detail calls; if a header reply spans one 150 ms tick, the client
  keeps just one queued follow-up and starts it after the successful reply
  clears. These are attempted client schedules, not an upstream publication or
  end-to-end latency guarantee.
- Provider publication timing, request duration/failure, browser scheduling
  (especially background tabs), rate limits, caching outside the app, and
  autoplay policy can delay or suppress an update or sound. The app requests
  with `cache: 'no-store'` and avoids overlapping requests, but cannot control
  those external factors.

## 5. Test coverage

Run `npm test` to exercise the decision path without network access. The mapper
tests cover pending, retained, nullified, and irregular states; touchdowns
(including defensive and special-teams examples), field goals, PATs, two-point
tries, and safeties; malformed/partial scores; score-delta ambiguity; and the
rule that a later substantive play blocks attribution. The app smoke test
covers all-games collection; immediate targeted detail after a changed scoring
or scoring-ruling header record (including a score update without `lastPlay`);
a single non-overlapping catch-up header poll after a slow reply;
pending-to-nullified and pending-disappearance updates; focused category
rendering; the separate all-games tracking tabs for flags, challenges, replay,
under-review and red zone; and the strict rule that only a confirmed nullified
scoring play can enter the all-games live feed or emit
sound/desktop-notification alerts.

> **Verification status (2026-08-30).** Live endpoint re-verification was
> performed for ESPN event `401873286` with a network-connected client when this
> field/evidence inventory was first assembled; the checked payload shape is
> preserved in `test/fixtures/sample.json` so the mapping and app tests run
> offline. When running in an environment with no outbound network, the live
> provider calls cannot be re-fetched; the fixture and the static tests remain
> the verification baseline in that case.
