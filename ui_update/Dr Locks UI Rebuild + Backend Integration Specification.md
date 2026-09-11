# Dr Locks — Full UI Rebuild and Backend Integration

## Objective

Rebuild the Dr Locks frontend around the supplied UI mockups while preserving and reconnecting the existing backend, simulation, projection, DFS, prop, injury/news, roster, and data-processing functionality.

This is primarily a frontend architecture and integration project.

Do **not** rewrite working analytical logic merely to accommodate the new interface.

The application should feel like a desktop productivity application rather than a collection of dashboard cards:

- persistent left navigation
- persistent contextual toolbar
- large primary workspace
- contextual right-side inspector when controls are needed
- compact tables and lists for dense data
- progressive disclosure for advanced information
- consistent interaction patterns across pages

The mockups are the visual reference. Existing production logic and data pipelines are the functional reference.

---

# 1. Start by Auditing the Existing Project

Before making substantial changes:

1. Inspect the repository structure.
2. Identify the frontend framework and routing structure.
3. Identify API clients and backend endpoints.
4. Identify Cloudflare Worker endpoints.
5. Identify D1 bindings, queries, schema and migrations.
6. Identify current projection and simulation functions.
7. Identify DFS lineup-generation logic.
8. Identify player prop calculations.
9. Identify injury/news/roster ingestion.
10. Identify saved-lineup and saved-scenario persistence.
11. Identify any scheduled jobs or data refresh jobs.
12. Identify existing reusable components that can be retained.

Create a short internal inventory before changing code.

Do not assume endpoint names shown in mockups exist.

Do not create duplicate APIs if equivalent functionality already exists.

---

# 2. Preserve Existing Domain Logic

The rebuild must preserve existing concepts such as:

- player projections
- DFS salaries
- DraftKings/FanDuel slate data
- floor projections
- ceiling projections
- ownership projections where available
- lineup optimizer
- lineup stacking
- prop markets
- betting lines
- simulation outputs
- game-level modeling
- roster/depth chart data
- official injury information
- expected participation
- news impacts
- scenario analysis
- saved lineups
- saved simulations/scenarios

Existing model terminology such as EngineV2, PersonnelV2 and BaseV1 should remain usable internally even if the interface presents friendlier labels.

---

# 3. Critical Product Rule: Verified Reality vs Hypothetical Scenarios

Do not allow users to casually edit real-world player injury or availability status.

Normal application views must treat:

- OUT
- Doubtful
- Questionable
- Limited
- Expected to Play
- Active
- IR/PUP/etc.

as verified data derived from credible system sources.

Display:

- current status
- source
- timestamp
- model impact when available

Example:

Travis Kelce  
OUT  
Official Injury Report · Updated 2h ago

Users must not be given a normal dropdown that changes Kelce from Active to OUT.

Hypothetical availability changes are allowed only inside an explicitly labeled:

**What-If Scenario**

or equivalent scenario-analysis mode.

The UI must visually distinguish:

REAL DATA

from

HYPOTHETICAL ASSUMPTIONS.

---

# 4. Shared Application Shell

Create one reusable application shell.

Conceptually:

```tsx
<AppShell>
  <Sidebar />
  <TopToolbar />

  <MainWorkspace>
    {page}
  </MainWorkspace>

  <InspectorPanel>
    {contextControls}
  </InspectorPanel>
</AppShell>
```

The inspector should be optional.

Pages should not create their own unrelated navigation systems.

---

# 5. Left Sidebar

Canonical navigation:

Home

Lineup Builder

Recommended Lineups

Player Props

Drive Lab

Simulation Station

Injuries & News

Analytics

Saved Lineups

Settings

Use icons consistently.

Selected route should have a clear highlighted state.

Sidebar should collapse appropriately on smaller desktop widths.

Mobile should use a compact bottom navigation or equivalent mobile navigation.

---

# 6. Global Toolbar

Use the toolbar for context that applies to the entire workspace.

Typical controls:

League

Week

Slate

Site

Contest type

Game

Search

Not every page requires every selector.

Contextual examples:

DFS pages:
NFL | Week 15 | Main Slate | DraftKings | GPP

Drive Lab:
NFL | Week 15 | BUF @ DET

