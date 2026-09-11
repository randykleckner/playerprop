# Unified modeling architecture — audit before redesign

## Existing state and conflicts (September 10, 2026)

| Concern | Current implementation | Conflict / canonical direction |
|---|---|---|
| Canonical player identity | NFLverse Players V2; `scripts/dfs/catalog.py` | Shared IDs; roster/depth crosswalk discrepancies remain explicitly unresolved |
| Roster/depth | `.personnel` archives; `scripts/personnel/model.py` | V2 availability has current roster while V1 uses older salary/projection membership |
| Injury/practice/game status | Official NFL tables parsed independently by Newsroom and `build_v2_availability.py` | Newsroom compares exact position strings; V2 uses position families. Official practice, roster state and model workload are currently flattened into one status |
| Fantasy availability | DK status in V1 research bundles; NFL/practice-derived V2 state | Two different notions of available. Canonical official state must be separate from model interpretation and scenario |
| Workload multipliers | V1 `applyOverrides`; V2 `availability.ts` | V1 renormalization differs from V2 exact retained shares. Shared preparation should resolve effective workload once |
| Madden units | `personnel.json` first-string archive; dynamic V2-D units | Only dynamic scenario units should enter personnel simulation; historical audit must stay labeled |
| Opportunity | V1 ESPN inputs; V2-C recency PBP shares; V2-D redistribution | Engines can differ, but scenario, identity and source vintage must be shared; output consumers must read one selected run |
| Play caller/coaching | V2 empirical down/distance/late-score-state call cells; team pass-rate offset; fixed fourth-down rules | No verified coach tenure/cross-team coaching model. Label current tendencies as team/league proxies, not named-coach facts |
| Pace | V1 game plays; V2 empirical pace cells and clock rules | Shared seconds/play assumptions need engine-specific adapters and explicit unsupported fields |
| Matchups | V1 market environment; V2 bounded Madden modifiers; independent prop scoring | Shared registry must disclose applicability rather than imply all controls affect every engine |
| Engine/scenario UI | `public/simulation` and `public/drive-lab/lab.js` | Page-local overrides; V2 already accumulates multiple changes but reruns after each edit. Move scenario contract/storage outside pages |
| Props | Worker board/model scoring; historical line data | Separate scores are not probabilities from a selected simulation. Add common sampled-distribution evaluation with pushes |
| DFS | Frozen research bundles, V1 results, lineup optimizer | Consume selected shared run; retain existing fallback and label source |
| Newsroom | ESPN RSS + NFL injury tables; `scripts/newsroom/feed.py` | Narrow phrase rules miss surgery/in-game injuries; future-dated RSS drops articles; any official table entry suppresses news regardless of actual evidence or time |

## Canonical direction

One official player-state snapshot holds independent roster, practice and game-status facts with source/cohort/freshness. A shared scenario and assumption registry derives MODEL values and ENGINEER overrides without mutating OFFICIAL evidence. Engine adapters consume the same scenario, declare supported controls, and normalize outputs for DFS/Props. Unsupported measurements stay null, never fabricated. The Command Center reads these shared snapshots and the selected run.

News remains an event/context layer. In particular, a practice-only row must not erase a surgery report or become a confirmed OUT designation. Source refresh success means the endpoint responded, not that all relevant stories were captured.

This audit precedes implementation. Existing V1, V2 Base and V2 Personnel remain available throughout the migration.
