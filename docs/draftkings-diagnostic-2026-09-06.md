# DraftKings live diagnostic — September 6, 2026

Lobby fetched: `2026-09-06T13:49:58.739Z`. Player pool fetched: `2026-09-06T13:50:03.190Z`.

Anonymous public GET requests succeeded. The full observation was persisted into isolated local D1 and archived locally. No production deployment, Cron, account action or contest submission occurred.

## Available NFL draft groups

| Draft group | Start (UTC) | Games | Game type | Game / contest type IDs |
| --- | --- | ---: | --- | --- |
| 146163 | None | 16 | Best Ball | 145 / 145 |
| 151307 | 2026-09-13T17:00:00.000Z | 12 | Classic | 1 / 21 |
| 151820 | 2026-09-10T00:20:00.000Z | 1 | Showdown Captain Mode | 96 / 96 |
| 153054 | 2026-09-10T00:20:00.000Z | 16 | Classic | 1 / 21 |
| 153095 | None | 16 | Snake | 189 / 189 |
| 153096 | None | 12 | Snake | 189 / 189 |
| 153098 | None | 1 | Snake Showdown | 192 / 192 |
| 153105 | 2026-09-10T00:20:00.000Z | 1 | Single Stat - Total Yards | 354 / 354 |
| 153111 | 2026-09-08T16:00:00.000Z | 3 | Madden Classic | 158 / 158 |
| 153112 | 2026-09-08T16:00:00.000Z | 1 | Madden Showdown Captain Mode | 159 / 159 |
| 153113 | 2026-09-08T18:00:00.000Z | 1 | Madden Showdown Captain Mode | 159 / 159 |
| 153114 | 2026-09-08T20:00:00.000Z | 1 | Madden Showdown Captain Mode | 159 / 159 |
| 153115 | 2026-09-08T22:00:00.000Z | 3 | Madden Classic | 158 / 158 |
| 153116 | 2026-09-08T22:00:00.000Z | 1 | Madden Showdown Captain Mode | 159 / 159 |
| 153117 | 2026-09-09T00:00:00.000Z | 1 | Madden Showdown Captain Mode | 159 / 159 |
| 153118 | 2026-09-09T02:00:00.000Z | 1 | Madden Showdown Captain Mode | 159 / 159 |

The configured selection chose **151307**: NFL Classic, 12 games, September 13 at 17:00 UTC (noon America/Chicago; 1 p.m. America/New_York). Its date, format, start window and largest eligible game count establish it as the Main Slate candidate; it was not chosen by response order.

## Normalized salary pool

- Raw draftables: **1,372**.
- Unique normalized players/DST: **744**, after merging 628 position/FLEX rows.
- Offensive players: **720**; DST teams: **24**.
- Confirmed mappings: **0/720 (0%) in the empty isolated local catalog**. Production mapping success has not been measured. All 720 are reported unresolved; DST has team identity. A verified canonical catalog/crosswalk is needed to evaluate real mapping coverage.
- No missing salary/opponent/start time or disabled-player flags occurred in this observation. This does not establish future schema completeness.

| Player | Position | Team | Opponent | Salary | DK playerId | DK playerDkId |
| --- | --- | --- | --- | ---: | --- | --- |
| Jahmyr Gibbs | RB | DET | NO | 8000 | 1214154 | 693115 |
| Ja'Marr Chase | WR | CIN | TB | 7800 | 1109979 | 557826 |
| Bijan Robinson | RB | ATL | PIT | 7700 | 1228244 | 693112 |
| Amon-Ra St. Brown | WR | DET | NO | 7500 | 1127106 | 560800 |
| Jonathan Taylor | RB | IND | BAL | 7300 | 1065406 | 468700 |
| Justin Jefferson | WR | MIN | GB | 7300 | 1069535 | 485454 |
| James Cook III | RB | BUF | HOU | 7200 | 1131012 | 640895 |
| Chase Brown | RB | CIN | TB | 7100 | 1123379 | 706641 |
| De'Von Achane | RB | MIA | LV | 7000 | 1231820 | 706555 |
| Josh Allen | QB | BUF | HOU | 7000 | 868199 | 11370 |

Sample full normalized records:

