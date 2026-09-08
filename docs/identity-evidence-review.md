# Identity evidence review — September 8, 2026

## Result

Reviewed all 720 offensive salary records in selected Classic group 151307 against the refreshed NFLverse catalog and recorded DynastyProcess crosswalk. Of the 305 eligible offensive players, 302 have corroborating catalog/crosswalk context and three have documented name/position discrepancies. None is promoted to a verified DraftKings mapping. All 24 team defenses remain separate.

The old 52-person discrepancy list included 49 false warnings caused by equivalent provider team abbreviations. The research audit now normalizes LVR/LV, NOS/NO, TBB/TB, GBP/GB, KCC/KC, SFO/SF and NEP/NE, in addition to its existing aliases. It still flags actual team changes and position/ID disagreements. The recorded crosswalk's original download timestamp is unavailable; its team field is not asserted to be current roster evidence.

## Scoped manual findings

| Player | DK playerId | DK playerDkId | Candidate GSIS | ESPN | Finding |
|---|---|---|---|---|---|
| Kenny Gainwell | 1130705 | 560844 | 00-0036919 | 4371733 | The [Buccaneers roster](https://www.buccaneers.com/team/players-roster/kenneth-gainwell/) uses Kenny; their [signing coverage](https://www.buccaneers.com/news/bucs-add-threat-rb-room-kenneth-gainwell) uses Kenneth. Both public names are documented; the DK ID bridge is absent. |
| Chig Okonkwo | 1106374 | 641038 | 00-0037809 | 4360635 | The [Washington roster](https://www.commanders.com/team/players-roster/chig-okonkwo/) uses Chig; the [NFL-hosted Titans media guide](https://static.www.nfl.com/image/upload/league/apps/league-site/media-guides/2024/TEN.pdf) records Chigoziem Charlton. The DK ID bridge is absent. |
| Max Bredeson | 1325562 | 970552 | 00-0041081 | 4878695 | [Minnesota identifies a fullback](https://www.vikings.com/draft/2026/picks/max-bredeson). DK/catalog use RB; the crosswalk uses TE. Preserve DK eligibility and review provider position semantics; do not globally equate TE/RB. |

`config/identity-review-ledger.json` records the reviewer, date, scoped findings and primary-source URLs. These are contextual findings, not provider-issued crosswalks or approved aliases. Its loader rejects attempts to use this context ledger to approve DraftKings identities. Source rows and hashes accompany each new immutable bundle; old frozen archives are unchanged.

## Public-source coverage and remaining evidence

DraftKings draftables identify the player in two separate DK namespaces but do not expose ESPN/GSIS in the inspected payload. NFLverse and the downloaded fantasy crosswalk lack DK IDs. A read-only trial of a guessed DK player-detail path returned 404; no authenticated endpoints were used. No direct ID bridge was obtained.

SportsDataIO's [NFL dictionary](https://sportsdata.io/developers/data-dictionary/nfl) documents a DraftKings cross-reference field. Its [SDX product](https://sportsdata.io/sdx-id-mapping) links to a registry whose public site currently offers [early-access requests](https://sportsdataexchange.com/). This does not establish that an accessible/free catalog includes the exact NFL DK→ESPN/GSIS bridge we require. The user has no existing provider access. No account, purchase, credential, or contact submission was made.

Before asking the user to buy or configure access, obtain a sample and written field coverage confirming an exact DraftKings namespace plus ESPN or GSIS ID for the same player. A generic player database, DK salary export, scrambled trial data, or another name-matching result is insufficient. Validate namespace semantics using several known source records, collisions, inactive/rookie coverage and effective dates. Preserve the source and a reviewer decision before admitting mappings or frozen forecasts to calibration. Production D1 membership remains unverified.

## Site and pipeline

`/research/` defaults to the eligible offensive pool and sorts conflicts first. Filters expose unresolved candidates, context discrepancies and missing bridges. Expand a row for exact external IDs, canonical/crosswalk evidence, primary-source review links and the remaining evidence requirement. No approval button exists. A current refresh rebuilds this report; content changes create a new immutable bundle. Evidence updates never silently change a player's canonical assignment, forecast or DK roster position.

Full offensive queue: 461 bridge-needed candidates, 121 without a unique candidate, 83 context discrepancies and 55 identity conflicts. Those totals include disabled and excluded records; they must not be confused with the active 302/3 split. Review of excluded records remains pending.

Validation: 106 offline tests (55 Node, 51 Python), TypeScript, and browser checks of 305 eligible rows, the three-conflict filter, expanded evidence and a 641px layout without page overflow. The refreshed immutable bundle is `a8c81572bd5af2507918a08d`. No production D1 write, alias approval or calibration promotion was made.