Props:
NFL | Week 15 | Main Slate | Passing/Rushing/etc.

Do not repeat these same selectors inside the right inspector.

---

# 7. Design System

Create shared tokens/components rather than hardcoded page styling.

## Layout

Use:

- approximately 240px desktop sidebar
- flexible center workspace
- approximately 320–360px optional inspector
- consistent 8px spacing scale
- restrained card borders
- minimal shadows
- substantial whitespace

Avoid giant isolated dashboard cards unless they contain genuinely important summarized content.

## Typography

Create a predictable hierarchy:

Page title

Section title

Metric

Body

Secondary/meta

Table text

## Colors

Use the mockups as the visual direction:

dark navy application chrome

white/light-gray workspace

blue primary actions

green positive values

red negative/risk

amber caution/questionable

muted gray secondary information

Team colors may be used selectively.

Do not allow team colors to overwhelm the base UI.

---

# 8. Shared Components

Prefer reusable components such as:

```tsx
<AppShell />
<Sidebar />
<Toolbar />
<Inspector />
<PageHeader />
<MetricStrip />
<Metric />
<DataTable />
<PlayerAvatar />
<PlayerRow />
<PlayerSearch />
<PlayerPool />
<GameSelector />
<WeekSelector />
<SlateSelector />
<SiteSelector />
<StatusBadge />
<ConfidenceBadge />
<EdgeBadge />
<ProjectionCell />
<SalaryCell />
<OwnershipCell />
<StackBadge />
<SegmentedControl />
<FilterBar />
<InspectorSection />
<EmptyState />
<LoadingState />
<ErrorState />
<SourceBadge />
<Timestamp />
```

DFS-specific:

```tsx
<LineupSlot />
<LineupTable />
<PlayerPoolTable />
<OptimizerControls />
<StackControls />
<RecommendedLineup />
<StackCard />
<FloorLineupCard />
<CeilingLineupCard />
```

Simulation-specific:

```tsx
<DistributionChart />
<ScenarioComparison />
<SimulationControls />
<PercentileStrip />
```

---

# 9. Home / Command Center

Purpose:

Give users an immediate read on the slate.

Show:

- current NFL week/slate
- top overall recommendation
- top floor opportunity
- top ceiling opportunity
- high-value props
- key injury/news changes
- optional slate/game summary

Do not turn Home into another full analytics page.

Home should answer:

**What should I look at today?**

Each item should lead into the appropriate detailed workflow.

---

# 10. Lineup Builder

This is a core product workflow.

## Top summary

Show:

Salary used

Salary remaining

Projected points

Ceiling

Projected ownership

Leverage

## Main lineup

DraftKings example:

QB

RB

RB

WR

WR

WR

TE

FLEX

DST

Each slot shows:

player

team/opponent

salary

projection

ownership

remove action

Allow direct replacement.

## Player Pool

The Builder MUST include a comprehensive player list.

The player pool should support:

Search

Position tabs:
ALL / QB / RB / WR / TE / DST

Team filter

Game filter

Minimum/maximum salary

Minimum/maximum projection

Minimum/maximum ownership

Availability

Sorting by:

salary

projection

value

ownership

ceiling

floor where supported

Each player receives an Add action.

Unavailable players should be visibly disabled or flagged rather than silently removed unless product logic explicitly excludes them.

## Right Inspector — Build Controls

Move optimizer configuration here.

Include as supported by backend:

number of lineups

minimum salary

QB stack

bring-back rules

lock player

exclude player

ownership cap

team exposure

projection preference

floor/ceiling preference

correlation preference

contest style

Generate Lineups button

Save Lineup button

Do not duplicate the player pool here.

---

# 11. Recommended Lineups

This page is curated rather than exploratory.

Show:

## Best Overall Suggestion

One primary lineup.

Include:

players

salary

projection

floor

ceiling

ownership

key stack

brief rationale

Primary action:

**Export to Builder**

This must load the lineup into Lineup Builder while keeping the lineup editable.

## Quality Floor Plays

Show two recommended safer lineups.

Each card:

projection

floor

ownership

salary

key players

brief reason

Actions:

View Lineup

Export to Builder

Link:

View All Floor Plays

