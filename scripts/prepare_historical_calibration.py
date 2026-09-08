#!/usr/bin/env python3
"""Retrospective same-team last-five inputs; never an archived pregame ESPN replay."""
import csv,json,hashlib,argparse
from collections import defaultdict,Counter
from datetime import date
from pathlib import Path

FIELDS=['attempts','completions','passing_yards','passing_tds','passing_interceptions','carries','rushing_yards','rushing_tds','targets','receptions','receiving_yards','receiving_tds','fumbles_lost_total']
def normalize(row):
    if row['position'] not in ['QB','RB','WR','TE'] or row['season_type']!='REG':return None
    result=dict(row)
    for k in FIELDS:
        if row.get(k) in ('',None):raise ValueError('Missing actual statistic: '+k)
        result[k]=float(row[k])
    result['core_points']=.04*result['passing_yards']+4*result['passing_tds']-result['passing_interceptions']+.1*(result['rushing_yards']+result['receiving_yards'])+6*(result['rushing_tds']+result['receiving_tds'])+result['receptions']-result['fumbles_lost_total']+3*sum(result[k]>=threshold for k,threshold in [('passing_yards',300),('rushing_yards',100),('receiving_yards',100)])
    return result

def prepare(stats,schedule):
    by_game=defaultdict(dict);excluded=Counter();seen=set()
    for raw in stats:
        row=normalize(raw)
        if not row:continue
        key=(row['player_id'],row['game_id'])
        if key in seen:raise ValueError('Duplicate actual player/game')
        seen.add(key);by_game[row['game_id']][row['player_id']]=row
    history=defaultdict(list);output=[]
    for game in sorted(schedule,key=lambda g:(g['gameday'],g['game_id'])):
        if game['game_type']!='REG' or game['season'] not in ['2024','2025']:continue
        if game['away_score']=='' or game['home_score']=='':continue
        gid=game['game_id'];rows=by_game[gid];players=[]
        latest={}
        for (pid,season,t,pos),past in history.items():
            if season==game['season']:latest[pid]=max(latest.get(pid,''),past[-1]['_date'])
        for (pid,season,t,pos),past in history.items():
            if season!=game['season'] or t not in [game['home_team'],game['away_team']] or len(past)<5:continue
            if past[-1]['_date']!=latest[pid]:continue
            sample=past[-5:]
            if sample[-1]['_date']>=game['gameday']:raise ValueError('Historical leakage')
            if (date.fromisoformat(game['gameday'])-date.fromisoformat(sample[-1]['_date'])).days>28:continue
            avg=lambda k:sum(r[k] for r in sample)/5
            ratio=lambda a,b,f:avg(a)/avg(b) if avg(b)>0 else f
            opponent=game['away_team'] if t==game['home_team'] else game['home_team']
            players.append({'player_id':pid,'player_name':sample[-1]['player_display_name'],'position':pos,'team':t,'opponent':opponent,'game_id':gid,'salary':1,'active':True,'identity_status':'nflverse_gsis','identity_confidence':'verified','final_projection':avg('core_points'),'quality_flags':['reconstructed_prior_five','no_historical_salary','availability_not_observed'],
                'inputs':{'pass_attempts':avg('attempts'),'completion_probability':min(1,ratio('completions','attempts',.65)),'passing_efficiency':max(0,ratio('passing_yards','attempts',7)),'targets':avg('targets'),'carries':avg('carries'),'catch_probability':min(1,ratio('receptions','targets',.65)),'receiving_efficiency':max(0,ratio('receiving_yards','receptions',11)),'rushing_efficiency':max(0,ratio('rushing_yards','carries',4.2)),'passing_touchdowns':avg('passing_tds'),'receiving_td_weight':ratio('receiving_tds','receptions',.06),'rushing_td_weight':ratio('rushing_tds','carries',.03),'interceptions':avg('passing_interceptions'),'fumble_rate':avg('fumbles_lost_total')/max(1,avg('attempts')+avg('carries')+avg('receptions'))},'prior_game_ids':[r['game_id'] for r in sample]})
        # No current game stat is used to select simulated players or workload inputs.
        if all(any(p['team']==t and p['position']=='QB' for p in players) for t in [game['home_team'],game['away_team']]):
            actuals={}
            for p in players:
                r=rows.get(p['player_id'])
                if not r or r['attempts']+r['targets']+r['carries']<=0:excluded['missing_or_no_offensive_opportunity']+=1;continue
                actuals[p['player_id']]=r['core_points']
            output.append({'split':'training' if game['season']=='2024' else 'evaluation','game_date':game['gameday'],'actuals':actuals,'input':{'slate_id':'historical-'+gid,'games':[{'game_id':gid,'home':game['home_team'],'away':game['away_team'],'start_time':game['gameday']+'T00:00:00Z','total':44,'home_spread':0}],'players':players,'sources':{'projection':'prior five same-team games, reconstructed from current final-stat release'},'assumptions':['No historical salaries or archived ESPN/market/availability inputs. Core offensive scoring only.'], 'coverage':{'eligible':len(players)}}})
        else:excluded['insufficient_prior_QB_history_games']+=1
        for row in rows.values():
            if row['attempts']+row['targets']+row['carries']>0:history[(row['player_id'],row['season'],row['team'],row['position'])].append(dict(row,_date=game['gameday']))
    return {'kind':'retrospective_reconstructed_core_scoring_diagnostic','games':output,'exclusions':dict(excluded)}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--stats',action='append',required=True);p.add_argument('--schedule',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    data=prepare([r for path in a.stats for r in csv.DictReader(open(path))],list(csv.DictReader(open(a.schedule))))
    data['source_hashes']={Path(path).name:hashlib.sha256(Path(path).read_bytes()).hexdigest() for path in a.stats+[a.schedule]};Path(a.output).write_text(json.dumps(data));print(json.dumps({'games':len(data['games']),'exclusions':data['exclusions']}))
