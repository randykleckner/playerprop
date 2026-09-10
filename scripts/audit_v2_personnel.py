"""Freeze the pre-D gaps, including exact depth identities (no warning suppression)."""
import json,csv,io
from pathlib import Path
from collections import Counter
from personnel.model import roster_context,family
from dfs.catalog import load_catalog
ROOT=Path(__file__).resolve().parents[1]
def audit():
 old=json.loads((ROOT/'public/drive-lab/personnel.json').read_text());ctx=json.loads((ROOT/'.personnel'/f"{old['snapshot_id']}.json").read_text())
 canonical,_=load_catalog(ROOT/'.dfs-salaries/catalog');roster=json.loads((ROOT/'.personnel/roster.json').read_text());depth=json.loads((ROOT/'.personnel/depth.json').read_text())
 people,roles,_=roster_context(roster['body'],depth['body'],canonical,old['built_at'],roster['captured_at']);players=json.loads((ROOT/'public/drive-lab/players.json').read_text())
 byid={p['canonical_player_id']:p for p in ctx['players'] if p.get('canonical_player_id')}
 teams={}
 for tm,units in old['units'].items():
  result={};causes=Counter()
  for key in ['pass_protection','run_block','pass_rush','run_front','secondary','receiving']:
   if key=='receiving':
    ps=players['teams'].get(tm,{}).get('players',[]);missing=[{'player_id':p['player_id'],'name':p['name'],'role':p['position'],'reason':'missing Madden mapping'} for p in ps if p['shares']['normal_target']>0 and p['madden_identity'] not in ['verified','strongly_corroborated']];coverage=sum(p['shares']['normal_target'] for p in ps if p['madden_identity'] in ['verified','strongly_corroborated']);complete=coverage>=.9;rating=coverage>0
   else:
    u=units[key];complete=u['complete'];rating=u['rating'] is not None;missing=[]
    for message in u['missing']:
     role=message.split(':')[0];matches=[r for r in roles if r['team']==tm and r['role']==role]
     if not matches:missing.append({'role':role,'reason':'missing depth evidence','detail':message});continue
     for r in matches:
      person=people.get(r['player_id']);m=byid.get(r['player_id']);reason='missing roster evidence' if not person or person['team']!=tm else 'missing starter' if not person['active'] else 'missing Madden mapping' if not m or m['mapping_status'] not in ['verified','strongly_corroborated'] else 'missing attributes/depth ambiguity'
      missing.append({'player_id':r['player_id'],'name':person['name'] if person else next((x['player_name'] for x in csv.DictReader(io.StringIO(depth['body'])) if x['gsis_id']==r['player_id']),None),'role':role,'reason':reason,'detail':message,'mapping_evidence':m.get('mapping_evidence') if m else None})
   for m in missing:causes[m['reason']]+=1
   result[key]={'complete':complete,'partial':not complete and bool(rating),'disabled':not complete,'missing':missing}
  teams[tm]={'complete':sum(u['complete'] for u in result.values()),'partial':sum(u['partial'] for u in result.values()),'disabled':sum(u['disabled'] for u in result.values()),'causes':dict(causes),'units':result}
 return {'personnel_snapshot':old['snapshot_id'],'built_at':old['built_at'],'definition':'Six unit channels; partial and disabled overlap: the old model disables any incomplete unit. Receiving uses its existing 90% threshold.','teams':teams}
if __name__=='__main__':
 p=ROOT/'docs/v2-d-previous-gap-audit.json'
 if p.exists():raise SystemExit('Audit already frozen; refusing overwrite')
 a=audit();p.write_text(json.dumps(a,indent=2)+'\n');print(json.dumps({t:{k:v[k] for k in ['complete','partial','disabled','causes']} for t,v in a['teams'].items()},indent=2))
