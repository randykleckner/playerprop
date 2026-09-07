import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from dfs.espn import parse_espn,dk_estimate,BASIS
from dfs.projections import ProjectionSnapshot,consensus
from dfs.providers import ProviderError

FIXTURE=json.loads((Path(__file__).parent/'fixtures/espn-week1-2026.json').read_text())
NOW='2026-09-06T15:00:00.000Z'


class ProjectionTests(unittest.TestCase):
    def test_weekly_projected_only_and_stable_espn_identity(self):
        canonical=[{'player_id':'gibbs-canonical','espn_id':'4429795','position':'RB'}]
        s=parse_espn(FIXTURE,2026,1,NOW,canonical)
        gibbs=next(r for r in s.records if r['source_player_id']=='4429795')
        self.assertEqual(gibbs['player_id'],'gibbs-canonical')
        self.assertAlmostEqual(gibbs['projected_points'],22.799591323)
        self.assertNotEqual(gibbs['projected_points'],gibbs['source_native_points'])
        self.assertEqual(s.scoring_basis,BASIS)
        with self.assertRaises(ProviderError):parse_espn(FIXTURE,2099,1,NOW,canonical)

    def test_actual_stats_cannot_be_used_as_weekly_projections(self):
        p=copy.deepcopy(FIXTURE)
        for row in p['players']:
            row['player']['stats']=[s for s in row['player'].get('stats',[]) if s.get('statSourceId')==0]
        with self.assertRaises(ProviderError):parse_espn(p,2026,1,NOW,[])
        with self.assertRaises(ProviderError):parse_espn({'players':[FIXTURE['players'][0]]*2},2026,1,NOW,[])

    def test_expected_bonuses_not_threshold_of_expected_yards(self):
        result=dk_estimate({'3':290,'4':2,'20':1,'17':.4,'18':.1},'QB')
        self.assertAlmostEqual(result['components']['expected_yardage_bonuses'],1.5)
        self.assertAlmostEqual(result['projected_points'],20.1)
        self.assertEqual(dk_estimate({'3':310},'QB')['components']['expected_yardage_bonuses'],0)
        with self.assertRaises(ProviderError):dk_estimate({},'QB')
        with self.assertRaises(ProviderError):dk_estimate({'3':float('nan')},'QB')
        with self.assertRaises(ProviderError):dk_estimate({'37':2},'RB')

    def test_two_point_conversions_are_not_double_counted(self):
        result=dk_estimate({'62':.3,'19':.1,'26':.2,'63':.1,'72':.25},'QB')
        self.assertAlmostEqual(result['projected_points'],.95)

    def test_defense_bucket_mismatch_is_bounded_and_flagged(self):
        stats={str(k):0 for k in [89,90,91,92,121,122,123,124,125,95,96,97,98,99,105]}
        stats['121']=1
        row=dk_estimate(stats,'DST')
        self.assertEqual((row['conversion_lower'],row['conversion_upper'],row['projected_points']),(0,1,.5))
        self.assertIn('dst_18_to_21_bucket_midpoint_assumption',row['quality_flags'])
        stats['121']=0;stats['125']=1
        self.assertEqual(dk_estimate(stats,'DST')['projected_points'],-4)

    def test_tiny_provider_probability_roundoff_flagged(self):
        row=dk_estimate({'24':1,'37':-0.0000003},'QB')
        self.assertIn('bonus_probability_roundoff_clamped',row['quality_flags'])
        self.assertAlmostEqual(row['projected_points'],.1)

    def test_consensus_latest_pre_cutoff_same_week_and_scoring(self):
        def snapshot(source,points,captured=NOW,basis=BASIS,week=1):
            return ProjectionSnapshot(source,2026,week,captured,basis,[{'player_id':'p','position':'RB','projected_points':points}],{})
        sources=[snapshot('espn',10,'2026-09-06T12:00:00Z'),snapshot('espn',12),snapshot('other',20),
                 snapshot('other',999,'2026-09-07T00:00:00Z'),snapshot('incompatible',100,basis='half-ppr'),
                 snapshot('wrong-week',100,week=2)]
        rows=consensus(sources,2026,1,NOW,BASIS)
        self.assertEqual(rows[0]['projected_points'],16)
        self.assertEqual(rows[0]['source_count'],2)
        self.assertEqual(rows[0]['source_disagreement'],4)
        rows=consensus(sources,2026,1,NOW,BASIS,{'espn':3,'other':1})
        self.assertEqual(rows[0]['projected_points'],14)

    def test_missing_provider_is_not_zero_and_unmapped_rows_are_excluded(self):
        s=ProjectionSnapshot('espn',2026,1,NOW,BASIS,[{'player_id':'p','position':'RB','projected_points':15},
            {'player_id':None,'position':'WR','projected_points':50}],{})
        result=consensus([s],2026,1,NOW,BASIS,{'espn':1,'missing':1})
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['projected_points'],15)
        self.assertEqual(result[0]['source_count'],1)
