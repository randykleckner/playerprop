import base64
import copy
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from dfs.draftkings import parse_lobby, parse_draftables, select_main_slate, DraftKingsWebProvider, LOBBY_URL, DRAFTABLES_URL
from dfs.providers import ProviderError, CsvSalaryProvider, SalarySnapshot, fetch_with_fallback, quality_report
from dfs.identity import map_identities
from dfs.http import PublicSalaryClient
from dfs.storage import snapshot_sql, archive_snapshot, latest_snapshot_sql

FIXTURES = ROOT/"tests/fixtures/draftkings"
LOBBY = json.loads((FIXTURES/"lobby.json").read_text())
DRAFTABLES = json.loads((FIXTURES/"draftables-151307.json").read_text())
CONFIG = json.loads((ROOT/"config/dfs-salaries.json").read_text())
NOW = "2026-09-06T05:00:00.000Z"


def main_slate():
    return select_main_slate(parse_lobby(LOBBY),CONFIG,NOW)


class ParsingTests(unittest.TestCase):
    def test_recorded_lobby_extracts_all_groups_and_real_main(self):
        groups = parse_lobby(LOBBY)
        self.assertEqual(len(groups),16)
        self.assertEqual(len({g['draft_group_id'] for g in groups}),16)
        main = select_main_slate(groups,CONFIG,NOW)
        self.assertEqual(main['draft_group_id'],'151307')
        self.assertEqual(main['game_count'],12)
        self.assertEqual(main['start_time'],'2026-09-13T17:00:00.000Z')
        self.assertEqual(main['contest_type_ids'],['21'])
        self.assertEqual(next(g for g in groups if g['draft_group_id']=='151820')['format'],'Showdown')

    def test_selection_order_window_date_games_and_ambiguity(self):
        groups = list(reversed(parse_lobby(LOBBY)))
        self.assertEqual(select_main_slate(groups,CONFIG,NOW)['draft_group_id'],'151307')
        for delta in [{'game_count':1},{'game_count':None},{'sport':'NBA'},{'format':'Showdown'},
                      {'start_time':None},{'start_time':'2026-09-13T21:00:00Z'},
                      {'start_time':'2026-09-12T17:00:00Z'}]:
            with self.subTest(delta=delta),self.assertRaises(ProviderError):
                select_main_slate([main_slate()|delta],CONFIG,NOW)
        with self.assertRaises(ProviderError):
            select_main_slate(groups,CONFIG,'2026-09-14T00:00:00Z')
        with self.assertRaises(ProviderError):
            select_main_slate(groups,CONFIG,NOW,'2026-09-20')
        main = main_slate()
        self.assertEqual(select_main_slate([main,main|{'draft_group_id':'2','game_count':3}],CONFIG,NOW),main)
        with self.assertRaisesRegex(ProviderError,'Ambiguous'):
            select_main_slate([main,main|{'draft_group_id':'2'}],CONFIG,NOW)

    def test_contest_only_groups_and_conflicting_metadata(self):
        minimal = {'SelectedSport':'NFL','Contests':LOBBY['Contests']}
        groups = parse_lobby(minimal)
        self.assertGreater(len(groups),0)
        self.assertTrue(all(g['game_count'] is None for g in groups))
        payload = copy.deepcopy(LOBBY)
        duplicate = next(g for g in payload['DraftGroups'] if g['DraftGroupId']==151307).copy()
        duplicate['GameCount']=2
        payload['DraftGroups'].append(duplicate)
        group = next(g for g in parse_lobby(payload) if g['draft_group_id']=='151307')
        self.assertIn('conflicting_slate_metadata',group['quality_flags'])
        self.assertEqual(parse_lobby({'DraftGroups':[],'Contests':[]}),[])
        for payload in [{},{'DraftGroups':{}},{'Contests':[1]}]:
            with self.assertRaises(ProviderError): parse_lobby(payload)

    def test_recorded_draftables_merge_flex_keep_stable_namespaces(self):
        rows,warnings = parse_draftables(DRAFTABLES,main_slate())
        self.assertEqual(len(DRAFTABLES['draftables']),1372)
        self.assertEqual(len(rows),744)
        gibbs = next(r for r in rows if r['player_name']=='Jahmyr Gibbs')
        self.assertEqual(gibbs['salary'],8000)
        self.assertEqual(gibbs['external_ids'],{'draftkings_player_id':'1214154','draftkings_player_dk_id':'693115'})
        self.assertEqual(len(gibbs['draftable_ids']),2)
        self.assertEqual((gibbs['team'],gibbs['opponent'],gibbs['home_away']),('DET','NO','home'))
        self.assertTrue(warnings)
        self.assertTrue(all(r['game_id'] is None for r in rows))
        self.assertEqual(sum(r['position']=='DST' for r in rows),24)

    def test_disabled_missing_optional_and_missing_required_values_are_flagged(self):
        raw = copy.deepcopy(DRAFTABLES['draftables'][0])
        raw['isDisabled']=True
        for key in ('salary','competition','firstName','lastName','status','playerDkId'):
            raw.pop(key,None)
        rows,_ = parse_draftables({'draftables':[raw]},main_slate())
        self.assertEqual(len(rows),1)
        self.assertEqual(set(rows[0]['quality_flags']),{'disabled_player','missing_opponent','missing_start_time','missing_salary'})
        raw.pop('position')
        rows,_=parse_draftables({'draftables':[raw]},main_slate())
        self.assertIn('missing_position',rows[0]['quality_flags'])
        raw['isDisabled']='false'
        rows,_=parse_draftables({'draftables':[raw]},main_slate())
        self.assertIn('invalid_disabled_status',rows[0]['quality_flags'])

    def test_duplicate_draftables_and_conflicting_salaries(self):
        raw = copy.deepcopy(DRAFTABLES['draftables'][0])
        rows,_ = parse_draftables({'draftables':[raw,raw]},main_slate())
        self.assertEqual(len(rows),1)
        self.assertIn('duplicate_draftable',rows[0]['quality_flags'])
        for change in [{'salary':1},{'playerId':99999}]:
            with self.assertRaises(ProviderError):
                parse_draftables({'draftables':[raw,raw|change]},main_slate())

    def test_bad_structures_empty_errors_and_showdown(self):
        for payload in [{},{'draftables':[]},{'draftables':{}},{'draftables':[1]},
                        {'draftables':[{'unexpected':'shape'}]},
                        {'errorStatus':{'message':'failed'},'draftables':DRAFTABLES['draftables']},
                        {'draftables':[DRAFTABLES['draftables'][0]|{'position':'CPT'}]}]:
            with self.subTest(payload=str(payload)[:60]),self.assertRaises(ProviderError):
                parse_draftables(payload,main_slate())
        with self.assertRaises(ProviderError):
            parse_draftables(DRAFTABLES,main_slate()|{'format':'Showdown'})

    def test_pool_and_lobby_disagreement_does_not_silently_change_lock(self):
        for slate in [main_slate()|{'game_count':2},main_slate()|{'start_time':'2026-09-13T18:00:00.000Z'}]:
            with self.assertRaises(ProviderError):parse_draftables(DRAFTABLES,slate)


