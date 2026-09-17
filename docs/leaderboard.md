# Weekly Leaderboard

The new `/leaderboard/` page uses the existing static ES-module frontend and shared `public/ui/shell.js` navigation. Desktop uses a 42/58 hero/results composition; screens up to 850px stack the hero above the results. Controls use `?season=2026&week=1` and browser history. Loading, pending, unavailable/retry, and broken-image fallbacks are implemented. No sample scores ship to the site.

## Architecture and reused data

- `src/index.ts`: existing Worker, D1 binding, asset binding and bearer-token convention. No second backend.
- `games`, `player_game_stats`, `players`, `teams`: existing season/week, player IDs, team IDs, positions, names, and offensive actuals. NFLverse import remains `scripts/ingest_nflverse.py` → `/api/ingest/player-stats`.
- `public/simulation/engine.js:dkScore`: shared Dr Locks scoring, including reception points, yardage bonuses, interceptions and fumbles. ESPN fantasy totals and projections are not used. The calculator is unchanged.
- `public/player-media.json` and `public/team-media.json`: existing canonical player-ID and team-abbreviation media catalogs. No new headshot source. Team aliases normalize only for display/media; D1 identities remain unchanged.
- Existing season leaders are a static cumulative-stat artifact, not weekly fantasy snapshots. Existing DFS snapshots describe projections/salaries. Neither represents final weekly leaderboards.
- No Worker cron existed in `wrangler.jsonc`. Research refresh scripts are external processes, not Worker scheduled handlers.

## Migration 0010

`migrations/0010_weekly_leaderboards.sql` adds nullable `passing_interceptions` and `fumbles_lost` to `player_game_stats` (the existing `interceptions` field is defensive). It adds:

- `team_game_fantasy_stats`: five actual DST inputs, keyed by existing game/team IDs; DST is never a fake player.
- `leaderboard_week_readiness`: trusted full-schedule/final-stat attestation, source and timestamp.
- `weekly_leaderboards`: one immutable statistical JSON snapshot per season/week, with scoring version, display identities and hero metadata. A single insert publishes it atomically. No separate entry table is needed.
- `leaderboard_hero_media`: approved game action/player media, provenance and `hero_focal_x`/`hero_focal_y`.

Apply the migration before deploying the Worker. It has been exercised on SQLite in tests; it has **not** been applied remotely. No deployment was performed.

## API

- `GET /api/leaderboard?season=2026&week=1`: exact ready snapshot or `{season, week, status: "pending", available: [...]}`. With no selection, defaults to latest ready week, or current season/week 1 when empty. Explicit unknown historical weeks remain pending, without substitution.
- `POST /api/admin/leaderboard/finalize`: authenticated complete-week manifest (below), validates canonical identities and input coverage, then atomically writes supplemental actuals and readiness.
- `POST /api/admin/leaderboard/generate`: authenticated `{season, week}`, for backfills/retries. An existing ready week is returned unchanged.
- `POST /api/admin/leaderboard/hero`: authenticated approved artwork update, updates only hero metadata. Requires `{season, week, playerId, gameId, kind, url, source, sourceUrl, focalX, focalY, approved: true}`. `kind` is `game-action` or `approved-media`; identity must match the published hero. Focal percentages are 0–100.

Admin endpoints use the existing `INGEST_TOKEN`. They do not call any untrusted URL supplied by the request.

## Final-stat data contract and current gap

**The existing NFLverse import does not store all fantasy inputs, complete DST totals, or a full-schedule finality marker. Existing rows cannot safely produce a ready leaderboard.** An upstream audited importer must supply the following manifest after importing all offensive stats through the existing path. The manifest's game list must be the entire completed regular-season week, not a selected slate. Finality is an explicit trusted-source attestation; the Worker cannot establish league-wide completeness from the existing incomplete game table alone.

```json
{
  "season": 2026,
  "week": 1,
  "source": "approved final-stat provider and dataset revision",
  "finalizedAt": "2026-09-15T10:00:00Z",
  "allGamesFinal": true,
  "gameIds": ["existing-game-id"],
  "players": [
    {"playerId": "existing-player-id", "gameId": "existing-game-id", "passingInterceptions": 0, "fumblesLost": 0}
  ],
  "defenses": [
    {"gameId": "existing-game-id", "teamId": "existing-team-id", "sacks": 2, "interceptions": 1, "recoveries": 0, "defensive_tds": 0, "points_allowed": 17}
  ]
}
```

This abbreviated schema example is intentionally not a valid complete week: include every QB/RB/WR/TE actual row and both teams' DST records for every game. Do not infer missing inputs as zero, manufacture players, use projected stats, sum partial individual defensive records into DST, or infer finality from kickoff time. `points_allowed` must be the provider's fantasy DST points-allowed statistic, not blindly the opposing scoreboard total. Require the provider's canonical game/player mapping; some legacy import fallback game IDs are not league schedule IDs.

