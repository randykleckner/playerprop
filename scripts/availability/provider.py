"""Canonical structured availability provider. General news never sets official status."""
from typing import Protocol
import re
from newsroom.feed import InjuryTable,NFL_URL
from personnel.model import family
from dfs.identity import normalized_name

def official_rows(body,people,season,week):
 title=re.search(r'Week\s+(\d+)\s+of\s+the\s+(\d{4})\s+Season',body)
 if not title or (int(title[2]),int(title[1]))!=(season,week):raise ValueError('Official report season/week does not match current research slate')
 parser=InjuryTable();parser.feed(body)
 if not parser.tables or not parser.rows:raise ValueError('No official injury tables')
 found={};issues=[]
 for tm,cols in parser.rows:
  name,pos,injury,practice,game=cols
  if game not in ['', 'Out','Doubtful','Questionable'] or practice not in ['', 'Full Participation in Practice','Limited Participation in Practice','Did Not Participate In Practice']:raise ValueError('Unknown official injury designation')
  matches=[p for p in people.values() if p['team']==tm and family(p['position'])==family(pos) and normalized_name(name) in {normalized_name(a) for a in p['aliases']}]
  if len(matches)!=1:issues.append({'team':tm,'name':name,'position':pos,'reason':'Unresolved injury identity'});continue
  state=game.upper() if game else 'LIMITED' if practice in ['Limited Participation in Practice','Did Not Participate In Practice'] else 'ACTIVE' if practice=='Full Participation in Practice' else 'UNKNOWN'
  pid=matches[0]['player_id'];record={'state':state,'practice_status':practice,'game_status':game,'injury':injury,'source':NFL_URL,'confidence':'official_designation' if game else 'practice_only_workload_assumption'}
  if pid in found and found[pid]!=record:raise ValueError('Conflicting official rows')
  found[pid]=record
 return found,issues,parser.tables

class AvailabilityProvider(Protocol):
 def parse(self,body,people,season,week,fetched_at): ...

class NflAvailabilityProvider:
 source = NFL_URL
 def parse(self,body,people,season,week,fetched_at):
  rows,issues,tables=official_rows(body,people,season,week)
  return {'players':{pid:dict(row,updated_at=fetched_at,source_published_at=None,season=season,week=week) for pid,row in rows.items()},'issues':issues,'tables':tables,'fetched_at':fetched_at,'source_published_at':None,'season':season,'week':week,'source':self.source,'status':'ok'}

def apply_official_inactives(report,evidence):
 """Optional verified structured inactive evidence; never inferred from a news headline."""
 from urllib.parse import urlparse
 from datetime import datetime
 if (evidence.get('season'),evidence.get('week'))!=(report['season'],report['week']):raise ValueError('Inactive cohort mismatch')
 if urlparse(evidence.get('source','')).hostname!='www.nfl.com' or urlparse(evidence['source']).scheme!='https':raise ValueError('Unverified inactive source')
 datetime.fromisoformat(evidence['fetched_at'].replace('Z','+00:00'))
 result=dict(report,players={k:dict(v) for k,v in report['players'].items()})
 for pid in evidence['player_ids']:
  if pid not in result['players']:raise ValueError('Inactive identity requires corroborated provider row')
  result['players'][pid].update(state='INACTIVE',game_status='INACTIVE',source=evidence['source'],updated_at=evidence['fetched_at'],confidence='official_inactive')
 return result