class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.rows = parse_draftables({'draftables':[DRAFTABLES['draftables'][0]]},main_slate())[0]
        self.player = {'player_id':'canonical-gibbs','display_name':'Jahmyr Gibbs','position':'RB','current_team_id':'DET'}

    def test_stable_then_verified_mapping(self):
        p = self.player|{'external_ids':{'draftkings_player_dk_id':'693115'}}
        map_identities(self.rows,[p],[])
        self.assertEqual(self.rows[0]['player_id'],'canonical-gibbs')
        self.assertEqual(self.rows[0]['identity_status'],'stable_external_id')
        mapping = {'namespace':'draftkings_player_id','external_id':'1214154','player_id':'canonical-gibbs','verified':True}
        map_identities(self.rows,[self.player],[mapping])
        self.assertEqual(self.rows[0]['identity_status'],'verified_mapping')
        map_identities(self.rows,[self.player],[mapping|{'namespace':'espn_id'}])
        self.assertIsNone(self.rows[0]['player_id'])

    def test_name_fallback_candidates_ambiguity_and_position_conflict(self):
        p = self.player|{'display_name':'Jahmyr Gibbs Jr.'}
        map_identities(self.rows,[p],[])
        self.assertEqual(self.rows[0]['identity_status'],'name_team_position_candidate')
        self.assertEqual(self.rows[0]['mapping_candidates'],['canonical-gibbs'])
        self.assertIsNone(self.rows[0]['player_id'])
        map_identities(self.rows,[p,p|{'player_id':'other'}],[])
        self.assertEqual(self.rows[0]['identity_status'],'ambiguous_name')
        map_identities(self.rows,[p|{'current_team_id':'GB'}],[])
        self.assertEqual(self.rows[0]['identity_status'],'unresolved')
        map_identities(self.rows,[p|{'position':'WR','external_ids':{'draftkings_player_id':'1214154'}}],[])
        self.assertEqual(self.rows[0]['identity_status'],'position_conflict')

    def test_conflicting_evidence_and_canonical_collisions(self):
        p = self.player|{'external_ids':{'draftkings_player_id':'1214154'}}
        other = self.player|{'player_id':'other'}
        mapping = {'namespace':'draftkings_player_dk_id','external_id':'693115','player_id':'other','verified':True}
        map_identities(self.rows,[p,other],[mapping])
        self.assertIsNone(self.rows[0]['player_id'])
        self.assertEqual(self.rows[0]['identity_status'],'ambiguous_external_id')
        rows = self.rows + copy.deepcopy(self.rows)
        map_identities(rows,[p],[])
        self.assertTrue(all(r['identity_status']=='canonical_collision' for r in rows))


