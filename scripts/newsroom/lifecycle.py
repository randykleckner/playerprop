"""News persistence: absence isn't clearance; explicit improvement is news too."""
from .feed import base

def retain_and_update(stories,previous,players,sources):
    people={p['player_id']:p for p in players}
    present={s['player_id'] for s in stories if s['topic']=='Availability'}
    prior={s['player_id']:s for s in previous if s['topic']=='Availability'}
    for source in sources:
        if source.get('status')!='ok':continue
        for update in source.get('counts',{}).get('practice_updates',[]):
            pid=update['player_id'];old=prior.get(pid)
            if not old or pid not in people or pid in present:continue
            p=people[pid]
            if old.get('evidence',{}).get('game_status')=='Full practice':
                stories.append(old);present.add(pid);continue
            item=base(p,'practice-return:'+pid+':'+str(update['season'])+':'+str(update['week']),'Availability',
                'Practice update: full participation with no game designation on this report.',
                'An improvement in practice availability; this does not confirm gameday activation or a full workload.',
                source['name'],source['url'],None,source['fetched_at'],update|{'game_status':'Full practice'})
            item['previous_status']=old.get('evidence',{}).get('game_status');stories.append(item);present.add(pid)
    for pid,old in prior.items():
        if pid not in present and (old.get('return_update') or old.get('evidence',{}).get('game_status') not in ['Active','Healthy']):stories.append(dict(old,retained=True))
    return stories
