export const COLUMNS={
 value_score:['Value score','number'],salary_change:['Salary change','money'],mean:['MC mean','number'],median:['Median','number'],floor:['Floor P25','number'],ceiling:['Ceiling P90','number'],p75:['P75','number'],p90:['P90','number'],player_name:['Player','text'],team:['Team','text'],position:['Pos','text'],opponent:['Opponent','text'],salary:['Salary','money'],projection:['Projection','number'],points_per_1k:['PTS / $1K','number'],
 sample_games:['Games in sample','number'],actual_fp:['Actual offensive DK pts¹','number'],projected_targets:['Projected targets','number'],projected_carries:['Projected carries','number'],projected_attempts:['Projected pass att','number'],
 attempts:['Pass att','number'],completions:['Completions','number'],passing_yards:['Pass yards','number'],passing_tds:['Pass TD','number'],passing_interceptions:['INT','number'],passing_air_yards:['Pass air yards','number'],
 carries:['Carries','number'],rushing_yards:['Rush yards','number'],rushing_tds:['Rush TD','number'],targets:['Targets','number'],receptions:['Receptions','number'],receiving_yards:['Rec yards','number'],receiving_tds:['Rec TD','number'],receiving_air_yards:['Rec air yards','number'],touches:['Touches','number'],adot:['aDOT','number'],
 routes:['Routes','number'],snap_share:['Snap share','number'],red_zone_targets:['Red-zone targets','number'],goal_line_carries:['Goal-line carries','number'],expected_fp:['Expected FP','number'],production_gap:['Production gap','number'],breakout:['Breakout %','number'],ownership:['Ownership','number']};
export const PRESETS={
 Default:['player_name','team','position','opponent','salary','projection','points_per_1k'],
 DFS:['player_name','salary','salary_change','projection','mean','floor','p75','ceiling','breakout','value_score'],
 Opportunity:['player_name','projected_targets','projected_carries','targets','touches','sample_games','routes','snap_share'],
 Passing:['player_name','attempts','completions','passing_yards','passing_tds','passing_interceptions','passing_air_yards','sample_games'],
 Rushing:['player_name','carries','rushing_yards','rushing_tds','touches','sample_games','goal_line_carries'],
 Receiving:['player_name','targets','receptions','receiving_yards','receiving_tds','adot','sample_games'],
 Advanced:['player_name','expected_fp','production_gap','breakout','ownership','routes','red_zone_targets']};
