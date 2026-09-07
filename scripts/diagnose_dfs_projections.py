#!/usr/bin/env python3
"""Read public weekly projections and compare them with a saved salary pool."""
import argparse
from dataclasses import asdict
import gzip
import hashlib
import json
from pathlib import Path

from dfs.catalog import load_catalog
from dfs.espn import EspnProjectionProvider,parse_espn,BASIS
from dfs.projections import consensus
from dfs.providers import encoded,ProviderError,utc_now,iso
from dfs.storage import ROOT


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season',required=True,type=int)
    parser.add_argument('--week',required=True,type=int)
    parser.add_argument('--state-dir',type=Path,default=ROOT/'.dfs-projections')
    parser.add_argument('--canonical-json',type=Path)
    parser.add_argument('--input',type=Path,help='Recorded ESPN JSON; requires --captured-at')
    parser.add_argument('--captured-at')
    parser.add_argument('--salary-snapshot',type=Path,help='An existing salary snapshot .json.gz for diagnostic comparison')
    args=parser.parse_args()
    try:
        if not 2000<=args.season<=2100 or not 1<=args.week<=18:raise ProviderError('Invalid regular-season/week')
        if args.canonical_json:
            value=json.loads(args.canonical_json.read_text())
            canonical=value['players'] if isinstance(value,dict) else value
        else:
            if args.input:raise ProviderError('Offline replay requires --canonical-json')
            canonical,_=load_catalog(ROOT/'.dfs-salaries/catalog')
        if args.input:
            if not args.captured_at:raise ProviderError('Recorded input needs its actual --captured-at')
            captured=iso(args.captured_at).isoformat(timespec='milliseconds').replace('+00:00','Z')
            snapshot=parse_espn(json.loads(args.input.read_text()),args.season,args.week,captured,canonical)
        else:snapshot=EspnProjectionProvider(args.state_dir/'http',canonical).fetch(args.season,args.week)
        document=asdict(snapshot)
        digest=hashlib.sha256(encoded(document).encode()).hexdigest()
        args.state_dir.mkdir(parents=True,exist_ok=True)
        path=args.state_dir/(digest+'.json.gz')
        if not path.exists():
            with path.open('xb') as file:file.write(gzip.compress(encoded(document).encode(),mtime=0))
        comparison=[]
        if args.salary_snapshot:
            salaries=json.loads(gzip.decompress(args.salary_snapshot.read_bytes()))
            by_id={r['player_id']:r for r in snapshot.records if r.get('player_id')}
            by_team={r['team']:r for r in snapshot.records if r['position']=='DST' and r.get('team')}
            for salary in salaries['records']:
                candidate_ids=salary.get('mapping_candidates',[])
                key=salary.get('player_id') or (candidate_ids[0] if len(candidate_ids)==1 else None)
                projection=by_team.get(salary.get('team')) if salary['position']=='DST' else by_id.get(key)
                if not projection or projection['position']!=salary['position'] or projection['team']!=salary.get('team'):continue
                comparison.append({'player_name':salary['player_name'],'position':salary['position'],'team':salary['team'],
                    'salary':salary['salary'],'espn_dk_estimate':projection['projected_points'],
                    'salary_identity_verified':bool(salary.get('player_id')) or salary['position']=='DST',
                    'quality_flags':projection['quality_flags'],
                    'eligible_for_optimizer':False})
        summary={'source':snapshot.source,'season':args.season,'week':args.week,'fetched_at':snapshot.fetched_at,
            'scoring_basis':BASIS,'projection_count':len(snapshot.records),
            'stable_canonical_matches':sum(bool(r['player_id']) for r in snapshot.records),
            'dst_count':sum(r['position']=='DST' for r in snapshot.records),
            'source_count':1,'salary_comparison_count':len(comparison),
            'comparison_notice':'Diagnostic only: salary identity, slate-week membership, completeness and scoring assumptions require validation before lineup optimization.',
            'salary_comparison':sorted(comparison,key=lambda r:-r['espn_dk_estimate']),
            'consensus':consensus([snapshot],args.season,args.week,utc_now(),BASIS),
            'sample':snapshot.records[:10],'archive':str(path)}
        report=args.state_dir/(digest+'-report.json');report.write_text(json.dumps(summary,indent=2)+'\n')
        print(json.dumps({k:v for k,v in summary.items() if k not in ('consensus','salary_comparison','sample')},indent=2))
        print('Report:',report)
        return 0
    except (OSError,ValueError,KeyError,TypeError) as error:
        print('Projection diagnostic failed:',error)
        return 1


if __name__=='__main__':raise SystemExit(main())
