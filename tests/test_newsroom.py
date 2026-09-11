import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from newsroom.feed import rss, injuries, espn, article_published_at
from refresh_newsroom import refresh, atomic
F=Path(__file__).parent/'fixtures/newsroom'
NOW='2026-09-08T23:00:00+00:00'
PLAYERS=[{'player_id':str(i),'display_name':n,'espn_id':str(i),'position':p,'current_team_id':t} for i,n,p,t in [(1,'Patrick Mahomes','QB','KC'),(2,'TreVeyon Henderson','RB','NE'),(3,'Tory Horton','WR','SEA'),(4,'Baker Mayfield','QB','TB')]]
class NewsTests(unittest.TestCase):
 def test_rss_actionable_only_and_qualified(self):
  rows,counts=rss((F/'espn.xml').read_text(),PLAYERS,NOW)
  self.assertEqual({r['player_name'] for r in rows},{'Patrick Mahomes','TreVeyon Henderson'})
  self.assertIn('expected',next(r for r in rows if r['player_id']=='1')['highlight'])
  self.assertTrue(all(r['source_url'].startswith('https://www.espn.com/') for r in rows))
 def test_future_and_old_items_held(self):
  self.assertEqual(rss((F/'espn.xml').read_text(),PLAYERS,'2026-09-08T10:00:00Z')[0],[])
  self.assertEqual(rss((F/'espn.xml').read_text(),PLAYERS,'2026-09-15T23:00:00Z')[0],[])
 def test_ambiguous_names_and_ids_do_not_link(self):
  rows,_=rss((F/'espn.xml').read_text(),PLAYERS+[dict(PLAYERS[0],player_id='other',espn_id='other')],NOW)
  self.assertNotIn('1',[r['player_id'] for r in rows])
 def test_official_practice_is_not_game_out(self):
  rows,counts=injuries((F/'nfl.html').read_text(),PLAYERS,NOW)
  self.assertEqual(len(rows),2);self.assertEqual(counts['tables'],2)
  h=next(r for r in rows if r['player_id']=='3')
  self.assertIn('Questionable',h['highlight']);self.assertNotIn('Unavailable',h['impact'])
  self.assertIsNone(h['published_at'])
 def test_wrong_team_and_schema_fail_closed(self):
  html=(F/'nfl.html').read_text()
  self.assertEqual(len(injuries(html,[dict(p,current_team_id='XXX') for p in PLAYERS],NOW)[0]),0)
  for broken in [html.replace('Game Status','Changed status'),html.replace('2026 Season','2025 Season'),'<html>blocked</html>']:
   with self.assertRaises(ValueError):injuries(broken,PLAYERS,NOW)
 def test_supersession_failure_retention_and_archives(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)/'public';state=Path(tmp)/'state'
   def request(url,state,now):
    return {'body':(F/('espn.xml' if 'espn' in url else 'nfl.html')).read_text(),'fetched_at':NOW,'sha256':'recorded'}
   with patch('refresh_newsroom.load_catalog',return_value=(PLAYERS,{'sha256':'catalog'})):
    self.assertEqual(refresh(root,state,request),0)
    first=json.loads((root/'newsroom/latest.json').read_text())
    self.assertEqual(len([s for s in first['stories'] if s['player_id']=='2']),1)
    def failed(*a):raise ValueError('upstream changed')
    self.assertEqual(refresh(root,state,failed),1)
    second=json.loads((root/'newsroom/latest.json').read_text())
    self.assertEqual(first['stories'],second['stories'])
    self.assertGreaterEqual(len(list(state.glob('*.snapshot.json'))),2)
 def test_cleared_status_removes_out_story(self):
  rows,counts=injuries((F/'nfl.html').read_text().replace('Out','').replace('Ankle','').replace('Did Not Participate In Practice','Full Participation in Practice'),PLAYERS,NOW)
  self.assertNotIn('2',[s['player_id'] for s in rows]);self.assertIn('2',counts['covered_player_ids'])

 def test_recorded_bowers_brown_and_future_rss_date_repair(self):
  people=[{'player_id':'bowers','display_name':'Brock Bowers','espn_id':'4432665','position':'TE','current_team_id':'LV'},{'player_id':'brown','display_name':'A.J. Brown','espn_id':'4047646','position':'WR','current_team_id':'NE'}]
  dates={'49884014':'2026-09-09T20:24:29Z','49891924':'2026-09-10T14:01:55Z'}
  resolve=lambda url:next((v for k,v in dates.items() if k in url),None)
  rows,counts=rss((F/'espn-2026-09-10.xml').read_text(),people,'2026-09-10T15:01:20Z',resolve)
  self.assertEqual({r['player_id'] for r in rows},{'bowers','brown'})
  self.assertEqual(next(r for r in rows if r['player_id']=='bowers')['topic'],'Procedure')
  self.assertIn('suspected',next(r for r in rows if r['player_id']=='brown')['highlight'])
  self.assertEqual(counts['article_dates_resolved'],2)
  self.assertEqual(rss((F/'espn-2026-09-10.xml').read_text(),people,'2026-09-10T15:01:20Z')[0],[])
 def test_article_date_requires_unique_article_metadata(self):
  html='<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-09-09T20:24:29Z"}</script>'
  self.assertEqual(article_published_at(html),'2026-09-09T20:24:29Z')
  self.assertIsNone(article_published_at(html+html.replace('2026-09-09','2026-09-08')))
  self.assertIsNone(article_published_at('<html>bad payload</html>'))
 def test_dnp_with_blank_injury_is_still_actionable(self):
  rows,_=injuries((F/'nfl.html').read_text().replace('Out','').replace('Ankle',''),PLAYERS,NOW)
  self.assertIn('2',[r['player_id'] for r in rows])
