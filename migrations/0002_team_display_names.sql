UPDATE teams
SET team_name = CASE team_id
  WHEN 'ARI' THEN 'Arizona Cardinals' WHEN 'ATL' THEN 'Atlanta Falcons'
  WHEN 'BAL' THEN 'Baltimore Ravens' WHEN 'BUF' THEN 'Buffalo Bills'
  WHEN 'CAR' THEN 'Carolina Panthers' WHEN 'CHI' THEN 'Chicago Bears'
  WHEN 'CIN' THEN 'Cincinnati Bengals' WHEN 'CLE' THEN 'Cleveland Browns'
  WHEN 'DAL' THEN 'Dallas Cowboys' WHEN 'DEN' THEN 'Denver Broncos'
  WHEN 'DET' THEN 'Detroit Lions' WHEN 'GB' THEN 'Green Bay Packers'
  WHEN 'HOU' THEN 'Houston Texans' WHEN 'IND' THEN 'Indianapolis Colts'
  WHEN 'JAX' THEN 'Jacksonville Jaguars' WHEN 'KC' THEN 'Kansas City Chiefs'
  WHEN 'LA' THEN 'Los Angeles Rams' WHEN 'LAC' THEN 'Los Angeles Chargers'
  WHEN 'LV' THEN 'Las Vegas Raiders' WHEN 'MIA' THEN 'Miami Dolphins'
  WHEN 'MIN' THEN 'Minnesota Vikings' WHEN 'NE' THEN 'New England Patriots'
  WHEN 'NO' THEN 'New Orleans Saints' WHEN 'NYG' THEN 'New York Giants'
  WHEN 'NYJ' THEN 'New York Jets' WHEN 'PHI' THEN 'Philadelphia Eagles'
  WHEN 'PIT' THEN 'Pittsburgh Steelers' WHEN 'SEA' THEN 'Seattle Seahawks'
  WHEN 'SF' THEN 'San Francisco 49ers' WHEN 'TB' THEN 'Tampa Bay Buccaneers'
  WHEN 'TEN' THEN 'Tennessee Titans' WHEN 'WAS' THEN 'Washington Commanders'
  ELSE team_name
END
WHERE team_id IN ('ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LA','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS');
