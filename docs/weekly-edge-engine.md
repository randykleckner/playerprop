# Weekly Edge Engine

## Phase 1 — injury persistence and health (2026-09-20)

Audit found two independent loss paths: the Newsroom display discarded all expired briefs even after a source failure retained them, and the availability provider accepted partial team reports. Omitted players then reverted to roster-only UNKNOWN. Successful HTML retrieval was not proof of a complete injury refresh.

Availability now validates scheduled-team coverage, duplicate team tables, nonempty canonical records, and exact player/team identity before publication. Explicit full-practice/active and OUT updates replace older evidence. Omission retains the prior injury with its original timestamp, season/week and a retained marker; omission is not clearance. Retained evidence is explicitly flagged in simulation explanations and freshness metadata. Conflicting duplicate player rows already fail; identical duplicates collapse by canonical ID.

The existing raw content-addressed Newsroom cache remains the raw evidence archive. Immutable `.personnel/availability-*.json` snapshots provide normalized history. The atomic replacement of `public/drive-lab/availability.json` remains the model's commit point. Failures write a separate status and private failure log while leaving that snapshot untouched. This uses the existing snapshot architecture; no D1 migration or new environment variable is required.

Newsroom retains expired Availability briefs in its display with a stale label. Expired briefs remain excluded from `activeStories`, so this display change does not promote old news into fresh model evidence. Original expiry is unchanged. Historical news remains independently accessible.

`/data-health/` consolidates salaries, projections, injuries, rosters, stats, odds, Madden, weather and ownership. It displays last attempt, last successful capture, record count, status, error and freshness. The scheduled local refresh builds this artifact after the independent ingestion steps. Frontend states distinguish loading, current, stale, error and no data expected. Weather/ownership are explicitly not connected. Missing legacy attempt telemetry stays null; a generation timestamp is never substituted for a capture time.

### Limitations and next phase

This is the first implementation increment, not the completed Weekly Edge Engine. Missing rows remain unconfirmed until explicit updated evidence arrives; prior-week evidence is kept as last_known with UNKNOWN participation, so a prior-week OUT does not become a new week's confirmed inactive designation. Strict validation can preserve an older snapshot when a provider publishes only part of its weekly report. A rejected report requires source/identity review, not bypassing validation.

Legacy roster/stats refresh scripts do not yet persist every failed attempt. Health exposes current snapshot freshness but complete per-job attempt accounting remains for the scheduled-job phase. Weather and ownership remain unavailable. Newswire-specific coverage checks still need expansion; the official availability model is separately gated. Projection/lineup inputs still need the Phase 2 integration and subsequent calibration.

Next implement auditable opportunity adjustments using the existing V2 carry/target redistribution, with absent routes/red-zone evidence represented as unavailable. Then opportunity shock/value, matchup scoring, weather, simulation integration, Command Center, builder roles, and scheduled Workers with end-to-end tests. No production Cron changes in this increment.
