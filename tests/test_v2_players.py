import sys,unittest,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from build_v2_players import observe,opportunities
from build_v2_live import eligible_rows
class PlayerOpportunityTests(unittest.TestCase):
 def setUp(self):
  self.config=json.loads((ROOT/'config/v2-opportunity.json').read_text());self.live=json.loads((ROOT/'config/v2-live.json').read_text())
  self.roster={i:{'player_id':i,'name':i,'team':'BUF','position':pos,'active':True,'status':'ACT','roster_at':'2026-09-09T00:00:00Z','aliases':[i]} for i,pos in [('qb','QB'),('rb','RB'),('rb2','RB'),('wr','WR'),('te','TE')]}
  self.roles=[{'player_id':i,'formation':'3WR 1TE'} for i in ['qb','rb','wr','te']]
 def row(self,**extra):return dict(game_id='g',week='1',season='2025',game_date='2025-09-07',season_type='REG',play_type='run',qtr='1',down='1',ydstogo='10',quarter_seconds_remaining='900',score_differential='0',yards_gained='4',sack='0',interception='0',complete_pass='0',fumble_lost='0',penalty='0',qb_kneel='0',qb_spike='0',posteam='BUF',yardline_100='5',rusher_player_id='rb',receiver_player_id='',passer_player_id='',qb_scramble='0',qb_hit='0')|extra
 def build(self,rows,source=None):return opportunities({(2025,k):v for k,v in observe(rows).items()},self.roster,source or [],self.roles,self.config,self.live,'2026-09-09T00:00:00Z')
 def test_empirical_role_and_context_shares_reconcile(self):
  rows=[self.row() for _ in range(10)]+[self.row(play_type='pass',rusher_player_id='',receiver_player_id='wr',passer_player_id='qb',complete_pass='1') for _ in range(10)]
  team=self.build(rows)['BUF'];self.assertEqual(team['qb_id'],'qb')
  for ctx in ['normal','redzone','goal']:
   for kind in ['carry','target']:self.assertAlmostEqual(sum(p['shares'][ctx+'_'+kind] for p in team['players']),1)
  rb=next(p for p in team['players'] if p['player_id']=='rb');self.assertGreater(rb['shares']['normal_carry'],next(p for p in team['players'] if p['player_id']=='rb2')['shares']['normal_carry']);self.assertIsNone(rb['routes']);self.assertIsNone(rb['snap_share'])
 def test_inactive_and_unknown_qb_not_invented(self):
  self.roster['rb']['active']=False;self.assertNotIn('rb',[p['player_id'] for p in self.build([self.row()])['BUF']['players']]);self.roles=[r for r in self.roles if r['player_id']!='qb'];self.assertEqual(self.build([self.row()]),{})
 def test_scramble_and_pressure_proxy(self):
  rows=[self.row(rusher_player_id='qb',qb_scramble='1'),self.row(play_type='pass',sack='1',yards_gained='-4',passer_player_id='qb',rusher_player_id='')];g=observe(rows)['g'];self.assertEqual(g['teams']['BUF']['pressure'],2);self.assertEqual(g['teams']['BUF']['pressure_sacks'],1);self.assertEqual(g['players']['qb']['scrambles'],1)
 def test_rookie_fallback_uses_projection_not_madden(self):
  source=[{'player_id':'rb2','active':True,'projected_opportunities':{'carries':20,'targets':4}}];p=next(p for p in self.build([],source)['BUF']['players'] if p['player_id']=='rb2');self.assertGreater(p['shares']['normal_carry'],.5);self.assertIn('No historical opportunities; projection/depth prior',p['flags'])
 def test_asof_guard_and_prior_team_downweight(self):
  self.assertEqual(list(eligible_rows([self.row(game_date='2026-10-01')],2025,'2026-09-09')),[])
  rows=[self.row(posteam='KC')];p=next(p for p in self.build(rows)['BUF']['players'] if p['player_id']=='rb');self.assertIn('Prior-team history downweighted',p['flags']);self.assertAlmostEqual(p['weighted_usage_games'],.35)

 def test_sparse_reserve_mass_capped(self):
  team=self.build([])['BUF'];other=[p for p in team['players'] if p['residual']]
  self.assertLessEqual(sum(p['shares']['normal_carry'] for p in other),.0300001);self.assertLessEqual(sum(p['shares']['normal_target'] for p in other),.0400001);self.assertTrue(all(not p['detailed'] for p in other))