```json
[
  {
    "draftable_id": "43727325",
    "draftable_ids": [
      "43727325",
      "43727326"
    ],
    "provider_player_id": "43727325",
    "external_ids": {
      "draftkings_player_id": "1214154",
      "draftkings_player_dk_id": "693115"
    },
    "player_id": null,
    "player_name": "Jahmyr Gibbs",
    "first_name": "Jahmyr",
    "last_name": "Gibbs",
    "team": "DET",
    "position": "RB",
    "salary": 8000,
    "status": "None",
    "is_disabled": false,
    "competition_id": "6176012",
    "game_id": null,
    "game_start_time": "2026-09-13T17:00:00.000Z",
    "opponent": "NO",
    "home_away": "home",
    "eligible_positions": [
      "RB",
      "FLEX"
    ],
    "quality_flags": [
      "unresolved_player_mapping"
    ],
    "identity_status": "unresolved",
    "mapping_candidates": []
  },
  {
    "draftable_id": "43727631",
    "draftable_ids": [
      "43727631",
      "43727632"
    ],
    "provider_player_id": "43727631",
    "external_ids": {
      "draftkings_player_id": "1109979",
      "draftkings_player_dk_id": "557826"
    },
    "player_id": null,
    "player_name": "Ja'Marr Chase",
    "first_name": "Ja'Marr",
    "last_name": "Chase",
    "team": "CIN",
    "position": "WR",
    "salary": 7800,
    "status": "Q",
    "is_disabled": false,
    "competition_id": "6175928",
    "game_id": null,
    "game_start_time": "2026-09-13T17:00:00.000Z",
    "opponent": "TB",
    "home_away": "home",
    "eligible_positions": [
      "WR",
      "FLEX"
    ],
    "quality_flags": [
      "unresolved_player_mapping"
    ],
    "identity_status": "unresolved",
    "mapping_candidates": []
  }
]
```

## Schema observations and validation

The lobby supplies mixed formats, including simulated Madden games and Best Ball. Classic FLEX variants use different draftable IDs, so deduplication must use stable player identity with agreement checks. `errorStatus` is an empty object on success. Start times contain seven fractional digits. The adapter handles these recorded shapes explicitly. HTTP retrieval and local D1 persistence succeeded; the web browsing tool could not open the JSON endpoints, so validation used the implemented anonymous HTTP client.

Fixture tests cover parsing, selection, optional-field flags, identity namespaces/conflicts, duplicate handling, fallback, cache/backoff/lock behavior, archive reconstruction and immutable/complete snapshot persistence. The existing CSV/Worker tests and TypeScript check also pass. See data-sources.md for commands and limitations.

Local snapshot ID: `salary-39a76d92a9191ef6a4319de19f50bac8609e21c8138c27ab7dce0c35b2faf043`.
Full local report: `/Users/randykleckner/Documents/playerprop/.dfs-salaries/salary-39a76d92a9191ef6a4319de19f50bac8609e21c8138c27ab7dce0c35b2faf043-report.json`.

## Files changed in this increment

- `.gitignore`: ignore local salary cache, archives and diagnostic D1.
- `package.json`: add `dfs:diagnose` command.
- `config/dfs-salaries.json`: explicit slate-selection and refresh policy.
- `scripts/diagnose_dk_salaries.py`: public-feed diagnostic, CSV fallback, identity report and optional local persistence.
- `scripts/dfs/providers.py`: shared provider/snapshot contract, CSV provider, fallback and quality reporting.
- `scripts/dfs/draftkings.py`: isolated lobby/draftables parsing and selection.
- `scripts/dfs/http.py`: anonymous allowlisted GET transport, cache, rate limiting and backoff.
- `scripts/dfs/identity.py`: stable-ID/verified-map resolution and uncertain name candidates.
- `scripts/dfs/storage.py`: immutable archive, SQL persistence and provider-neutral local D1 reader.
- `migrations/0007_dfs_provider_snapshots.sql`: source observations, normalized records, raw archive chunks and identity crosswalk.
- `tests/test_draftkings_provider.py`: fixture-driven provider, policy and storage tests.
- `tests/fixtures/draftkings/lobby.json`, `draftables-151307.json`, `README.md`: recorded payload subsets and provenance.
- `docs/data-sources.md`, `docs/architecture.md`, `README.md`: operations, architecture and usage.
- `docs/draftkings-diagnostic-2026-09-06.md`: live findings and implementation record.

Validation: **33 tests passed** (6 Node + 27 Python), TypeScript check passed, and the observed legacy schema plus migrations 0001–0007 applied together in an in-memory SQLite check. Live public endpoint retrieval and isolated local D1 persistence passed. No production migration or deployment was performed.
