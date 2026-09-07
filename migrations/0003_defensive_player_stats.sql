ALTER TABLE player_game_stats ADD COLUMN tackles_solo REAL NOT NULL DEFAULT 0;
ALTER TABLE player_game_stats ADD COLUMN tackle_assists REAL NOT NULL DEFAULT 0;
ALTER TABLE player_game_stats ADD COLUMN tackles_for_loss REAL NOT NULL DEFAULT 0;
ALTER TABLE player_game_stats ADD COLUMN sacks REAL NOT NULL DEFAULT 0;
ALTER TABLE player_game_stats ADD COLUMN qb_hits REAL NOT NULL DEFAULT 0;
ALTER TABLE player_game_stats ADD COLUMN interceptions REAL NOT NULL DEFAULT 0;
ALTER TABLE player_game_stats ADD COLUMN passes_defended REAL NOT NULL DEFAULT 0;
