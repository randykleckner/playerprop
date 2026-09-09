"""Read-only, conservative news adapters. No prose generation from missing facts."""
import hashlib
import re
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlparse
from dfs.identity import normalized_name

NFL_URL = 'https://www.nfl.com/injuries/'
ESPN_URL = 'https://www.espn.com/espn/rss/nfl/news'
TEAMS = dict(zip('Cardinals Falcons Ravens Bills Panthers Bears Bengals Browns Cowboys Broncos Lions Packers Texans Colts Jaguars Chiefs Raiders Chargers Rams Dolphins Vikings Patriots Saints Giants Jets Eagles Steelers 49ers Seahawks Buccaneers Titans Commanders'.split(), 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LA MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS'.split()))
OFFENSE = {'QB','RB','WR','TE'}

def stamp(value):
    return datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(timezone.utc)

def clean(value):
    return re.sub(r'\s+', ' ', unescape(re.sub('<[^>]+>', ' ', str(value or '')))).strip()

def safe_url(value, host):
    u=urlparse(value or '')
    return u.scheme=='https' and u.hostname==host and not u.username and not u.password

def base(player, key, topic, summary, implication, source, url, at, now, evidence):
    return {'id':hashlib.sha256(key.encode()).hexdigest()[:20], 'key':key,
        'player_id':player['player_id'], 'player_name':player['display_name'],
        'team':player['current_team_id'], 'position':player['position'], 'topic':topic,
        'headline':player['display_name']+' · '+topic, 'highlight':summary,
        'impact':implication, 'impact_label':'Performance implication · interpretation',
        'source':source, 'source_url':url, 'published_at':at, 'observed_at':now,
        'expires_at':(stamp(now)+timedelta(hours=24)).isoformat(), 'evidence':evidence}

class InjuryTable(HTMLParser):
    def __init__(self):
        super().__init__();self.rows=[];self.tables=0;self.in_table=False;self.cell=None;self.row=[];self.heading=False;self.team='';self.headers=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='div' and 'd3-o-section-sub-title' in a.get('class',''):self.heading=True
        if tag=='table' and 'd3-o-reports--detailed' in a.get('class',''):
            self.in_table=True;self.tables+=1;self.headers=[]
        if self.in_table and tag=='tr':self.row=[]
        if self.in_table and tag in ('td','th'):self.cell=[];self.is_header=tag=='th'
    def handle_data(self, data):
        if self.heading and data.strip():self.team=TEAMS.get(data.strip(),'')
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self, tag):
        if tag=='div':self.heading=False
        if tag in ('td','th') and self.cell is not None:
            value=clean(' '.join(self.cell));self.row.append(value)
            if self.is_header:self.headers.append(value)
            self.cell=None
        if tag=='tr' and self.in_table and self.row and self.headers!=self.row:
            if self.headers!=['Player','Position','Injuries','Practice Status','Game Status'] or len(self.row)!=5 or not self.team:raise ValueError('NFL injury table changed')
            self.rows.append((self.team,self.row))
        if tag=='table':self.in_table=False

def injuries(html, players, now):
    # The year/week must be explicit; never relabel an old report as current.
    title=re.search(r'<title>(.*?)</title>',html,re.S)
    cohort=re.search(r'Week (\d+) of the (\d{4}) Season',clean(title.group(1)) if title else '')
    if not cohort or int(cohort[2])!=stamp(now).year:raise ValueError('NFL injury season unavailable or old')
    parser=InjuryTable();parser.feed(html)
    if not parser.tables:raise ValueError('NFL injury tables unavailable')
    result=[];unmatched=0;covered=[]
    for tm,row in parser.rows:
        name,pos,injury,practice,status=row
        candidates=[p for p in players if normalized_name(p['display_name'])==normalized_name(name) and p['current_team_id']==tm and p['position']==pos]
        if len(candidates)!=1:unmatched+=1;continue
        covered.append(candidates[0]['player_id'])
        if not status and (not injury or practice=='Full Participation in Practice'):continue
        if status not in ('','Out','Doubtful','Questionable'):raise ValueError('Unknown NFL game status')
        if practice not in ('','Full Participation in Practice','Limited Participation in Practice','Did Not Participate In Practice'):raise ValueError('Unknown NFL practice status')
        p=candidates[0]
        if pos not in OFFENSE:continue  # no guessed secondary links to offensive players
        summary=f"Week {cohort[1]} report: {status or 'no game designation listed'}. {practice or 'Practice participation not listed'}."+(f' Listed issue: {injury}.' if injury else '')
        impact='Unavailable for this reported game; do not assume normal production.' if status=='Out' else 'Availability or workload needs monitoring. A practice designation alone does not establish game availability.'
        item=base(p,f'nfl:{cohort[2]}:{cohort[1]}:{p["player_id"]}','Availability',summary,impact,'NFL official injury report',NFL_URL,None,now,{'name':name,'team':tm,'position':pos,'injury':injury,'practice':practice,'game_status':status,'season':int(cohort[2]),'week':int(cohort[1])})
        item['report_week']=int(cohort[1]);result.append(item)
    return result,{'tables':parser.tables,'rows':len(parser.rows),'unmatched_rows':unmatched,'season':int(cohort[2]),'week':int(cohort[1]),'covered_player_ids':covered}

# Match a player as the subject of a concrete statement, not merely an article tag.
EVENTS=[
 ('Availability',r"(?:is |was |will be |has been )?(?:ruled out|inactive|placed on injured reserve)\b",'reported unavailable','Expected availability is affected. Check the stated game and subsequent status updates.'),
 ('Availability',r"(?:will not|won’t|won't) (?:play|travel)\b",'reported not playing or traveling','Expected availability is affected; normal workload should not be assumed.'),
 ('Availability',r"(?:is |was )?(?:questionable|doubtful)\b",'reported with an uncertain game status','Availability is uncertain; no numeric projection adjustment has been applied.'),
 ('Role',r"(?:is )?expected to start\b",'expected to start','A starting role is expected, not confirmed; workload and effectiveness remain uncertain.'),
 ('Role',r"(?:will |is set to |is going to )start\b",'reported to be starting','A starting assignment affects expected opportunity; snap share is not established by this report.'),
 ('Availability',r"(?:has |will |is )?(?:missed|miss|missing) (?:\w+ ){0,2}practice\b",'reported missing practice','Missed practice may affect availability or preparation; it does not by itself mean the player is out.'),
 ('Transaction',r"(?:has been |was |is being )traded\b",'reported traded','A team change can alter role and opportunity. Destination workload is not yet established.'),
]

def espn(payload, players, now):
    articles=payload.get('articles')
    if not isinstance(articles,list):raise ValueError('ESPN news schema changed')
    output=[];skipped=0
    for a in articles:
        if not isinstance(a,dict):raise ValueError('ESPN article schema changed')
        at=a.get('published');url=a.get('links',{}).get('web',{}).get('href','')
        try:age=(stamp(now)-stamp(at)).total_seconds()
        except (ValueError,AttributeError,TypeError):continue
        if age< -300 or age>72*3600 or not safe_url(url,'www.espn.com'):continue
        description=clean(a.get('description'))
        ids={str(c.get('athleteId')) for c in a.get('categories',[]) if c.get('type')=='athlete'}
        for external in ids:
            candidates=[p for p in players if str(p.get('espn_id'))==external and p['position'] in OFFENSE]
            if len(candidates)!=1:continue
            p=candidates[0]
            # Names may have apostrophes/suffixes: prefer the provider's exact category name with the same ID.
            names={p['display_name']}|{c.get('description','') for c in a.get('categories',[]) if str(c.get('athleteId'))==external}
            matched=None
            for name in names:
                if not name:continue
                for topic,pattern,label,impact in EVENTS:
                    m=re.search(r'\b'+re.escape(name)+r'\s+('+pattern+r')',description,re.I)
                    if m:matched=(topic,label,impact,m.group(0));break
                if matched:break
            if not matched:skipped+=1;continue
            topic,label,impact,evidence=matched
            item=base(p,f'espn:{a.get("id")}:{p["player_id"]}',topic,f'{p["display_name"]} is {label}. Read the source for game-specific context.',impact,'ESPN',url,at,now,{'espn_id':external,'matched_statement':evidence,'article_id':a.get('id')})
            item['expires_at']=min(stamp(now)+timedelta(hours=24),stamp(at)+timedelta(hours=72)).isoformat()
            output.append(item)
    return list({s['key']:s for s in output}.values()),{'articles':len(articles),'unclassified_player_mentions':skipped}

def rss(xml,players,now):
    """ESPN's published RSS feed; full-name matches must be unique in canonical data."""
    import xml.etree.ElementTree as ET
    from email.utils import parsedate_to_datetime
    root=ET.fromstring(xml)
    if root.tag!='rss' or root.find('channel') is None:raise ValueError('ESPN RSS schema changed')
    articles=[]
    for item in root.findall('./channel/item'):
        description=clean(item.findtext('description'))
        categories=[]
        for p in players:
            if p.get('espn_id') and re.search(r'\b'+re.escape(p['display_name'])+r'\b',description,re.I):
                same=[q for q in players if normalized_name(q['display_name'])==normalized_name(p['display_name'])]
                if len(same)==1:categories.append({'type':'athlete','athleteId':p['espn_id'],'description':p['display_name']})
        try:published=parsedate_to_datetime(item.findtext('pubDate')).isoformat()
        except (ValueError,TypeError):continue
        url=item.findtext('link') or ''
        articles.append({'id':hashlib.sha256(url.encode()).hexdigest()[:16],'description':description,'published':published,'links':{'web':{'href':url}},'categories':categories})
    stories,counts=espn({'articles':articles},players,now)
    for s in stories:s['evidence']['identity_method']='Unique full name in RSS excerpt → NFLverse canonical ID and ESPN crosswalk; RSS has no provider athlete ID'
    counts['future_dated_items']=sum(stamp(a['published'])>stamp(now)+timedelta(minutes=5) for a in articles)
    return stories,counts