## Ceiling Plays / Stacks

Show three high-upside recommendations.

Each card:

core stack

bring-back

projection

ceiling

ownership

salary

correlation/leverage indicator

Actions:

View

Build Around Stack

Link:

View All Stacks

Avoid repeating explanatory methodology both in a right panel and footer.

Use one concise help/info entry if methodology needs explanation.

---

# 12. View All Floor Plays

This is a drill-down route from Recommended Lineups.

Do not add it permanently to the sidebar.

Use breadcrumb/navigation back to Recommended Lineups.

Main workspace contains a searchable/sortable list of floor-focused lineups.

Columns/metrics:

projection

floor

ceiling

salary

ownership

volatility

correlation

stack type

Players may be previewed compactly.

Filters may include:

minimum floor

maximum ownership

minimum projection

max volatility

game stack

salary remaining

contest type

Actions:

View

Save

Export to Builder

---

# 13. View All Ceiling Plays

Similar architecture to Floor Plays, but optimized around:

ceiling

upside

ownership

leverage

stack correlation

game environment

contrarian score where supported

Do not manufacture metrics that the backend cannot calculate.

---

# 14. View All Stacks

This page should be particularly strong.

Organize recommendations by stack structures rather than full lineups.

Example card:

BUF Stack

Josh Allen + WR + TE

Bring-back: opponent WR

Combined salary

Combined projection

Combined ceiling

Projected ownership

Correlation score

Game total/context

Primary action:

**Build Around Stack**

When clicked:

1. Open Lineup Builder.
2. Insert those players.
3. Mark them as locked.
4. Allow optimizer to fill remaining roster slots.

Filters:

QB + WR

QB + 2 pass catchers

QB + TE

Bring-back required

Team

Game

Salary

Ownership

Projection

Ceiling

Correlation

---

# 15. Player Props

Use a dense table rather than large cards.

Tabs:

All

Passing

Rushing

Receiving

Touchdowns

Favorites / My Plays if supported

Columns:

Player

Team

Market

Sportsbook line

Model projection

Over probability

Under probability

Edge

Confidence

Status

Action

Filters belong in a compact toolbar or right inspector.

Selecting a prop should open Prop Detail without losing current filters.

---

# 16. Prop Detail

Show:

Player identity

Market

Sportsbook line

Model projection

Over/under probability

Edge

Confidence

Distribution

Relevant matchup splits

Opponent performance

Recent form

Injury/news context

Weather/game environment

Line movement where available

Data/source timestamps

Include a clear explanation of why the model favors or fades the line.

Do not state certainty.

---

# 17. Drive Lab

Purpose:

Understand how a game environment and roster context affect outcomes.

Toolbar:

week

game

view

Workspace:

team matchup

game projection

pace

pass/rush tendencies

red-zone performance

key matchup metrics

player impact information

verified injury/news context

Tabs may include:

Game Overview

Matchup

Drive Impact

Projections

Key Injuries

Right inspector should show game context, not duplicate the whole page.

Normal Drive Lab should use actual verified roster status.

Hypothetical modifications belong in What-If Scenario mode.

---

# 18. Simulation Station

Player/game selection must be dynamic.

Josh Allen in mockups is an example only.

The user must be able to:

search player

select from roster

arrive here by selecting a player elsewhere

change the active market

Core workspace:

base projection

scenario projection

market probability

confidence

distribution chart

percentiles

splits

scenario comparison

Right inspector:

simulation runs

selected market line

supported assumptions

weather toggle

recent form toggle

injury effects toggle

game context

Do not expose unsupported arbitrary model parameters just because they appear in a mockup.

The interface should consume the actual capabilities of the existing simulation engine.

---

# 19. Injuries & News

This is the application's authoritative availability view.

Columns:

player

team

status

injury/news type

details

source

updated time

Allow filters:

team

status

injuries

news

lineup changes

weather where applicable

Clicking a player should show detail.

Include credible source attribution.

Never imply a user-edited hypothetical status is real.

---

# 20. Injury / News Detail

Show:

player/team

current verified status

source

timestamp

recent timeline

practice participation

depth-chart impact

teammates affected

projection impact

DFS impact

prop impact

relevant game

If downstream impact calculations are available, surface them here.

