# Recorded ESPN schedule

Public GET captured September 6, 2026:
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=1&limit=100

`espn-week1-2026.json` retains the observed season, week, event kickoff and team abbreviations; other response fields were removed. `../lineup-inputs.json` combines this schedule with small recorded subsets of the September 6 DraftKings and ESPN normalized snapshots. No synthetic projections are presented as observed values. Optimizer toy cases are constructed separately in the test code.
