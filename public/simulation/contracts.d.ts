export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'DST';
export interface PlayerInput {
  player_id: string; player_name: string; team: string; opponent: string;
  position: Position; salary: number; game_id: string; active?: boolean;
  identity_status?: string; quality_flags?: string[];
  projected_snap_share?: number | null;
  projected_opportunities?: { pass_attempts?: number; targets?: number; carries?: number };
  market_projection?: number | null; statistical_projection?: number | null;
  final_projection?: number | null; floor?: number | null; median?: number | null;
  ceiling?: number | null; stddev?: number | null;
  inputs: {
    pass_attempts?: number; completion_probability?: number; passing_efficiency?: number;
    passing_touchdowns?: number; interceptions?: number; carries?: number;
    rushing_efficiency?: number; rush_share?: number; targets?: number;
    target_share?: number; catch_probability?: number; receiving_efficiency?: number;
    receiving_td_weight?: number; rushing_td_weight?: number; fumble_rate?: number;
    /** Reserved for later provider/model refinement; not consumed by foundation v1. */
    routes?: number | null; touchdown_probability?: number | null;
  };
}
export interface GameInput {
  game_id: string; home: string; away: string; start_time: string;
  total?: number; home_spread?: number; home_implied_total?: number; away_implied_total?: number;
  source?: string; captured_at?: string;
}
export interface SlateInput {
  slate_id: string; data_as_of: string; expires_at?: string;
  games: GameInput[]; players: PlayerInput[];
  assumptions?: string[]; sources?: Record<string,unknown>;
}
export type Override =
 | {target:'player'; id:string; parameter:'out'; value:boolean}
 | {target:'player'; id:string; parameter:'limited'|'carries_multiplier'|'target_share_delta'|'rush_share'|'target_share'|'snap_share'; value:number}
 | {target:'game';id:string;parameter:'total';value:number}
 | {target:'team';id:string;parameter:'pass_rate';value:number};
export interface Distribution {
  simulation_count:number; mean:number; median:number; stddev:number;
  p10:number;p25:number;p50:number;p75:number;p90:number;p95:number;min:number;max:number;
  probability_exceed_projection:number|null;probability_2x:number|null;
  probability_3x:number|null;probability_4x:number|null;
  probabilities:Record<string,number>;
  histogram:{from:number;to:number;count:number}[];
}
