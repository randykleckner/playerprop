import test from 'node:test';import assert from 'node:assert/strict';
import {loadOutlook} from '../public/drive-lab/outlook.js';
const game={game_id:'A-B',home:'A',away:'B',season:2026,week:3,start_time:'2026-09-27T17:00:00Z'};
const schedule={data_as_of:'2026-09-20T12:00:00Z',games:[game]};
const fetcher=data=>async path=>({ok:path in data,json:async()=>data[path]});
test('upcoming games work without a salary bundle',async()=>{const r=await loadOutlook(fetcher({'/drive-lab/upcoming.json':schedule}),Date.parse('2026-09-20'));assert.equal(r.games.length,1);assert.deepEqual(r.players,[]);});
test('prior-week projections cannot transfer to a same-team rematch',async()=>{const r=await loadOutlook(fetcher({'/drive-lab/upcoming.json':schedule,'/research/latest.json':{version:1,snapshot:{simulation_path:'/sim'}},'/sim':{season:2026,week:2,players:[{game_id:'A-B'}]}}),Date.parse('2026-09-20'));assert.equal(r.players.length,0);});
test('started games cannot remain in upcoming view',async()=>{await assert.rejects(loadOutlook(fetcher({'/drive-lab/upcoming.json':schedule}),Date.parse('2026-09-28')));});
