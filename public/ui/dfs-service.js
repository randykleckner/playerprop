import {loadResearch,snapshotState} from '../research/readiness.js';
import {SLOTS,eligible,salaryUsed} from '../simulation/workbench.js';
export async function loadBuilderData(fetcher=fetch){
 const manifest=await loadResearch(fetcher);
 const response=await fetcher(manifest.snapshot.simulation_path,{cache:'no-store'});
 if(!response.ok)throw Error('The player pool could not be loaded. Please retry.');
 const input=await response.json();
 if(String(input.slate_id)!==String(manifest.snapshot.slate_id)||!Array.isArray(input.players)||!Array.isArray(input.games))throw Error('The salary and projection snapshots do not match.');
 const ids=new Set();
 for(const p of input.players){if(!p.player_id||ids.has(p.player_id)||!SLOTS.includes(p.position)||!Number.isInteger(p.salary)||p.salary<=0||!Number.isFinite(p.final_projection))throw Error('The player pool contains invalid records.');ids.add(p.player_id);}
 return {manifest,input,players:input.players.map(p=>({...p,mean:p.final_projection})),state:snapshotState(manifest.snapshot,manifest.attempt)};
}
export function validateRoster(roster,players,{complete=false}={}){
 if(!Array.isArray(roster)||roster.length!==9)throw Error('A lineup must contain nine roster slots.');
 const filled=roster.filter(Boolean);
 if(new Set(filled).size!==filled.length)throw Error('A player can only occupy one slot.');
 roster.forEach((id,i)=>{if(!id)return;const p=players.find(p=>p.player_id===id);if(!p)throw Error('A saved player is missing from this slate.');if(!eligible(p.position,SLOTS[i]))throw Error('A player is in an ineligible slot.');if(p.active===false)throw Error(`${p.player_name} is unavailable in this salary pool.`);});
 if(salaryUsed(roster,players)>50000)throw Error('The lineup exceeds the $50,000 salary cap.');
 if(complete&&(filled.length!==9||new Set(filled.map(id=>players.find(p=>p.player_id===id).team)).size<2))throw Error('Select nine eligible players from at least two teams.');
 return roster;
}
export function filterPool(players,filters){
 const numeric=(v)=>v===''||v==null?null:Number(v);
 return players.filter(p=>(!filters.search||`${p.player_name} ${p.team}`.toLowerCase().includes(filters.search.toLowerCase()))&&(!filters.position||p.position===filters.position)&&(!filters.team||p.team===filters.team)&&(!filters.game||p.game_id===filters.game)&&(!filters.availability||(filters.availability==='available'?p.active!==false:p.active===false))&&['salary','projection'].every(key=>{const value=key==='salary'?p.salary:p.final_projection,min=numeric(filters['min'+key]),max=numeric(filters['max'+key]);return(min===null||value>=min)&&(max===null||value<=max);})).sort((a,b)=>{const key=filters.sort||'projection',value=p=>key==='value'?p.final_projection/(p.salary/1000):key==='projection'?p.final_projection:p[key];return(value(b)??-Infinity)-(value(a)??-Infinity)||a.player_name.localeCompare(b.player_name);});
}
const LIBRARY='drlocks-saved-lineups-v1';
export function readLineups(storage=localStorage){const records=JSON.parse(storage.getItem(LIBRARY)||'[]');if(!Array.isArray(records))throw Error('Saved lineup library is unreadable.');return records;}
export function writeLineups(records,storage=localStorage){storage.setItem(LIBRARY,JSON.stringify(records));}
export function saveLineup(record,storage=localStorage){const records=readLineups(storage);records.unshift(record);writeLineups(records,storage);return record;}

export async function loadRecommendation(manifest,id,fetcher=fetch){
 const response=await fetcher(manifest.snapshot.lineups_path,{cache:'no-store'});
 if(!response.ok)throw Error('Recommendation snapshot unavailable.');
 const bundle=await response.json(),lineup=bundle.lineups?.find(l=>l.id===id);
 if(!lineup)throw Error('Recommendation not found in the current snapshot.');
 return lineup;
}
