"""Point-in-time research enrichment. Identity corroboration is not DK verification."""
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
import math
import re
import unicodedata


def timestamp(value):
    result=datetime.fromisoformat(value.replace('Z','+00:00'))
    if result.tzinfo is None: raise ValueError('Timezone required')
    return result


def team(value):
    return {'JAC':'JAX','LAR':'LA','WSH':'WAS'}.get(value,value)


def name(value):
    value=unicodedata.normalize('NFKD',value or '').encode('ascii','ignore').decode().lower()
    words=re.sub(r'[^a-z0-9 ]','',value).split()
    if words and words[-1] in {'jr','sr','ii','iii','iv'}:words.pop()
    return ' '.join(words)


def markets(scoreboard, games, captured_at, season, week):
    if scoreboard.get('season',{}).get('year')!=season or scoreboard.get('week',{}).get('number')!=week:
        raise ValueError('Market season/week mismatch')
    observations,issues=[],[]
    for game in games:
        matches=[]
        for event in scoreboard.get('events',[]):
            for competition in event.get('competitions',[]):
                teams={c.get('homeAway'):team(c.get('team',{}).get('abbreviation')) for c in competition.get('competitors',[])}
                if teams=={'home':game['home'],'away':game['away']} and timestamp(event['date'])==timestamp(game['start_time']):matches.append((event,competition))
        if len(matches)!=1:issues.append({'game_id':game['game_id'],'reason':'missing_or_ambiguous_game'});continue
        event,competition=matches[0]
        if timestamp(captured_at)>=timestamp(event['date']) or event.get('status',{}).get('type',{}).get('state')!='pre':
            issues.append({'game_id':game['game_id'],'reason':'not_pregame'});continue
        quotes=competition.get('odds',[])
        quotes=sorted(quotes,key=lambda o:(o.get('provider',{}).get('name')!='DraftKings',str(o.get('provider',{}).get('id',''))))
        chosen=None
        for quote in quotes:
            total=quote.get('overUnder')
            # Read the home-side line, never infer sign from the favored team's name.
            raw=quote.get('pointSpread',{}).get('home',{}).get('close',{}).get('line')
            try: spread=float(raw);total=float(total)
            except (TypeError,ValueError):continue
            if not math.isfinite(total) or not 10<=total<=100 or not math.isfinite(spread) or abs(spread)>50 or total<abs(spread):continue
            chosen={'game_id':game['game_id'],'total':total,'home_spread':spread,'home_implied_total':(total-spread)/2,'away_implied_total':(total+spread)/2,'sportsbook':quote.get('provider',{}).get('name','Unknown'),'source':'ESPN public scoreboard odds','captured_at':captured_at,'event_id':event['id']};break
        if chosen:observations.append(chosen)
        else:issues.append({'game_id':game['game_id'],'reason':'missing_valid_total_or_home_line'})
    return observations,issues


def audit_identities(players, crosswalk, catalog):
    cross=defaultdict(list)
    for row in crosswalk:
        if row.get('gsis_id'):cross[row['gsis_id']].append(row)
    canonical={p['player_id']:p for p in catalog}
    report=[]
    for p in players:
        if p['position']=='DST':continue
        c=canonical.get(p['player_id']);matches=cross[p['player_id']]
        reasons=[]
        if not c:reasons.append('missing_catalog_id')
        if c and (c['position']!=p['position'] or name(c['display_name'])!=name(p['player_name'])):reasons.append('catalog_identity_conflict')
        if len(matches)!=1:reasons.append('missing_or_ambiguous_crosswalk')
        if len(matches)==1:
            r=matches[0]
            if name(r['name'])!=name(p['player_name']) or r['position']!=p['position']:reasons.append('crosswalk_identity_conflict')
            if c and c.get('espn_id') and r.get('espn_id') and str(c['espn_id'])!=r['espn_id']:reasons.append('espn_id_conflict')
            if team(r.get('team'))!=p['team']:reasons.append('crosswalk_team_mismatch')
        report.append({'player_id':p['player_id'],'player_name':p['player_name'],'status':'corroborated_provisional' if not reasons else 'review_required','reasons':reasons,'verified_draftkings_id':False,'evidence':{'gsis_id':p['player_id'],'catalog_espn_id':c.get('espn_id') if c else None,'crosswalk_espn_ids':sorted({r['espn_id'] for r in matches if r.get('espn_id')})}})
    return report


def usage_context(players, snaps, catalog, season):
    pfr=defaultdict(set)
    for c in catalog:
        if c.get('pfr_id'):pfr[c['pfr_id']].add(c['player_id'])
    history=defaultdict(list);seen=set()
    for row in snaps:
        if int(row['season'])>=season or row.get('game_type')!='REG':continue
        ids=pfr.get(row.get('pfr_player_id'),set())
        if len(ids)!=1:continue
        player_id=next(iter(ids));key=(player_id,row['game_id'])
        if key in seen:raise ValueError('Duplicate historical snap observation')
        seen.add(key)
        try:share=float(row['offense_pct'])
        except (TypeError,ValueError):continue
        if not math.isfinite(share) or not 0<=share<=1:continue
        history[player_id].append({'season':int(row['season']),'week':int(row['week']),'team':team(row['team']),'game_id':row['game_id'],'snap_share':share})
    result={}
    for p in players:
        values=sorted(history[p['player_id']],key=lambda r:(r['season'],r['week']),reverse=True)[:5]
        if values:result[p['player_id']]={'kind':'historical_context_not_projection','games':values,'mean_snap_share':sum(r['snap_share'] for r in values)/len(values),'same_team':all(r['team']==p['team'] for r in values),'source':'NFLverse / PFR snap counts'}
    return result


def enrich(input, scoreboard, crosswalk, snaps, catalog, captured_at):
    output=deepcopy(input)
    quotes,issues=markets(scoreboard,input['games'],captured_at,input['season'],input['week'])
    audit=audit_identities(input['players'],crosswalk,catalog)
    usage=usage_context(input['players'],snaps,catalog,input['season'])
    for g in output['games']:
        quote=next((q for q in quotes if q['game_id']==g['game_id']),None)
        if quote:g.update(quote)
    for p in output['players']:
        p['identity_review']=next((r for r in audit if r['player_id']==p['player_id']),None)
        p['historical_usage']=usage.get(p['player_id'])
        if p['identity_review'] and p['identity_review']['status']=='review_required':
            p['quality_flags']=sorted(set(p['quality_flags']+['identity_evidence_review_required']))
    output['sources']['markets']={'source':'ESPN public scoreboard odds','fetched_at':captured_at,'game_count':len(quotes)}
    output['research_readiness']={'market_games':len(quotes),'total_games':len(input['games']),'corroborated_provisional':sum(r['status']=='corroborated_provisional' for r in audit),'identity_review_required':sum(r['status']=='review_required' for r in audit),'verified_dk_players':0,'historical_usage_players':len(usage),'calibration_status':'awaiting_completed_games','issues':issues}
    output['assumptions']=[a for a in output.get('assumptions',[]) if not a.startswith('Missing sportsbook totals')]+['Game markets are captured ESPN-reported sportsbook quotes; any uncovered game retains the documented fallback.','Historical snap context is prior-season evidence, not a current snap projection; team changes are flagged.','Crosswalk corroboration does not verify DraftKings IDs or production D1 membership.']
    return output,{'identity':audit,'market_issues':issues}
