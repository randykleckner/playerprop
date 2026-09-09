import json,sqlite3
from pathlib import Path
COLUMNS={'throw_power':'throwPower','short_accuracy':'throwAccuracyShort','medium_accuracy':'throwAccuracyMid','deep_accuracy':'throwAccuracyDeep','under_pressure':'throwUnderPressure','awareness':'awareness','speed':'speed','acceleration':'acceleration','strength':'strength','carrying':'carrying','catching':'catching','pass_block':'passBlock','pass_block_power':'passBlockPower','pass_block_finesse':'passBlockFinesse','run_block':'runBlock','run_block_power':'runBlockPower','run_block_finesse':'runBlockFinesse','impact_blocking':'impactBlocking','power_moves':'powerMoves','finesse_moves':'finesseMoves','block_shedding':'blockShedding','pursuit':'pursuit','tackling':'tackle','play_recognition':'playRecognition','man_coverage':'manCoverage','zone_coverage':'zoneCoverage','press':'press'}
def persist(path,snapshot,migration):
 with sqlite3.connect(path) as db:
  db.execute('PRAGMA foreign_keys=ON');db.executescript(Path(migration).read_text())
  if db.execute('SELECT 1 FROM personnel_rating_snapshots WHERE id=?',(snapshot['snapshot_id'],)).fetchone():return False
  db.execute('INSERT INTO personnel_rating_snapshots VALUES (?,?,?,?,?,?,?,?,?)',(snapshot['snapshot_id'],snapshot['provider'],snapshot['game_title'],snapshot['captured_at'],snapshot['source_version'],len(snapshot['players']),snapshot['roster_at'],snapshot['depth_at'],json.dumps(snapshot['sources'])))
  names=['snapshot_id','external_player_id','canonical_player_id','name','team','position','overall','mapping_status','mapping_confidence',*COLUMNS,'attributes_json','evidence_json']
  for p in snapshot['players']:
   values=[snapshot['snapshot_id'],*[p.get(k) for k in names[1:9]],*[p['attributes'].get(k) for k in COLUMNS.values()],json.dumps(p['attributes']),json.dumps(p['mapping_evidence'])]
   db.execute('INSERT INTO personnel_player_ratings ('+','.join(names)+') VALUES ('+','.join('?' for _ in names)+')',values)
 return True
