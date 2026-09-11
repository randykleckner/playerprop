import {esc,money,decimal,option,avatar} from '../ui/components.js?v=ui-polish-2';
import {loadBuilderData,loadRecommendation,filterPool,validateRoster,readLineups,saveLineup} from '../ui/dfs-service.js';
import {SLOTS,addPlayer,salaryUsed,eligible} from '../simulation/workbench.js';
import {snapshotState} from '../research/readiness.js';
const $=id=>document.getElementById(id);
let data,roster=Array(9).fill(null),locks=new Set(),excluded=new Set(),position='',replaceSlot=null,worker=null;
const filterIds=['search','team','game','sort','minsalary','maxsalary','minprojection','maxprojection','availability'];
function tell(message,error=false){$('feedback').textContent=message;$('feedback').dataset.error=String(error);}
function currentState(){return snapshotState(data.manifest.snapshot,data.manifest.attempt);}
function freshness(){const s=currentState();$('freshness').dataset.state=s.state;$('freshness').textContent=s.locked?'Slate locked':s.state==='FAILED'?'Refresh failed · Showing saved data':s.freshness==='STALE'?'Data needs refreshing':s.state==='AGING'?'Data update due':'Data up to date';$('freshness').title=`DraftKings salaries + ESPN projections · ${new Date(data.input.data_as_of).toLocaleString()}`;$('generate').disabled=!!worker||s.locked;}
function filters(){return Object.fromEntries([...filterIds.map(id=>[id,$(id).value]),['position',position]]);}
function storeDraft(){try{localStorage.setItem('dfs-roster:'+data.input.slate_id,JSON.stringify(roster));}catch{tell('Changes are in memory; browser storage is unavailable.',true);}}
function renderPool(){
 const players=filterPool(data.players,filters());$('player-count').textContent=`${players.length} / ${data.players.length}`;
 $('players').innerHTML=players.map(p=>{const selected=roster.includes(p.player_id),blocked=p.active===false||excluded.has(p.player_id),ineligible=replaceSlot!==null&&!eligible(p.position,SLOTS[replaceSlot]);return `<tr class="${selected?'selected':blocked?'unavailable':''}"><td><div class="ui-player-cell">${avatar(p)}<span class="ui-player-name">${esc(p.player_name)}<span class="ui-player-meta">${esc(p.position)} · ${esc(p.team)} @ ${esc(p.opponent)}${p.active===false?' · Unavailable':excluded.has(p.player_id)?' · Excluded':''}</span></span></div></td><td>${money(p.salary)}</td><td><strong>${decimal(p.final_projection)}</strong></td><td>${decimal(p.final_projection/(p.salary/1000))}</td><td><button class="ui-add" data-add="${esc(p.player_id)}" aria-label="Add ${esc(p.player_name)}" ${selected||blocked||ineligible||worker?'disabled':''}>${selected?'✓':'+'}</button> <button class="ui-icon-button" data-exclude="${esc(p.player_id)}" aria-pressed="${excluded.has(p.player_id)}" aria-label="${excluded.has(p.player_id)?'Include':'Exclude'} ${esc(p.player_name)}" ${selected||worker?'disabled':''}>${excluded.has(p.player_id)?'↶':'×'}</button></td></tr>`;}).join('')||'<tr><td colspan="5" class="ui-empty">No players match these filters. Try resetting the filters.</td></tr>';
}
function render(){
 const picked=roster.map(id=>data.players.find(p=>p.player_id===id)),used=salaryUsed(roster,data.players),points=picked.reduce((sum,p)=>sum+(p?.final_projection||0),0);
 $('metrics').innerHTML=[['Salary used',money(used)],['Remaining',money(50000-used),'positive'],['Projection',decimal(points)]].map(([label,value,tone])=>`<div class="ui-metric"><span>${label}</span><strong class="${tone||''}">${value}</strong></div>`).join('');
 $('roster-count').textContent=`${picked.filter(Boolean).length} / 9`;
 $('roster').innerHTML=SLOTS.map((slot,i)=>{const p=picked[i];return `<div class="ui-slot ${replaceSlot===i?'ui-replacing':''}"><span class="ui-slot-label">${slot}</span>${p?`<div class="ui-roster-player">${avatar(p)}<div><span class="ui-slot-name">${esc(p.player_name)}</span><span class="ui-slot-meta">${esc(p.team)} · ${money(p.salary)} · ${decimal(p.final_projection)} pts</span></div></div><div class="ui-slot-actions"><button class="ui-icon-button" data-lock="${esc(p.player_id)}" aria-pressed="${locks.has(p.player_id)}" aria-label="${locks.has(p.player_id)?'Unlock':'Lock'} ${esc(p.player_name)}">${locks.has(p.player_id)?'●':'○'}</button><button class="ui-icon-button" data-replace="${i}" aria-label="Replace ${esc(p.player_name)}">↔</button><button class="ui-icon-button" data-remove="${i}" aria-label="Remove ${esc(p.player_name)}">×</button></div>`:`<button class="ui-empty-slot" data-replace="${i}">+ Add ${slot==='FLEX'?'flex player':slot}</button>`}</div>`;}).join('');
 for(const [id,set,label] of [['locks',locks,'No locked players.'],['exclusions',excluded,'No exclusions.']])$(id).innerHTML=[...set].map(pid=>`<div>${esc(data.players.find(p=>p.player_id===pid)?.player_name)}<button class="ui-icon-button" data-unset="${id}:${esc(pid)}" aria-label="Remove ${esc(data.players.find(p=>p.player_id===pid)?.player_name)} from ${id}">×</button></div>`).join('')||label;
 $('save').disabled=!!worker||picked.filter(Boolean).length!==9;
 renderPool();freshness();
}
function updatePosition(){ $('positions').innerHTML=['','QB','RB','WR','TE','DST'].map(p=>`<button data-position="${p}" aria-pressed="${position===p}">${p||'ALL'}</button>`).join(''); }
function acceptRoster(next){validateRoster(next,data.players);roster=next;locks=new Set([...locks].filter(id=>roster.includes(id)));replaceSlot=null;storeDraft();render();}
async function load(){
 $('retry').hidden=true;$('builder-content').hidden=true;
 try{
  data=await loadBuilderData();
  const params=new URLSearchParams(location.search),requested=params.get('slate');
  if(requested&&requested!==String(data.input.slate_id))throw Error('This link belongs to a different slate. Open Lineup Builder from the navigation for the current slate.');
  $('ui-context').innerHTML=`<span>${esc(data.input.season)} · Week ${esc(data.input.week)}</span><span class="ui-badge">Classic · ${esc(data.input.games.length)} games</span><span>DraftKings</span>`;
  $('team').innerHTML=option('','All teams')+[...new Set(data.players.map(p=>p.team))].sort().map(t=>option(t,t)).join('');
  $('game').innerHTML=option('','All games')+data.input.games.map(g=>option(g.game_id,`${g.away} @ ${g.home}`)).join('');
  let draft=null;
  try{draft=JSON.parse(localStorage.getItem('dfs-roster:'+data.input.slate_id)||'null');}catch{tell('Saved draft could not be read; starting an empty lineup.',true);}
  if(params.has('saved')){const record=readLineups().find(r=>r.id===params.get('saved'));if(!record||String(record.slate_id)!==String(data.input.slate_id))throw Error('Saved lineup does not belong to the current slate.');draft=record.roster;$('lineup-name').value=record.name;locks=new Set(record.locks||[]);}
  if(params.has('recommendation')){
   const lineup=await loadRecommendation(data.manifest,params.get('recommendation'));
   const stack=params.get('stack')==='1',ids=stack?lineup.required:lineup.players.map(p=>p.id);draft=Array(9).fill(null);
   for(const id of ids)draft=addPlayer(draft,id,data.players);
   if(stack)locks=new Set(ids);tell(stack?'Stack added and locked. Generate a lineup to fill the remaining slots.':'Recommendation loaded. Every slot is editable.');
  }
  roster=Array(9).fill(null);
  if(draft){try{validateRoster(draft,data.players);roster=draft;}catch(error){tell(`${error.message} Saved content was not changed; starting an empty draft.`,true);locks.clear();}}
  locks=new Set([...locks].filter(id=>roster.includes(id)));
  updatePosition();render();$('builder-content').hidden=false;
 }catch(error){$('freshness').textContent=error.message;$('freshness').dataset.state='FAILED';$('retry').hidden=false;}
}
$('retry').onclick=load;
let searchTimer;
for(const id of filterIds)$(id).addEventListener('input',()=>{clearTimeout(searchTimer);if(id==='search')searchTimer=setTimeout(renderPool,120);else renderPool();});
$('positions').onclick=e=>{const button=e.target.closest('[data-position]');if(!button)return;position=button.dataset.position;updatePosition();renderPool();};
$('reset-filters').onclick=()=>{filterIds.forEach(id=>$(id).value=id==='sort'?'projection':'');position='';updatePosition();renderPool();};
$('players').onclick=e=>{if(worker)return;const add=e.target.closest('[data-add]'),exclude=e.target.closest('[data-exclude]');try{if(add){const id=add.dataset.add;if(replaceSlot===null)acceptRoster(addPlayer(roster,id,data.players));else{const next=[...roster];next[replaceSlot]=id;acceptRoster(next);}tell('Player added to your lineup.');}if(exclude){const id=exclude.dataset.exclude;excluded.has(id)?excluded.delete(id):excluded.add(id);render();}}catch(error){tell(error.message,true);}};
$('roster').onclick=e=>{if(worker)return;const remove=e.target.closest('[data-remove]'),lock=e.target.closest('[data-lock]'),replace=e.target.closest('[data-replace]');if(remove){const next=[...roster];next[Number(remove.dataset.remove)]=null;acceptRoster(next);}if(lock){const id=lock.dataset.lock;locks.has(id)?locks.delete(id):locks.add(id);render();}if(replace){replaceSlot=Number(replace.dataset.replace);position=SLOTS[replaceSlot]==='FLEX'?'':SLOTS[replaceSlot];updatePosition();render();$('search').focus();tell(`Choose a player for ${SLOTS[replaceSlot]}. Your existing player stays until a valid replacement is selected.`);}};
$('builder-content').addEventListener('click',e=>{if(worker)return;const button=e.target.closest('[data-unset]');if(!button)return;const [kind,id]=button.dataset.unset.split(':');(kind==='locks'?locks:excluded).delete(id);render();});
$('clear').onclick=()=>{if(worker)return;locks.clear();acceptRoster(Array(9).fill(null));tell('Lineup cleared.');};
function stop(){worker?.terminate();worker=null;$('cancel').hidden=true;$('generate').textContent='Generate lineup';render();}
$('cancel').onclick=()=>{stop();tell('Generation cancelled. Your lineup is unchanged.');};
$('generate').onclick=()=>{
 if(worker||currentState().locked)return;
 worker=new Worker('/builder/worker.js',{type:'module'});$('cancel').hidden=false;$('generate').textContent='Generating…';render();tell('Finding the highest projected lineup around your locks…');
 worker.onmessage=({data:message})=>{stop();try{if(message.error)throw Error(message.error);if(!message.result)throw Error('No valid lineup fits these locks and exclusions. Remove a constraint and try again.');const next=message.result.players.map(p=>p.id);validateRoster(next,data.players,{complete:true});acceptRoster(next);tell('Lineup generated. Salary cap, player uniqueness and position eligibility verified.');}catch(error){tell(error.message,true);}};
 worker.onerror=()=>{stop();tell('Generation failed. Please try again.',true);};
 worker.postMessage({players:data.players,required:[...locks],excluded:[...excluded]});
};
$('save').onclick=()=>{try{validateRoster(roster,data.players,{complete:true});saveLineup({id:crypto.randomUUID(),name:$('lineup-name').value.trim()||`Week ${data.input.week} lineup`,slate_id:data.input.slate_id,season:data.input.season,week:data.input.week,site:'DraftKings',contest:'Classic',roster:[...roster],locks:[...locks],players:roster.map(id=>data.players.find(p=>p.player_id===id)),salary:salaryUsed(roster,data.players),projection:roster.reduce((sum,id)=>sum+data.players.find(p=>p.player_id===id).final_projection,0),created_at:new Date().toISOString(),bundle:data.manifest.snapshot.bundle});tell('Lineup saved to this browser. Open Saved Lineups to load it again.');}catch(error){tell(`Could not save: ${error.message}`,true);}};
await load();
setInterval(()=>{if(data)freshness();},60000);
