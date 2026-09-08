# Automatic player-catalog integration

Completed September 6, 2026. Default diagnostic now loads the NFLverse player catalog automatically when no explicit/local catalog is available. Public DraftKings remains the salary source; CSV is optional only.

- Catalog: 24,828 NFLverse player records, using the project's GSIS namespace.
- Salary pool: 744 records, including 24 DST teams and 720 offensive players.
- Unique name/team/position candidates: 599 (83.2% of offensive players).
- No candidate: 121.
- Confirmed stable DraftKings-to-canonical mappings: 0. NFLverse does not include DraftKings IDs; unique name matches remain candidates, with null canonical player_id.
- Production D1 membership has not been checked for this downloaded catalog, and production data remains unchanged.

The diagnostic writes candidate_review entries containing the provider IDs and full candidate identity fields. These provide the next verification queue without requiring another user-supplied download.

Changed: scripts/dfs/catalog.py, scripts/diagnose_dk_salaries.py, tests/test_dfs_catalog.py, docs/data-sources.md and this report. Validation: 36 tests (6 Node and 30 Python), TypeScript check, public catalog retrieval and isolated local D1 snapshot persistence passed.

Full local report: `/Users/randykleckner/Documents/playerprop/.dfs-salaries/salary-6ed43fb6baeb72e0c31b3b6f85b95b77e16fda58372f335eddea6402653c1bc8-report.json`.


## September 8 identity evidence audit

Corrected provider team-code aliases, reducing eligible-player context discrepancies from 52 to 3. Added source-backed scoped findings for Gainwell, Okonkwo and Bredeson, and a priority-filtered evidence report. 302 candidates are corroborated; all 305 offensive DK mappings remain provisional. No names were automatically verified. The missing requirement is an independently documented DK→ESPN/GSIS ID bridge. See [evidence review](identity-evidence-review.md).
