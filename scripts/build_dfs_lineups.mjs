#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { preparePool } from './dfs-js/pool.mjs';
import { buildLineups } from './dfs-js/optimizer.mjs';

try {
  const { values } = parseArgs({ options: { salary: { type: 'string' }, projections: { type: 'string' }, schedule: { type: 'string' }, 'allow-provisional': { type: 'boolean', default: false }, output: { type: 'string', default: 'public/lineups/latest.json' } } });
  const read = path => JSON.parse(path.endsWith('.gz') ? gunzipSync(readFileSync(path)) : readFileSync(path, 'utf8'));
  if (!values.salary || !values.projections || !values.schedule) throw Error('Required: --salary snapshot.json.gz --projections snapshot.json.gz --schedule scoreboard.json [--allow-provisional]');
  const salary = read(values.salary), projection = read(values.projections), schedule = read(values.schedule);
  const generatedAt = new Date().toISOString();
  const { pool, rejected } = preparePool(salary, projection, schedule, { allowProvisional: values['allow-provisional'], now: generatedAt });
  const lineups = buildLineups(pool);
  if (lineups.length !== 6) throw Error(`Only ${lineups.length}/6 feasible lineups; review pool coverage. Existing frontend snapshot preserved.`);
  const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  const result = { version: 1, model: 'research-lineups-v1', generated_at: generatedAt,
    expires_at: new Date(Math.min(Date.parse(salary.fetched_at) + 24 * 3600000, Date.parse(projection.fetched_at) + 24 * 3600000, Date.parse(salary.slate.start_time))).toISOString(),
    season: projection.season, week: projection.week,
    slate: { draft_group_id: salary.slate.draft_group_id, start_time: salary.slate.start_time, game_count: salary.slate.game_count, format: salary.slate.format },
    source: projection.source, scoring_basis: projection.scoring_basis, source_count: 1,
    sources: { salary: { id: salary.snapshot_id, fetched_at: salary.fetched_at, sha256: hash(values.salary) }, projections: { fetched_at: projection.fetched_at, sha256: hash(values.projections) }, schedule: { sha256: hash(values.schedule), source: 'ESPN public NFL scoreboard' } },
    coverage: { salary_players: salary.records.length, eligible_players: pool.length, provisional_players: pool.filter(p => p.provisional).length, rejected },
    research_only: true, provisional_enabled: values['allow-provisional'], lineups };
  const path = resolve(values.output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', JSON.stringify(result, null, 2) + '\n');
  renameSync(path + '.tmp', path);
  console.log(JSON.stringify({ path, coverage: result.coverage, lineups: lineups.map(({ title, salary, points }) => ({ title, salary, points })) }, null, 2));
} catch (error) { console.error('Lineup generation failed:', error.message); process.exitCode = 1; }
