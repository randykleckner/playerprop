const aliases = { JAC: 'JAX', LAR: 'LA', WSH: 'WAS' };
const team = value => aliases[value] || value;
const timestamp = value => { const time = Date.parse(value); if (!Number.isFinite(time)) throw Error('Invalid snapshot timestamp'); return time; };

export function preparePool(salary, projection, schedule, { allowProvisional = false, now = new Date().toISOString() } = {}) {
  const asOf = timestamp(now), lock = timestamp(salary.slate.start_time);
  if (asOf >= lock) throw Error('Slate is locked; no upcoming lineups generated');
  if (salary.slate.sport !== 'NFL' || salary.slate.format !== 'Classic' || salary.slate.game_count < 2) throw Error('NFL multi-game Classic slate required');
  if (schedule.season?.year !== projection.season || schedule.season?.type !== 2 || schedule.week?.number !== projection.week) throw Error('Projection and schedule week mismatch');
  for (const snapshot of [salary, projection]) if (timestamp(snapshot.fetched_at) > asOf || asOf - timestamp(snapshot.fetched_at) > 24 * 3600000) throw Error('Snapshot is stale or from the future; refresh inputs');
  if (projection.scoring_basis !== 'draftkings-expected-v1-estimate') throw Error('Unsupported scoring basis');
  const games = new Set();
  for (const event of schedule.events || []) {
    if (event.week?.number !== projection.week) continue;
    for (const competition of event.competitions || []) {
      const teams = competition.competitors.map(c => team(c.team.abbreviation)).sort();
      games.add(`${teams.join('|')}|${timestamp(event.date)}`);
    }
  }
  const byId = new Map();
  for (const p of projection.records) {
    const id = p.position === 'DST' ? `team:${p.team}` : p.player_id;
    if (!id) continue;
    if (byId.has(id)) throw Error('Duplicate projection identity');
    byId.set(id, p);
  }
  const pool = [], seen = new Set(), rejected = {};
  const reject = reason => { rejected[reason] = (rejected[reason] || 0) + 1; };
  for (const s of salary.records) {
    if (s.is_disabled || ['OUT', 'O', 'IR', 'D', 'DOUBTFUL', 'SUSPENDED', 'SUSP'].includes(String(s.status).toUpperCase())) { reject('disabled_or_unavailable'); continue; }
    if (!Number.isInteger(s.salary) || s.salary <= 0 || !s.opponent || !s.game_start_time || !s.team) { reject('incomplete_salary'); continue; }
    const game = `${[s.team, s.opponent].sort().join('|')}|${timestamp(s.game_start_time)}`;
    if (!games.has(game) || timestamp(s.game_start_time) < lock) { reject('schedule_mismatch'); continue; }
    const candidate = !s.player_id && s.position !== 'DST';
    const id = s.position === 'DST' ? `team:${s.team}` : s.player_id || (allowProvisional && s.identity_status === 'name_team_position_candidate' && s.mapping_candidates?.length === 1 ? s.mapping_candidates[0] : null);
    if (!id) { reject('unresolved_identity'); continue; }
    const p = byId.get(id);
    if (!p || p.position !== s.position || p.team !== s.team || !Number.isFinite(p.projected_points)) { reject('no_matching_projection'); continue; }
    if (seen.has(id)) throw Error('Duplicate salary identity; reconcile before generating lineups');
    seen.add(id);
    const stats = p.projected_stats || {};
    pool.push({ id, draftable_id: s.draftable_id, player_name: s.player_name, position: s.position, team: s.team,
      opponent: s.opponent, home_away: s.home_away, game_start_time: s.game_start_time,
      salary: s.salary, points: p.projected_points, status: String(s.status || 'None'), provisional: candidate,
      receptions: Number(stats['53'] || 0),
      td_points: s.position === 'DST' ? 6 * Number(stats['105'] || 0) : 4 * Number(stats['4'] || 0) + 6 * (Number(stats['25'] || 0) + Number(stats['43'] || 0)),
      quality_flags: [...new Set([...(s.quality_flags || []), ...(p.quality_flags || [])])],
    });
  }
  return { pool, rejected };
}
