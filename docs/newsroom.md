# Newsroom

The Newsroom publishes brief, actionable player news at `/newsroom/`. Search by player, filter team/topic, or click the newspaper beside a player to open a keyboard-accessible dialog without navigating away from a roster. Modified clicks retain normal link behavior. Expired briefs lose their player icons. Missing news never implies medical clearance.

## Sources and editorial policy

- ESPN's public NFL RSS: `https://www.espn.com/espn/rss/nfl/news`. Parse RSS items and publication dates, with strict unique full-name matching to NFLverse Players V2 and its ESPN crosswalk. RSS itself does not provide athlete IDs. Only explicit player-subject availability, starting-role, or trade statements produce template briefs. Financial contracts, rankings, speculation, and unsupported mentions are excluded. Publication dates more than five minutes ahead are held, not rewritten.
- NFL's public injury report: `https://www.nfl.com/injuries/`. Validate season/week against the research manifest, table headings and status values. Match name, team and position uniquely. Retain the exact status/participation evidence. Observation time is labeled separately because the table supplies no publication timestamp. Empty game designation is not a claim of availability. Unmatched rows are counted and withheld.
- Official team announcements and press conferences are planned expansion sources, not connected in this release. Defender, coaching and secondary teammate impacts require structured supporting context. Initial briefs identify directly affected offensive players; they do not invent target redistribution.

Briefs use short factual templates, not copied full stories or unconstrained generated analysis. Source links and timestamps remain visible. Performance implications are explicitly interpretations. No news-driven numeric changes are applied to projections or frozen forecasts. News facts are not instructions to the refresh process.

## Refresh and persistence

Run `npm run news:refresh`. The existing `scripts/refresh_current_research.py` also invokes this in a separate failure boundary even if salary discovery fails. The approved Mac heartbeat runs at 10 a.m. and 5 p.m. America/Chicago and publishes changed news assets automatically. This uses the Mac's configured timezone and existing Cloudflare authentication; no new keys, D1 schema, paid service or production Cron is needed.

Each source is cached for one hour, with identifiable headers, 30-second timeout, bounded 8 MiB reads and no redirects. SHA-256-addressed raw responses and normalized snapshots are retained in ignored `.newsroom/`. The public `latest.json` replacement is atomic. Sources fail independently and retain only their last valid briefs with original expiry. Global catalog failure preserves the existing public snapshot. Current source checks expire after 24 hours; RSS stories also expire 72 hours after publication. One current brief per player/topic is retained; raw archives preserve the prior evidence. New official availability reports supersede old ESPN availability briefs for covered players, including removal of old out notices after a cleared report. Historical source omissions cannot renew old timestamps.

The refresh reports source health, report-table coverage, unmatched rows and unclassified mentions. It does not claim comprehensive NFL reporting. Tests use recorded September 8 source excerpts; no automated test needs the network.

## Initial validation

The public ESPN JSON news endpoint returned HTTP 403 with identifiable requests. The published RSS feed succeeded. Ten initial RSS entries were future-dated and withheld. The official report supplied two team tables and yielded two direct offensive-player briefs (TreVeyon Henderson and Tory Horton). This is source coverage at capture time, not all-team completeness or a current availability guarantee.

Release checks: 123 tests (63 Node, 60 Python) and TypeScript passed. Browser checks confirmed player search, in-place dialog open/close and no horizontal overflow. The subsequent September 8 evening refresh succeeded for both sources: four official team tables, three published briefs including Patrick Mahomes's expected start, with two future-dated RSS items still withheld.