---

# 21. Analytics

Keep analytics useful rather than decorative.

Potential supported views:

projection accuracy

edge hit rate

ROI

simulation calibration

team tendencies

player tendencies

ownership trends

correlation studies

Do not invent historical statistics.

Only display metrics actually backed by stored data.

Use charts where visual comparison provides value.

---

# 22. Saved Lineups / Scenarios

Provide tabs:

Saved Lineups

Saved Scenarios

Saved lineup fields:

name

site

week

slate

contest type

players

projection

salary

created date

Actions:

Load

Rename

Duplicate

Delete

Export where supported

Saved scenario fields:

name

game

assumptions

created date

model/version where useful

Actions:

Load

Duplicate

Delete

---

# 23. Settings

Settings may include:

default sportsbook / DFS site

default slate

default contest type

default scoring

ownership display

leverage display

theme

notifications where implemented

data/source information

account/subscription controls where implemented

Do not expose internal developer configuration to normal users.

---

# 24. Authentication

Keep authentication visually minimal.

Login

Create account

Password recovery

Apple/Google sign-in only if actually implemented.

Do not display fake providers.

---

# 25. Responsive Behavior

Desktop is the primary experience, but major workflows must remain usable on mobile.

## Desktop

Sidebar + workspace + optional inspector.

## Tablet

Collapsible sidebar.

Inspector may become slide-over.

## Mobile

Use compact navigation.

Stack content vertically.

Convert dense desktop tables into:

horizontal scroll tables

or

compact row cards

depending on readability.

The lineup builder must still allow:

view lineup

search player pool

add/remove player

see salary

generate lineup

save lineup

---

# 26. Backend Integration Layer

Create a clean frontend service layer.

Do not scatter raw fetch calls throughout UI components.

Example structure:

```text
src/
  api/
    players.ts
    games.ts
    injuries.ts
    news.ts
    projections.ts
    props.ts
    simulations.ts
    dfs.ts
    lineups.ts
    scenarios.ts
```

or equivalent based on the existing framework.

Each module should:

call the existing backend

normalize response shape

handle errors

provide typed interfaces

avoid duplicating domain logic

---

# 27. Core Frontend Models

Adapt these to the existing data rather than forcing new schemas unnecessarily.

Conceptual types:

```ts
Player
Team
Game
Slate
Projection
PropMarket
PropProjection
InjuryStatus
NewsItem
DFSPlayer
Lineup
LineupRecommendation
StackRecommendation
Scenario
SimulationResult
```

Maintain IDs from authoritative backend sources.

Avoid joining records by display name when IDs are available.

---

# 28. Scenario Architecture

Scenario data should be reusable across tools.

Conceptually:

```ts
Scenario {
  id
  gameId
  modelVersion
  assumptions
  playerOverrides
  weatherOverrides
  gameContextOverrides
  createdAt
}
```

However:

player overrides represent hypothetical analysis and must be labeled as such.

The normal live-data state must remain separate.

Drive Lab, Simulation Station, Props and DFS may consume scenario outputs where appropriate.

---

# 29. Loading and Error States

Every network-backed section needs:

loading state

empty state

error state

retry state where appropriate

Avoid displaying zero as though it is actual data while requests are loading.

Use skeletons for primary tables/panels.

---

# 30. Data Freshness

Display update timestamps for time-sensitive data.

Especially:

injuries

news

DFS salaries

sportsbook lines

weather

rosters

projections

ownership

Users should be able to distinguish:

fresh data

stale data

failed refresh

---

# 31. Implementation Sequence

Do not rebuild every screen simultaneously.

Proceed in this order.

## Phase 1 — Foundation

Build:

design tokens

AppShell

Sidebar

Toolbar

Inspector

routing

responsive layout

shared table components

shared player components

loading/error components

Do not change analytical backend logic.

## Phase 2 — Lineup Builder

Rebuild first because it establishes:

player pool

tables

filters

inspector controls

state management

optimizer connection

saved lineup flow

Verify lineup generation against existing behavior.

## Phase 3 — Recommended Lineups

Implement:

Best Overall

two Floor recommendations

three Ceiling/Stack recommendations

View All Floor

View All Ceiling

