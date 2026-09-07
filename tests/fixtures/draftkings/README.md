# Recorded public DraftKings fixtures

Captured anonymously using the diagnostic GET-only client:

- Lobby: 2026-09-06T13:49:58.739Z, https://www.draftkings.com/lobby/getcontests?sport=NFL
- Draftables: 2026-09-06T13:50:03.190Z, https://api.draftkings.com/draftgroups/v1/draftgroups/151307/draftables

The lobby preserves all 16 draft groups, game types and game sets, plus one contest reference per group. Unrelated account/UI/prize metadata is omitted. Contest counts in this reduced fixture are not live contest totals.

The draftables fixture preserves all 1,372 original draftable rows and 12 competitions. Player image URLs, fantasy-stat attributes, alerts and other fields unrelated to this adapter are omitted; salary/identity/team/competition fields are unchanged. Expected normalized pool: 744 players/DST after merging 628 position/FLEX variants, including 24 DST teams.

Tests copy and mutate these recordings to exercise missing/disabled fields, conflicts and schema failures. Those mutations and test canonical IDs are synthetic; they are not historical provider data. Tests never request these endpoints. Full original payloads are retained in the ignored diagnostic archive.
