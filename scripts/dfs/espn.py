"""Unofficial public ESPN weekly projections, isolated from salary and sportsbook feeds.

Raw IDs checked against espn-api/football/constant.py; DK rates against DraftKings
Network's NFL DFS scoring guide. Source and approximation details are in docs.
"""
from collections import defaultdict
import math

from .providers import ProviderError
from .providers import iso, utc_now
from .projections import ProjectionSnapshot

BASIS = 'draftkings-expected-v1-estimate'
POSITIONS = {1:'QB',2:'RB',3:'WR',4:'TE',16:'DST'}
TEAMS = dict(zip([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,33,34],
    ['ATL','BUF','CHI','CIN','CLE','DAL','DEN','DET','GB','TEN','IND','KC','LV','LA','MIA','MIN','NE','NO','NYG','NYJ','PHI','ARI','PIT','LAC','SF','SEA','TB','WAS','CAR','JAX','BAL','HOU']))


def dk_estimate(stats: dict, position: str) -> dict:
    if not stats:
        raise ProviderError('Missing weekly projected stats is not a zero-point projection')
    if any(type(v) not in (float,int) or not math.isfinite(v) for v in stats.values()):
        raise ProviderError('Invalid ESPN projected statistic')
    def v(key):return stats.get(str(key),0.0)
    flags=['sparse_stat_omissions_assumed_zero','rare_scoring_events_not_fully_covered']
    if position=='DST':
        required=[89,90,91,92,121,122,123,124,125,95,96,97,98,99,105]
        if any(str(key) not in stats for key in required):
            raise ProviderError('Missing DST event/points-allowed projections')
        probabilities=[v(k) for k in [89,90,91,92,121,122,123,124,125]]
        if any(p<0 or p>1 for p in probabilities) or abs(sum(probabilities)-1)>0.02:
            raise ProviderError('Invalid DST points-allowed probability distribution')
        events=v(99)+2*(v(95)+v(96)+v(97)+v(98))+6*v(105)
        pa=10*v(89)+7*v(90)+4*v(91)+v(92)-v(123)-4*(v(124)+v(125))
        # ESPN's 18–21 bucket crosses DK's 20/21 boundary. Do not claim exact conversion.
        lower,upper=events+pa,events+pa+v(121)
        points=(lower+upper)/2
        flags.append('dst_18_to_21_bucket_midpoint_assumption')
        components={'defensive_events':events,'points_allowed_lower':pa,'points_allowed_upper':pa+v(121)}
    else:
        linear=.04*v(3)+4*v(4)-v(20)+.1*v(24)+6*v(25)+.1*v(42)+6*v(43)+v(53)-v(72)
        conversions=2*(v(62) if '62' in stats else v(19)+v(26)+v(44))
        rare=6*(v(63)+v(101)+v(102))
        # Use expected threshold-event counts, not a bonus on the mean yardage.
        bonus=0
        for first,second in [(17,18),(37,38),(56,57)]:
            probability=v(first)+v(second)
            if not -0.000001<=probability<=1.000001:
                raise ProviderError('Invalid projected yardage bonus probability')
            if probability<0 or probability>1:
                flags.append('bonus_probability_roundoff_clamped')
            probability=min(1,max(0,probability))
            bonus+=3*probability
        points=linear+conversions+rare+bonus
        lower=upper=points
        components={'linear_points':linear,'two_point_conversions':conversions,'available_return_recovery_tds':rare,'expected_yardage_bonuses':bonus}
    return {'projected_points':points,'conversion_lower':lower,'conversion_upper':upper,
            'components':components,'quality_flags':flags}