View All Stacks

Export to Builder

Build Around Stack

## Phase 4 — Props

Player Props

Prop Detail

filters

favorite/save behavior if supported

## Phase 5 — Drive Lab

Connect verified injury/game context.

Preserve existing engine calculations.

## Phase 6 — Simulation Station

Connect existing simulation backend.

Make player selection dynamic.

## Phase 7 — Injuries & News

Use credible backend/source data.

Add source and timestamp visibility.

## Phase 8 — Analytics

Reconnect stored analytical history.

## Phase 9 — Saved Content

Lineups

scenarios

loading/edit/delete flows

## Phase 10 — Home

Build Home last so it can aggregate working components from the rest of the product.

## Phase 11 — Settings/Auth/Mobile

Finish account/preferences/responsive behavior.

---

# 32. State Management

Use the frontend's existing state approach if it is adequate.

Do not add a large state library merely because of the redesign.

Separate:

global context:
week
slate
site
contest

from page-specific state:
filters
selected player
active tab

from server state:
players
projections
props
injuries
simulations

from persisted user data:
saved lineups
saved scenarios
preferences

---

# 33. URL State

Important selections should be shareable/bookmarkable where practical.

Example:

```text
/props?week=15&type=passing
/drive-lab?game=BUF-DET
/simulation?player=123&market=pass_yards
/dfs/builder?week=15&slate=main
```

Do not encode the entire application state into URLs.

---

# 34. Existing Functionality Must Not Regress

Before replacing an old route:

Document its current functionality.

After replacement:

Verify every existing function still works.

Pay particular attention to:

lineup generation

salary-cap compliance

position eligibility

stacking rules

saved lineups

projection refresh

prop calculations

injury refresh

scenario simulations

model output consistency

Do not declare the UI complete merely because the page renders.

---

# 35. Testing

At minimum test:

routing

responsive shell

player search

player filtering

adding/removing lineup players

salary totals

position validation

optimizer requests

optimizer responses

export recommendation to Builder

build around stack

save/load lineup

prop filters

dynamic Simulation Station player selection

injury/news source rendering

Drive Lab game switching

saved scenario loading

API errors

empty datasets

stale data states

---

# 36. Performance

Avoid downloading every dataset for every route.

Use page-level requests and caching.

Virtualize long player tables if needed.

Lazy-load heavy charts.

Avoid rerunning expensive simulations automatically after every UI interaction unless that is intentional.

Debounce searches.

---

# 37. Accessibility

All important controls must be keyboard accessible.

Tables require proper semantics.

Buttons require labels.

Do not rely only on red/green to communicate state.

Maintain readable contrast.

---

# 38. Visual Acceptance Criteria

The redesign succeeds if the application feels like one cohesive tool.

It should no longer look like:

card

card

card

card

card

stacked vertically forever.

A user should understand:

WHERE they are from the sidebar

WHAT context they are analyzing from the toolbar

WHAT they are working on from the center workspace

WHAT they can adjust from the inspector

The interface should remain information-dense without feeling crowded.

---

# 39. Functional Acceptance Criteria

The project is not finished until:

- existing backend data populates the redesigned pages
- lineup optimizer still produces valid lineups
- Recommended Lineups export into Builder
- stacks can seed the Builder
- injury status comes from system data rather than normal user input
- Simulation Station supports arbitrary eligible players rather than a hardcoded example
- Props consume current projections/lines
- Drive Lab consumes current game/model data
- saved lineups reload correctly
- saved scenarios reload correctly
- no mock data remains in production routes unless explicitly marked as demo data
- stale/failed data is visibly identified
- desktop and mobile workflows are usable

---

# 40. Important Instruction to Codex

Do not interpret the mockup values, player names, teams, salaries, injuries or betting lines as canonical data.

They are visual examples.

Use live/existing application data.

The mockups define:

layout

hierarchy

interaction

spacing

component relationships

The backend defines:

players

games

status

projections

simulations

recommendations

lineups

lines

results

If the mockup conflicts with a working backend capability, preserve the backend capability and adapt the UI cleanly around it.

Do not delete functioning features simply because they were not illustrated in one mockup.

When uncertain, favor preserving functionality while fitting it into the new shared application shell.