class ProviderStorageTests(unittest.TestCase):
    def snapshot(self):
        rows,_ = parse_draftables({'draftables':[DRAFTABLES['draftables'][0]]},main_slate())
        return SalarySnapshot('draftkings-web',NOW,main_slate(),rows,{'payload':DRAFTABLES})

    def database(self):
        c = sqlite3.connect(':memory:')
        self.addCleanup(c.close)
        c.executescript((ROOT/'docs/d1-observed-legacy-schema.sql').read_text())
        c.executescript((ROOT/'migrations/0007_dfs_provider_snapshots.sql').read_text())
        return c

    def test_csv_contract_and_provider_fallback(self):
        class Failed:
            def fetch(self,slate): raise ProviderError('HTTP 503')
        csv = CsvSalaryProvider((ROOT/'tests/fixtures/draftkings-salaries.csv').read_text(),NOW)
        result = fetch_with_fallback(Failed(),main_slate(),csv)
        self.assertEqual(result.source,'draftkings-csv')
        self.assertEqual(len(result.records),3)
        self.assertTrue(result.warnings)
        with self.assertRaises(ProviderError): fetch_with_fallback(Failed(),main_slate())

    def test_real_adapter_schema_failure_uses_csv(self):
        class ChangedClient:
            def get(self,*args,**kwargs):return {'fetched_at':NOW,'payload':{'draftables':{}}}
        csv = CsvSalaryProvider((ROOT/'tests/fixtures/draftkings-salaries.csv').read_text(),NOW)
        result=fetch_with_fallback(DraftKingsWebProvider(ChangedClient()),main_slate(),csv)
        self.assertEqual(result.source,'draftkings-csv')

    def test_distinct_fetches_immutable_persistence_raw_round_trip(self):
        c = self.database(); snapshot = self.snapshot()
        sql = snapshot_sql(snapshot)
        self.assertTrue(all(len(s)<100000 for s in sql.splitlines()))
        c.executescript(sql)
        self.assertEqual(c.execute('SELECT complete FROM dfs_provider_snapshots').fetchone()[0],1)
        chunks = ''.join(r[0] for r in c.execute('SELECT gzip_base64 FROM dfs_provider_raw_chunks ORDER BY ordinal'))
        raw = gzip.decompress(base64.b64decode(chunks))
        self.assertEqual(json.loads(raw),snapshot.raw)
        self.assertEqual(hashlib.sha256(raw).hexdigest(),c.execute('SELECT raw_sha256 FROM dfs_provider_snapshots').fetchone()[0])
        for sql in ["UPDATE dfs_provider_snapshots SET fetched_at='x'","DELETE FROM dfs_provider_snapshots",
                    "UPDATE dfs_provider_salary_records SET record_json='{}'","DELETE FROM dfs_provider_raw_chunks"]:
            with self.assertRaises(sqlite3.IntegrityError): c.execute(sql)
        previous_id = snapshot.snapshot_id
        snapshot.fetched_at='2026-09-06T07:00:00.000Z'
        self.assertNotEqual(snapshot.snapshot_id,previous_id)
        c.executescript(snapshot_sql(snapshot))
        self.assertEqual(c.execute('SELECT COUNT(*) FROM dfs_provider_snapshots').fetchone()[0],2)
        self.assertEqual(c.execute(latest_snapshot_sql('151307','2026-09-06T06:00:00.000Z')).fetchone()[0],previous_id)

    def test_partial_snapshots_and_debug_after_lock_excluded(self):
        c=self.database();snapshot=self.snapshot()
        c.executescript(snapshot_sql(snapshot).splitlines()[0])
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute('UPDATE dfs_provider_snapshots SET complete=1')
        self.assertIsNone(c.execute(latest_snapshot_sql('151307','2026-09-20T00:00:00Z')).fetchone())
        c.executescript(snapshot_sql(snapshot))
        before = snapshot.snapshot_id
        snapshot.fetched_at='2026-09-14T00:00:00.000Z'
        c.executescript(snapshot_sql(snapshot))
        self.assertEqual(c.execute(latest_snapshot_sql('151307','2026-09-20T00:00:00Z')).fetchone()[0],before)

    def test_archive_idempotency_and_quality_report(self):
        snapshot=self.snapshot()
        map_identities(snapshot.records,[],[])
        report=quality_report(snapshot,'2026-09-06T09:00:00Z')
        self.assertTrue(report['stale_salary_snapshot'])
        self.assertEqual(report['mapping_success_rate'],0)
        with tempfile.TemporaryDirectory() as tmp:
            first=archive_snapshot(snapshot,Path(tmp))
            self.assertEqual(first,archive_snapshot(snapshot,Path(tmp)))
            self.assertEqual(len(list(Path(tmp).glob('*.gz'))),1)

    def test_offline_diagnostic(self):
        with tempfile.TemporaryDirectory() as tmp:
            result=subprocess.run([sys.executable,str(ROOT/'scripts/diagnose_dk_salaries.py'),
                '--lobby-file',str(FIXTURES/'lobby.json'),'--draftables-file',str(FIXTURES/'draftables-151307.json'),
                '--recorded-at',NOW,'--draft-group-id','151307','--debug-after-lock','--state-dir',tmp],
                capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            report=json.loads(next(Path(tmp).glob('*-report.json')).read_text())
            self.assertEqual(report['players'],744)
            self.assertEqual(len(report['sample']),10)
            self.assertEqual(report['source'],'draftkings-web')


class HttpPolicyTests(unittest.TestCase):
    def test_cache_avoids_network_and_preserves_original_fetch_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            client=PublicSalaryClient(Path(tmp),CONFIG)
            observation={'payload':LOBBY,'url':LOBBY_URL,'fetched_at':datetime.now(timezone.utc).isoformat()}
            key=hashlib.sha256(LOBBY_URL.encode()).hexdigest()
            (Path(tmp)/(key+'.json')).write_text(json.dumps(observation))
            with patch('urllib.request.build_opener') as network:
                self.assertEqual(client.get(LOBBY_URL,'lobby'),observation)
                network.assert_not_called()

    def test_locked_and_unapproved_urls_never_reach_network(self):
        with tempfile.TemporaryDirectory() as tmp,patch('urllib.request.build_opener') as network:
            client=PublicSalaryClient(Path(tmp),CONFIG)
            for url,kind,lock in [('https://www.draftkings.com/account','lobby',None),
                    (DRAFTABLES_URL.format('151307'),'salary','2020-01-01T00:00:00Z')]:
                with self.assertRaises(ProviderError):client.get(url,kind,lock)
            network.assert_not_called()

    def test_http_failure_backoff_and_headers(self):
        with tempfile.TemporaryDirectory() as tmp,patch('urllib.request.build_opener') as build:
            client=PublicSalaryClient(Path(tmp),CONFIG)
            build.return_value.open.side_effect=urllib.error.HTTPError(LOBBY_URL,429,'limit',{'Retry-After':'7200'},None)
            with self.assertRaisesRegex(ProviderError,'HTTP 429'):client.get(LOBBY_URL,'lobby')
            request=build.return_value.open.call_args.args[0]
            self.assertEqual(request.method,'GET')
            self.assertIn('playerprop',request.get_header('User-agent'))
            self.assertIsNone(request.get_header('Authorization'))
            with self.assertRaisesRegex(ProviderError,'backoff'):client.get(LOBBY_URL,'lobby')
            self.assertEqual(build.return_value.open.call_count,1)

    def test_bad_json_backoff_and_successful_get_cache(self):
        for body,success in [(b'<html>changed</html>',False),(json.dumps(LOBBY).encode(),True)]:
            with self.subTest(success=success),tempfile.TemporaryDirectory() as tmp,patch('urllib.request.build_opener') as build:
                build.return_value.open.return_value.__enter__.return_value.read.return_value=body
                client=PublicSalaryClient(Path(tmp),CONFIG)
                if success:
                    first=client.get(LOBBY_URL,'lobby')
                    self.assertEqual(client.get(LOBBY_URL,'lobby'),first)
                    self.assertEqual(first['payload'],LOBBY)
                else:
                    with self.assertRaises(ProviderError):client.get(LOBBY_URL,'lobby')
                    with self.assertRaisesRegex(ProviderError,'backoff'):client.get(LOBBY_URL,'lobby')
                self.assertEqual(build.return_value.open.call_count,1)

    def test_cross_endpoint_requests_respect_spacing(self):
        with tempfile.TemporaryDirectory() as tmp,patch('urllib.request.build_opener') as build,patch('dfs.http.time.sleep') as sleep,patch('dfs.http.time.time',return_value=100):
            (Path(tmp)/'request-state.json').write_text(json.dumps({'last_request':98}))
            build.return_value.open.return_value.__enter__.return_value.read.return_value=json.dumps(LOBBY).encode()
            PublicSalaryClient(Path(tmp),CONFIG).get(LOBBY_URL,'lobby')
            sleep.assert_called_once_with(3)


if __name__=='__main__':unittest.main()
