#!/usr/bin/env python3
"""Enrich a saved simulation input from explicitly timestamped recorded sources."""
import argparse,csv,json,hashlib
from datetime import datetime,timezone
from pathlib import Path
from research.prepare import enrich,timestamp
p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--scoreboard',required=True);p.add_argument('--crosswalk',required=True);p.add_argument('--snaps',required=True);p.add_argument('--catalog',required=True);p.add_argument('--captured-at',required=True);p.add_argument('--output',required=True);a=p.parse_args()
timestamp(a.captured_at)
read=lambda path:json.loads(Path(path).read_text())
source=read(a.input);catalog=read(a.catalog)
result,report=enrich(source,read(a.scoreboard),list(csv.DictReader(open(a.crosswalk))),list(csv.DictReader(open(a.snaps))),catalog.get('players',catalog) if isinstance(catalog,dict) else catalog,a.captured_at)
result['sources']['research_archives']={k:{'sha256':hashlib.sha256(Path(getattr(a,k)).read_bytes()).hexdigest(),'received_at':datetime.fromtimestamp(Path(getattr(a,k)).stat().st_mtime,timezone.utc).isoformat()} for k in ['scoreboard','crosswalk','snaps']}
output=Path(a.output);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result));output.with_suffix('.review.json').write_text(json.dumps(report,indent=2));print(json.dumps(result['research_readiness'],indent=2))