def parse_espn(payload: dict, season: int, week: int, fetched_at: str, canonical: list[dict]) -> ProjectionSnapshot:
    if not isinstance(payload,dict) or not isinstance(payload.get('players'),list):
        raise ProviderError('ESPN player response schema changed')
    by_espn=defaultdict(set)
    for p in canonical:
        if p.get('espn_id'):
            by_espn[str(p['espn_id'])].add(p['player_id'])
    positions={p['player_id']:p.get('position') for p in canonical}
    records=[];seen=set()
    for entry in payload['players']:
        p=entry.get('player') if isinstance(entry,dict) else None
        if not isinstance(p,dict):raise ProviderError('ESPN player wrapper changed')
        position=POSITIONS.get(p.get('defaultPositionId'))
        if not position:continue
        matches=[s for s in p.get('stats',[]) if s.get('seasonId')==season and s.get('scoringPeriodId')==week
            and s.get('statSourceId')==1 and s.get('statSplitTypeId')==1]
        if len(matches)>1:raise ProviderError('Ambiguous ESPN weekly projection rows')
        if not matches or not matches[0].get('stats'):continue
        espn_id=str(p['id'])
        if espn_id in seen:raise ProviderError('Duplicate ESPN projected player')
        seen.add(espn_id)
        row={'source_player_id':espn_id,'player_name':p.get('fullName'),'position':position,
             'team':TEAMS.get(p.get('proTeamId')),'player_id':None,'source_native_points':matches[0].get('appliedTotal'),
             'projected_stats':matches[0]['stats']}
        row.update(dk_estimate(matches[0]['stats'],position))
        candidates=by_espn[espn_id]
        if len(candidates)==1 and positions[next(iter(candidates))]==position:
            row['player_id']=next(iter(candidates))
            row['identity_status']='stable_espn_id'
        elif position=='DST' and row['team']:
            row['identity_status']='team_identity'
        else:
            row['identity_status']='unresolved'
            row['quality_flags'].append('unresolved_projection_identity')
        records.append(row)
    if not records:raise ProviderError('ESPN has no usable projections for this season/week')
    return ProjectionSnapshot('espn',season,week,fetched_at,BASIS,records,payload)


class EspnProjectionProvider:
    def __init__(self,directory,canonical):
        self.directory,self.canonical=directory,canonical

    def fetch(self,season,week):
        import json,ssl,urllib.request,gzip,hashlib
        import certifi
        if type(season) is not int or not 2000<=season<=2100 or type(week) is not int or not 1<=week<=18:
            raise ProviderError('Invalid regular-season projection season/week')
        self.directory.mkdir(parents=True,exist_ok=True)
        cache=self.directory/f'espn-{season}-{week}.json'
        observation=json.loads(cache.read_text()) if cache.exists() else None
        if not observation or (iso(utc_now())-iso(observation['fetched_at'])).total_seconds()>=21600:
            url=f'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId={week}'
            headers={'Accept':'application/json','User-Agent':'playerprop-projection-reader/1.0 (anonymous weekly research)',
                     'X-Fantasy-Filter':json.dumps({'players':{'limit':2000,'sortPercOwned':{'sortPriority':1,'sortAsc':False}}})}
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self,*args,**kwargs):return None
            opener=urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())))
            try:
                with opener.open(urllib.request.Request(url,headers=headers),timeout=30) as response:
                    raw=response.read(32*1024*1024+1)
                if len(raw)>32*1024*1024:raise ProviderError('ESPN response exceeds 32 MiB')
                payload=json.loads(raw)
                if not isinstance(payload,dict) or not isinstance(payload.get('players'),list) or len(payload['players'])>=2000:
                    raise ProviderError('ESPN response missing players or possibly truncated at 2000')
                observation={'url':url,'fetched_at':utc_now(),'payload':payload}
                # Validate before replacing the last good observation.
                parse_espn(payload,season,week,observation['fetched_at'],self.canonical)
                digest=hashlib.sha256(raw).hexdigest()
                archive=self.directory/(digest+'.json.gz')
                if not archive.exists():
                    with archive.open('xb') as file:file.write(gzip.compress(raw,mtime=0))
                temporary=cache.with_suffix('.tmp');temporary.write_text(json.dumps(observation));temporary.replace(cache)
            except (OSError,ValueError) as error:
                raise ProviderError(f'ESPN projection fetch failed: {type(error).__name__}; prior snapshots preserved') from error
        return parse_espn(observation['payload'],season,week,observation['fetched_at'],self.canonical)
