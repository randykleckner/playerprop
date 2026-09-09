"""Fit 2024 only; reserve 2025 for chronological held-out diagnostics. Offline."""
import csv,gzip,json,hashlib,statistics
from collections import Counter,defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def num(r,k):
 try:return float(r[k])
 except (KeyError,TypeError,ValueError):return None

def context(q,clock,margin):return 'trail' if q==4 and clock<=300 and margin<0 else 'lead' if q==4 and clock<=300 and margin>0 else 'normal'
def key(r):
 d=num(r,'ydstogo');return f"{int(num(r,'down'))}|{'short' if d<=3 else 'medium' if d<=7 else 'long'}|{context(num(r,'qtr'),num(r,'quarter_seconds_remaining'),num(r,'score_differential'))}"
def eligible(r):return r.get('season_type')=='REG' and r.get('play_type') in ('run','pass') and num(r,'qtr') in (1,2,3,4) and num(r,'down') in (1,2,3,4) and all(num(r,k) is not None for k in ['ydstogo','quarter_seconds_remaining','score_differential','yards_gained','sack','interception','complete_pass','fumble_lost']) and num(r,'penalty')==0 and num(r,'qb_kneel')==0 and num(r,'qb_spike')==0

def fit(rows):
 calls=defaultdict(Counter);hist=defaultdict(Counter);pace=defaultdict(list);teams=defaultdict(lambda:defaultdict(float));prev=None;n=0
 for r in rows:
  good=eligible(r)
  if good:
   n+=1;typ=r['play_type'];calls[key(r)][typ]+=1;calls['all'][typ]+=1;t=teams[r['posteam']];t['plays']+=1;t[typ]+=1;y=num(r,'yards_gained');result='run' if typ=='run' else 'complete' if num(r,'complete_pass')==1 else 'sack' if num(r,'sack')==1 else None
   if result in ('run','complete') and num(r,'fumble_lost')==0:
    hist[result][int(y)]+=1
   if typ=='run':t['rushYards']+=y;t['fumbles']+=num(r,'fumble_lost')
   else:
    t['sacks']+=num(r,'sack');t['attempts']+=1-num(r,'sack');t['ints']+=num(r,'interception');t['completions']+=num(r,'complete_pass')
    if num(r,'complete_pass')==1:t['passYards']+=y
   if prev and eligible(prev) and prev['game_id']==r['game_id'] and prev['drive']==r['drive'] and prev['posteam']==r['posteam'] and prev['qtr']==r['qtr'] and (prev['play_type']=='run' or num(prev,'complete_pass')==1 or num(prev,'sack')==1) and num(prev,'out_of_bounds')==0 and num(prev,'touchdown')==0 and num(prev,'fumble_lost')==0:
    delta=num(prev,'quarter_seconds_remaining')-num(r,'quarter_seconds_remaining')
    if 6<=delta<=46:pace[context(num(prev,'qtr'),num(prev,'quarter_seconds_remaining'),num(prev,'score_differential'))].append(delta-6)
  prev=r
 if not n:raise ValueError('No eligible plays')
 base=calls['all']['pass']/sum(calls['all'].values());rates={}
 for k,c in calls.items():rates[k]={'count':sum(c.values()),'probability':(c['pass']+50*base)/(sum(c.values())+50)}
 team_inputs={}
 for tm,t in teams.items():team_inputs[tm]={'passRate':t['pass']/t['plays'],'completionRate':t['completions']/t['attempts'],'sackRate':t['sacks']/t['pass'],'interceptionRate':t['ints']/t['attempts'],'fumbleRate':t['fumbles']/t['run'],'runMean':t['rushYards']/t['run'],'completionMean':t['passYards']/t['completions']}
 return {'version':'V2.0-B-experimental','trainingSeason':2024,'baselinePassRate':base,'calls':rates,'yards':{k:sorted(v.items()) for k,v in hist.items()},'pace':{k:{'count':len(v),'seconds':statistics.median(v)} for k,v in pace.items()},'trainingPlays':n,'teamInputs':team_inputs,'teamSampleSizes':{tm:t['plays'] for tm,t in teams.items()}}