`python3 scripts/finalize_leaderboard.py final-week.json --generate` submits this contract using `PLAYERPROP_API_URL` and `PLAYERPROP_INGEST_TOKEN`. It is a transport utility, **not** an implemented final-stat provider. Until a trusted importer supplies complete actuals, the production page correctly says RESULTS PENDING. The scheduled job retrieves finalized D1 data; it does not download missing final actuals from an external provider.

The existing `dkScore` is the site's foundation scoring format, not a newly audited full DraftKings rules implementation: it does not include two-point conversions, safeties, blocked kicks, or all return-scoring categories. Those remain an existing scoring limitation. This feature deliberately reuses it without changing unrelated model results. No kicker is included. Fantasy scores display two decimals; ties at that precision break by canonical ID. Multiple games in a week are summed, with the individual's best game selected for imagery.

## Scheduling and history

`0 12,13 * * TUE` triggers at both possible UTC offsets; `America/Chicago` time gates actual work to Tuesday 07:00. This handles daylight saving without duplicate generations. The job selects finalized unpublished weeks (up to 18 per run), validates actuals, ranks five positions and the top individual, and uses `ON CONFLICT DO NOTHING` for race-safe publication. Older ready snapshots are never overwritten. Late source data can be published with the authenticated generate endpoint; otherwise the next Tuesday run catches up.

## Hero provider

`HeroProvider.getHeroImage({playerId, gameId, season, week})` returns approved URL/source/sourceUrl, canonical IDs, focal coordinates and selection timestamp. The built-in provider queries approved D1 media and prioritizes matching game-action photos over approved player media. There is **no licensed action-photo feed configured**, and no image search/scraping.

Image resolution is bounded to 1.5 seconds and failures use existing headshots, team logos, then a CSS team-branded background. Later provider results cannot hold up publication. Images are pinned in the snapshot; admin artwork updates do not recalculate rankings. Browser image failures remove the broken element and advance through the fallback chain. All dynamic strings are escaped.

## Verification / file inventory

Added: `src/leaderboard/service.ts`, `src/leaderboard/routes.ts`, `public/leaderboard/{index.html,page.js,view.js,page.css}`, migration `0010`, `scripts/finalize_leaderboard.py`, `tests/leaderboard.test.mjs`, `tests/leaderboard.browser.mjs`, and this document.

Modified: `src/index.ts`, `wrangler.jsonc`, `public/ui/shell.js`, `public/simulation/engine.d.ts` (declare existing scorer), `src/simulation/v2/player-engine.ts` (remove now-obsolete expected type error), `tests/dfs.test.mjs` (include new Worker modules in its transpilation harness). Pre-existing unrelated working-tree edits are preserved.

Checks: `npm run check`; `node --test tests/leaderboard.test.mjs`; `npm test`; independent Python discovery; `wrangler deploy --dry-run`. Browser checks run with `PLAYWRIGHT_MODULE` pointing to an installed Playwright entry and Chrome available: `node tests/leaderboard.browser.mjs`. Browser-only fixtures never ship as site data. They cover desktop and 768/390/320px layouts, active navigation, week/season changes, browser back, pending/error/retry states and no horizontal overflow.

### Results from this implementation

- TypeScript: passed.
- Leaderboard tests: **22/22 passed**, including QB/RB/WR/TE/DST leaders, overall individual, deterministic ties, precision, historical week changes, DST normalization, missing/broken images, stalled/failed photo provider, incomplete stats, scheduled idempotency, and independent artwork updates.
- Chrome browser checks: passed at 1440px, 768px, 390px, and 320px; screenshots visually inspected. The first inspection exposed inherited light-theme styles; scoped overrides corrected them before the successful rerun.
- Production Worker build: `wrangler deploy --dry-run` passed (109.88 KiB, 29.00 KiB gzip).
- Full JavaScript suite: **187/189 passed**. The two existing lineup UI tests fail because their VM context lacks `URLSearchParams`; the affected lineup implementation and tests were not changed by this feature.
- Python suite, run independently because `npm test` stops after the JavaScript failure: **99/100 passed**. Existing `test_supersession_failure_retention_and_archives` fails in the newsroom fixture path with an ESPN injury-wire JSON decode failure. That failure is outside the changed leaderboard files; existing newsroom work was preserved.
- `git diff --check`: passed.

Outstanding production work: apply migration 0010 and deploy; connect an audited full-week final-stat importer to the documented finalization contract; optionally configure approved/licensed action photos. The current fallback is existing headshot → team logo → branded CSS artwork. No fabricated statistics or production placeholder players were introduced.
