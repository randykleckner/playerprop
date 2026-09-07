# Doctor Chart

Reference-driven trading-card UI: cream stock, full team-color double border, Dr. Locks wordmark at upper left, player name and team at the bottom, prominent Over/Under line, and confidence seal. At **80% or higher**, the front includes the anime doctor/lock badge. The old generic defense-grade rationale and “model leans” language have been removed. Current portraits come from the existing NFLverse/ESPN player media catalog; they are headshots, not licensed action photography like the reference mockup.

The reverse is a concise briefing with Betting line, Game time, a recent stat strip, Defense, and Role or Play callers when documented. A historical sample is labeled by season. Situational claims must be supported; unavailable blitz or play-caller details are omitted rather than generated. These descriptions explain evidence, not guaranteed outcomes. Shared model limitations appear above the board instead of repeating on each card.

## Source corrections

The live API now chooses an **actual bookmaker quote**, preferring DraftKings when available and otherwise sorting sportsbook names deterministically. It no longer presents an average line as a named book's quote. The selected quote is used consistently for the signal calculation and all historical Over/Under/push counts. The returned `lineSource: quoted`, `sportsbook`, and `oddsCapturedAt` identify the source. Legacy fallback data without this provenance is labeled Market average and receives no sportsbook logo.

The API adds `recentTotal`, individual `recentGameValues`, `recentOverCount`, `recentUnderCount`, `recentPushCount`, `historySeason`, and the opponent's `defenseRecentAverageAllowed` / `defenseRecentGames`. The recent total is summed from the actual rows, not reconstructed from a rounded average. Defense allowances are totals for all opposing players at the listed position, not an individual player's forecast. Season and last-five-game contexts remain separately labeled. No production D1 writes or migrations are needed.

## Manual research workflow

`public/doctor-chart-notes.json` stores optional reviewed briefings. Entries are keyed by `eventId|playerId|marketKey`. Required metadata:

- `reviewed: true`, ISO `reviewedAt` and `expiresAt`.
- Exact `line`, `direction`, `sportsbook`, and `oddsCapturedAt` matching the current signal.
- At least one `sources` entry with a descriptive `title` and HTTPS `url`.
- Optional `gameTime`, `defense`, `playCallers`, `watch` paragraphs, each at most 700 characters.

The renderer only accepts notes within the review/expiration window and before game start. Changed quotes, events, sources or review metadata fail closed. Reviewed text replaces the corresponding computed paragraph; it never changes the pick or confidence score. The notebook starts empty. No hypothetical examples have been published as facts.

For a blitz-specific brief, first obtain timestamped charting data defining what counts as a blitz, join it to the exact player/game sample, record attempts/snaps and games in that sample, compare against an appropriate league baseline, and retain the query/source. A coordinator's name alone does not establish play-calling responsibility or a tendency. Do not compare a full-season allowance to “last five” without computing that separate window.

## Assets

- `public/assets/dr-locks-badge.png`: generated with the built-in image-generation tool, preserved with transparent alpha. Prompt: “Create a single isolated transparent-background mascot badge asset for the upper right corner of a vintage football trading card. Anime mad scientist sports doctor: wild spiky white hair, arched dark eyebrows, expressive intense but playful face, silver round doctor's head mirror with headband, white lab coat collar, teal necktie. Head and shoulders only, closely cropped within image with modest transparent margin. A prominent golden closed padlock with black keyhole overlaps the lower right of the bust. Bold crisp black ink outlines, polished cel-shaded anime illustration, white and silver highlights, clear readable silhouette at 70 pixels. No words, no letters, no logo, no border, no card, no football players. Genuine transparent alpha background. Square 512px composition.”
- `public/assets/card-football.svg`: project-authored vector decoration.
- `public/assets/draftkings-source.png`: official source icon from https://sportsbook.draftkings.com/static/Sportsbook_sideRail_icon_2.png, used only for an actual DraftKings quote.

Tests cover quote selection, exact totals, recent versus season defense averages, briefing copy, note provenance/expiration, escaping, confidence thresholds, and flip accessibility state. Click/Enter/Space flips; Escape returns to the front. Reduced motion disables animation.