def main():
 paths=[ROOT/f'.dfs-calibration/pbp-{s}.csv.gz' for s in [2024,2025]]
 with gzip.open(paths[0],'rt') as f:profile=fit(csv.DictReader(f))
 profile['sources']=[{'season':2024,'url':'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2024.csv.gz','sha256':hashlib.sha256(paths[0].read_bytes()).hexdigest()}]
 profile['profileId']=hashlib.sha256(json.dumps(profile,sort_keys=True).encode()).hexdigest()
 out=ROOT/'public/drive-lab';out.mkdir(exist_ok=True);(out/'empirical.json').write_text(json.dumps(profile)+'\n')
 cases=[];games={};ot=set()
 with gzip.open(paths[1],'rt') as f:
  for r in csv.DictReader(f):
   if r.get('season_type')!='REG':continue
   if num(r,'qtr')==5:ot.add(r['game_id'])
   if not eligible(r):continue
   tm=r['posteam'];baseline=profile['teamInputs'][tm]['passRate'];long=num(r,'ydstogo')>=8;late=context(num(r,'qtr'),num(r,'quarter_seconds_remaining'),num(r,'score_differential'))
   a=max(.05,min(.95,baseline+(.1 if long else 0)+(.08 if num(r,'down')>=3 else 0)+(.12 if late=='trail' else -.15 if late=='lead' else 0)))
   b=max(.05,min(.95,profile['calls'].get(key(r),profile['calls']['all'])['probability']+baseline-profile['baselinePassRate']))
   cases.append((a,b,int(r['play_type']=='pass')))
   g=games.setdefault(r['game_id'],{'gameId':r['game_id'],'homeTeam':r['home_team'],'awayTeam':r['away_team'],'inputsTimestamp':'2025-03-01T00:00:00Z','actual':{'plays':0,'passAttempts':0,'rushAttempts':0,'yards':0,'turnovers':0},'actualHome':num(r,'total_home_score'),'actualAway':num(r,'total_away_score')})
   g['actualHome']=num(r,'total_home_score');g['actualAway']=num(r,'total_away_score');x=g['actual'];x['plays']+=1;x['passAttempts']+=int(r['play_type']=='pass' and num(r,'sack')==0);x['rushAttempts']+=int(r['play_type']=='run');x['yards']+=num(r,'yards_gained');x['turnovers']+=num(r,'interception')+num(r,'fumble_lost')
 # Final scores must come from completed schedule records, not the last eligible scrimmage row.
 with (ROOT/'.dfs-calibration/games.csv').open() as f:schedule={r['game_id']:r for r in csv.DictReader(f) if r['season']=='2025' and r['game_type']=='REG'}
 holdout=[]
 for gid,g in games.items():
  if gid in ot or gid not in schedule:continue
  actual=schedule[gid]
  if not actual['home_score'] or not actual['away_score']:continue
  g['actualHome']=float(actual['home_score']);g['actualAway']=float(actual['away_score'])
  g['homeTeamInputs']=profile['teamInputs'][g['homeTeam']];g['awayTeamInputs']=profile['teamInputs'][g['awayTeam']];holdout.append(g)
 report={'status':'held-out exploratory diagnostics; not production calibration','trainingSeason':2024,'evaluationSeason':2025,'evaluationSha256':hashlib.sha256(paths[1].read_bytes()).hexdigest(),'scheduleSha256':hashlib.sha256((ROOT/'.dfs-calibration/games.csv').read_bytes()).hexdigest(),'playCases':len(cases),'brierA':sum((a-y)**2 for a,b,y in cases)/len(cases),'brierB':sum((b-y)**2 for a,b,y in cases)/len(cases),'gameCases':len(holdout),'excludedOvertimeGames':len(ot),'profileId':profile['profileId']}
 (ROOT/'.dfs-calibration/v2-holdout.json').write_text(json.dumps(holdout));(ROOT/'docs/simulation-v2-b-evaluation.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
if __name__=='__main__':main()
