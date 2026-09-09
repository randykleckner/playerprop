import sys,json,tempfile,unittest,copy,sqlite3
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from personnel.provider import parse_items,Madden27RatingsProvider,atomic
from personnel.model import map_players,composite,matchup,roster_context
from personnel.storage import persist
class PersonnelTests(unittest.TestCase):
 def setUp(self):
  self.page=json.loads((ROOT/'tests/fixtures/personnel/ea.json').read_text());self.players,_=parse_items(self.page)
  self.p={'external_player_id':'ea1','name':'Test Player Jr.','team':'BUF','position':'LT','overall':80,'attributes':{'passBlock':80,'awareness':60}}
  self.r={'p1':{'player_id':'p1','name':'Test Player','team':'BUF','position':'T','aliases':['Test Player'],'active':True,'status':'ACT','roster_at':'2026-09-09T00:00:00Z'}}
  self.at='2026-09-09T12:00:00Z'
 def test_recorded_parse(self):
  self.assertEqual(len(self.players),2);self.assertIn('throwPower',self.players[0]['attributes'])
  self.page['props']['pageProps']['ratingDetails']['items'][0].pop('avatarUrl',None);self.assertEqual(len(parse_items(self.page)[0]),2)
 def test_schema_and_bounds(self):
  for mutate in [lambda p:p['props']['pageProps'].pop('ratingDetails'),lambda p:p['props']['pageProps']['gameDetails'].update(slug='madden-nfl-26'),lambda p:p['props']['pageProps']['ratingDetails']['items'][0].update(overallRating=100)]:
   p=copy.deepcopy(self.page);mutate(p)
   with self.assertRaises(ValueError):parse_items(p)
 def test_alias_team_position_and_ambiguity(self):
  map_players([self.p],self.r,[],self.at);self.assertEqual(self.p['mapping_status'],'strongly_corroborated')
  self.p['team']='KC';map_players([self.p],self.r,[],self.at);self.assertEqual(self.p['mapping_status'],'provisional')
  self.p['team']='BUF';self.r['p2']=self.r['p1']|{'player_id':'p2'};map_players([self.p],self.r,[],self.at);self.assertEqual(self.p['mapping_status'],'unresolved')
 def test_scoped_manual_override(self):
  self.p['name']='Alternate Name';o={'external_player_id':'ea1','expected_name':'Alternate Name','expected_team':'BUF','canonical_player_id':'p1','effective_from':'2026-09-01T00:00:00Z','expires_at':'2026-10-01T00:00:00Z','sources':['https://example.org/evidence'],'reviewer':'fixture'}
  map_players([self.p],self.r,[o],self.at);self.assertEqual(self.p['canonical_player_id'],'p1')
  o['expires_at']='2026-09-08T00:00:00Z';map_players([self.p],self.r,[o],self.at);self.assertEqual(self.p['mapping_status'],'unresolved')
 def test_composite_and_missing_bounds(self):
  self.p['mapping_status']='strongly_corroborated';roles=[{'player_id':'p1','role':'LT','team':'BUF'}];w={'attributes':{'passBlock':2,'awareness':1},'positions':{'LT':1}}
  u=composite('pass_protection',roles,self.r,{'p1':self.p},w);self.assertEqual(u['rating'],73.33);self.assertFalse(u['complete'])
  self.p['attributes']['passBlock']=101;self.assertIsNone(composite('pass_protection',roles,self.r,{'p1':self.p},w)['rating'])
  w['attributes']['passBlock']=0
  with self.assertRaises(ValueError):composite('pass_protection',roles,self.r,{},w)
 def test_complete_unit_and_duplicate(self):
  self.p['mapping_status']='strongly_corroborated';roles=[];ratings={};roster={}
  for i,role in enumerate(['LT','LG','C','RG','RT']):
   pid=str(i);roles.append({'player_id':pid,'role':role,'team':'BUF'});ratings[pid]=self.p;roster[pid]=self.r['p1']
  w={'attributes':{'passBlock':1},'positions':{r['role']:1 for r in roles}}
  self.assertTrue(composite('pass_protection',roles,roster,ratings,w)['complete'])
  roles[1]['player_id']='0';self.assertFalse(composite('pass_protection',roles,roster,ratings,w)['complete'])
  self.assertIsNone(matchup({'BUF':{}},'BUF','KC')[0]['difference'])
 def test_snapshot_transaction_immutability(self):
  map_players([self.p],self.r,[],self.at);s={'snapshot_id':'one','provider':'EA','game_title':'Madden NFL 27','captured_at':self.at,'source_version':'fixture','roster_at':self.at,'depth_at':self.at,'sources':{},'players':[self.p]}
  with tempfile.TemporaryDirectory() as d:
   db=Path(d)/'p.sqlite';migration=ROOT/'migrations/0009_personnel_ratings.sql'
   self.assertTrue(persist(db,s,migration));self.assertFalse(persist(db,s,migration));s['snapshot_id']='two';self.assertTrue(persist(db,s,migration))
   with sqlite3.connect(db) as c:
    self.assertEqual(c.execute('select count(*) from personnel_player_ratings').fetchone()[0],2)
    for sql in ['update personnel_player_ratings set overall=1','delete from personnel_rating_snapshots']:
     with self.assertRaises(sqlite3.IntegrityError):c.execute(sql)
 def test_cached_provider_fallback_and_duplicate(self):
  with tempfile.TemporaryDirectory() as d:
   def request(*args):return {'body':'<script id="__NEXT_DATA__">'+json.dumps(self.page)+'</script>','captured_at':self.at,'url':'fixture'}
   provider=Madden27RatingsProvider(d,request=request);first=provider.fetch();self.assertEqual(first['player_count'],2)
   provider.request=lambda *a:(_ for _ in ()).throw(ValueError('offline'));self.assertTrue(provider.fetch()['unchanged'])
   first.pop('last_checked_at',None);first['captured_at']='2020-01-01T00:00:00+00:00';atomic(Path(d)/'latest-ratings.json',first);self.assertEqual(provider.fetch()['refresh_error'],'ValueError')
  self.page['props']['pageProps']['ratingDetails']['items']*=2
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaises(ValueError):Madden27RatingsProvider(d,request=request).fetch()
 def test_depth_asof_and_roster_timestamp(self):
  raw='season,gsis_id,full_name,team,position,status,football_name,last_name,espn_id\n2026,p1,Test Player,BUF,T,ACT,Test,Player,1\n'
  depth='dt,team,pos_rank,pos_grp,gsis_id,pos_abb,pos_slot\n2026-09-09T10:00:00Z,BUF,1,3WR 1TE,p1,LT,1\n2026-09-10T10:00:00Z,BUF,1,3WR 1TE,p2,LT,1\n'
  roster,roles,dates=roster_context(raw,depth,[{'player_id':'p1','display_name':'Test Player'}],self.at,'2026-09-08T00:00:00Z');self.assertEqual(roles[0]['player_id'],'p1');self.assertEqual(roster['p1']['roster_at'],'2026-09-08T00:00:00Z')

 def test_each_defensive_formula(self):
  config=json.loads((ROOT/'config/personnel.json').read_text())
  for unit in ['pass_rush','run_front','secondary_man','secondary_zone','secondary']:
   w=config['unit_weights'][unit];attrs={k:50+i for i,k in enumerate(w['attributes'])};p=self.p|{'mapping_status':'strongly_corroborated','attributes':attrs};n=7 if unit=='run_front' else 4
   roles=[{'player_id':str(i),'role':'fixture','team':'BUF'} for i in range(n)];roster={str(i):self.r['p1'] for i in range(n)};ratings={str(i):p for i in range(n)}
   u=composite(unit,roles,roster,ratings,w);expected=sum(attrs[k]*v for k,v in w['attributes'].items())/sum(w['attributes'].values());self.assertEqual(u['rating'],round(expected,2));self.assertTrue(u['complete']);self.assertEqual(u['confidence'],'moderate')
   roster['0']=roster['0']|{'active':False};self.assertFalse(composite(unit,roles,roster,ratings,w)['complete'])
