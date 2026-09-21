"""ESPN league injury status adapter; IDs from provider athlete links, never fuzzy names."""
import re
from .feed import base, stamp
URL='https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries'
def parse(payload,players,now,season):
    if payload.get('season',{}).get('year')!=season or not isinstance(payload.get('injuries'),list):raise ValueError('Injury wire season/schema mismatch')
    index={}
    for p in players:
        if p.get('espn_id'):index.setdefault(str(p['espn_id']),[]).append(p)
    output=[];unmapped=0
    for team in payload['injuries']:
        for row in team.get('injuries',[]):
            a=row.get('athlete',{});url=next((l.get('href','') for l in a.get('links',[]) if re.match(r'https://www\.espn\.com/nfl/player/_/id/\d+',l.get('href',''))),'')
            match=re.search(r'/id/(\d+)',url);candidates=index.get(match[1],[]) if match else []
            if len(candidates)!=1:unmapped+=1;continue
            p=candidates[0];provider_team=a.get('team',{}).get('abbreviation','').replace('LAR','LA')
            if provider_team!=p['current_team_id']:unmapped+=1;continue
            status=row.get('status');detail=row.get('details',{});at=row.get('date')
            if not status:continue
            try:
                if stamp(at)>stamp(now):continue
            except (ValueError,TypeError,AttributeError):continue
            injury=' · '.join(str(detail[k]) for k in ['type','detail'] if detail.get(k)) or 'Injury details not provided'
            returning=detail.get('returnDate');returning=returning if isinstance(returning,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',returning) else None
            summary=f'{status}: {injury}.'
            item=base(p,f'espn-injury:{match[1]}:{at}:{status}', 'Availability',summary,'Availability may change expected workload. No automatic projection adjustment is made.','ESPN injury wire',url,at,now,{'game_status':status,'injury':injury,'return_estimate':returning,'return_label':'Provider estimate — not confirmed clearance','espn_id':match[1]})
            item['return_summary']=f'Estimated return: {returning}. Not confirmed; practice and gameday clearance may change this.' if returning else 'Return date not reported.'
            output.append(item)
    if not output:raise ValueError('No mapped injury records; preserve previous coverage')
    return output,{'mapped':len(output),'unmapped':unmapped}
