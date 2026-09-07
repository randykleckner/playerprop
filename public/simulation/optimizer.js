// Exact salary-grid dynamic programming; no external solver or live requests.
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DST'];
const BASE = { QB: 1, RB: 2, WR: 3, TE: 1, DST: 1 };
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const total = (rows, field) => rows.reduce((sum, row) => sum + row[field], 0);

export function optimize(pool, { score = p => p.points, required = [], excluded = [], cap = 50000 } = {}) {
  if (!Number.isInteger(cap) || cap <= 0) throw Error('Invalid salary cap');
  const ids = new Set();
  for (const p of pool) {
    if (!p.id || ids.has(p.id)) throw Error('Duplicate or missing player identity');
    ids.add(p.id);
    if (!POSITIONS.includes(p.position) || !Number.isInteger(p.salary) || p.salary <= 0 || !Number.isFinite(score(p)) || !p.team) throw Error('Invalid optimizer player');
  }
  if (new Set(required).size !== required.length || required.some(id => !ids.has(id) || excluded.includes(id))) throw Error('Invalid required players');
  const fixed = pool.filter(p => required.includes(p.id));
  const available = pool.filter(p => !required.includes(p.id) && !excluded.includes(p.id));
  const budget = cap - total(fixed, 'salary');
  if (budget < 0) return null;
  const unit = pool.reduce((n, p) => gcd(n, p.salary), cap);
  const limit = Math.floor(budget / unit);
  const tables = {};
  for (const position of POSITIONS) {
    const max = BASE[position] + (['RB', 'WR', 'TE'].includes(position) ? 1 : 0);
    const dp = Array.from({ length: max + 1 }, () => new Map());
    dp[0].set(0, { value: 0, rows: [] });
    for (const p of available.filter(p => p.position === position)) {
      const cost = p.salary / unit;
      for (let count = max; count >= 1; count--) {
        for (const [spent, prior] of dp[count - 1]) {
          const next = spent + cost, value = prior.value + score(p);
          if (next <= limit && (!dp[count].has(next) || value > dp[count].get(next).value)) dp[count].set(next, { value, rows: [...prior.rows, p] });
        }
      }
    }
    tables[position] = dp;
  }
  let best = null;
  for (const flex of ['RB', 'WR', 'TE']) {
    let combined = new Map([[0, { value: total(fixed.map(p => ({ value: score(p) })), 'value'), rows: fixed }]]);
    for (const pos of POSITIONS) {
      const needed = BASE[pos] + Number(pos === flex) - fixed.filter(p => p.position === pos).length;
      const choices = tables[pos][needed];
      if (!choices) { combined.clear(); break; }
      const next = new Map();
      for (const [spent, prior] of combined) for (const [cost, choice] of choices) {
        const price = spent + cost, value = prior.value + choice.value;
        if (price <= limit && (!next.has(price) || value > next.get(price).value)) next.set(price, { value, rows: [...prior.rows, ...choice.rows] });
      }
      combined = next;
    }
    for (const result of combined.values()) if (!best || result.value > best.value) best = result;
  }
  if (!best) return null;
  // Classic requires two teams. If the unconstrained optimum is one team,
  // any legal solution must contain a player outside that team. Enumerate them.
  if (new Set(best.rows.map(p => p.team)).size < 2) {
    const team = best.rows[0].team;
    let legal = null;
    for (const p of available.filter(p => p.team !== team)) {
      const result = optimize(pool, { score, required: [...required, p.id], excluded, cap });
      if (result && (!legal || result.objective > legal.objective)) legal = result;
    }
    return legal;
  }
  const rows = [], remaining = [...best.rows];
  for (const pos of POSITIONS) for (let i = 0; i < BASE[pos]; i++) {
    const index = remaining.findIndex(p => p.position === pos);
    rows.push({ ...remaining.splice(index, 1)[0], slot: pos });
  }
  rows.splice(7, 0, { ...remaining[0], slot: 'FLEX' });
  return { players: rows, salary: total(rows, 'salary'), points: total(rows, 'points'), objective: best.value };
}

export function buildLineups(pool) {
  const lineups = [];
  const signature = lineup => lineup.players.map(p => p.id).sort().join('|');
  function add(id, tier, title, explanation, options = {}) {
    const excluded = [...(options.excluded || [])];
    let result = optimize(pool, { ...options, excluded });
    // Explicitly force a changed roster if a strategy produces an existing one.
    while (result && lineups.some(prior => signature(prior) === signature(result))) {
      const change = result.players.filter(p => !(options.required || []).includes(p.id)).sort((a, b) => b.salary - a.salary)[0];
      if (!change) return;
      excluded.push(change.id);
      result = optimize(pool, { ...options, excluded });
    }
    if (result) lineups.push({ id, tier, title, explanation, ...result, excluded, required: options.required || [] });
  }
  add('projection', 'projection', 'The projection leader', 'Maximizes ESPN-derived DraftKings expected points across the eligible research pool.');
  const injuryExclusions = pool.filter(p => p.status && !['NONE', 'ACTIVE', 'HEALTHY'].includes(p.status.toUpperCase())).map(p => p.id);
  add('floor-1', 'floor', 'Less touchdown dependent', 'Discounts projected touchdown points by 50% and excludes players with reported injury designations. This is a floor proxy, not a percentile forecast.', {
    score: p => p.points - .5 * p.td_points, excluded: injuryExclusions,
  });
  add('floor-2', 'floor', 'Receiving opportunity', 'Adds 0.35 objective points per projected reception, discounts touchdown points by 25%, and excludes reported injury designations. Displayed totals remain the original mean projection.', {
    score: p => p.points - .25 * p.td_points + .35 * p.receptions, excluded: injuryExclusions,
  });
  const qbs = pool.filter(p => p.position === 'QB').sort((a, b) => b.points - a.points);
  let count = 0;
  for (const qb of qbs) {
    const receiver = pool.filter(p => p.team === qb.team && ['WR', 'TE'].includes(p.position)).sort((a, b) => b.points - a.points)[0];
    const opponent = pool.filter(p => p.team === qb.opponent && ['RB', 'WR', 'TE'].includes(p.position)).sort((a, b) => b.points - a.points)[0];
    if (!receiver || !opponent) continue;
    const before = lineups.length;
    add(`ceiling-${count + 1}`, 'ceiling', `${qb.team} game stack`, `${qb.player_name} + ${receiver.player_name}, with ${opponent.player_name} on the other side. Maximizes mean points around this fixed game stack; correlation can increase upside and shared downside.`, {
      required: [qb.id, receiver.id, opponent.id],
      excluded: pool.filter(p => p.position === 'DST' && [qb.team, qb.opponent].includes(p.team)).map(p => p.id),
    });
    if (lineups.length > before) count++;
    if (count === 3) break;
  }
  return lineups;
}
