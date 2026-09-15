import {metrics,leaders,esc,stamp} from '../research/highlights.js';
import {newsIcon} from '../newsroom/shared.js';
let snapshot,request=0;
const root=document.getElementById('stat-leaders');
root.innerHTML='<h2>Projected stat leaders</h2><p id="leaders-context" role="status">Loading selected slate…</p><div class="highlight-toolbar"><label>Rank by <select id="leaders-metric"></select></label><label>Position <select id="leaders-position">'+['ALL','QB','RB','WR','TE','DST'].map(p=>`<option>${p}</option>`).join('')+'</select></label></div><div id="leaders-table"></div>';
const metric=document.getElementById('leaders-metric'),position=document.getElementById('leaders-position');
metric.innerHTML=Object.entries(metrics).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
function render(){
 const rows=leaders(snapshot?.players,metric.value,position.value);
 document.getElementById('leaders-table').innerHTML=rows.length?`<div class="table-scroll"><table class="lineup-table"><thead><tr><th>Rank</th><th>Player</th><th>Matchup</th><th>Salary</th><th>${esc(metrics[metric.value].label)}</th></tr></thead><tbody>${rows.map((p,i)=>`<tr><td>${i+1}</td><td><strong>${esc(p.player_name)}</strong>${newsIcon(p.player_id,p.player_name)} · ${esc(p.position)}</td><td>${esc(p.team)} vs ${esc(p.opponent||'—')}</td><td>${Number.isFinite(p.salary)?'$'+p.salary.toLocaleString():'—'}</td><td><strong>${p.value.toFixed(2)}</strong></td></tr>`).join('')}</tbody></table></div>`:'<p>No eligible players with this projected statistic in the selected snapshot.</p>';
}
metric.onchange=position.onchange=render;
export async function loadLeaders(bundle,slate){
 const id=++request;snapshot=null;render();
 document.getElementById('leaders-context').textContent='Loading selected slate…';
 try{
  if(!bundle||!/^[a-f0-9]+$/.test(bundle))throw Error();
  const r=await fetch(`/research/bundles/${bundle}/simulation.json`);if(!r.ok)throw Error();const data=await r.json();
  if(id!==request)return;
  if(String(data.slate_id)!==String(slate)||!Array.isArray(data.players))throw Error();
  snapshot=data;
  document.getElementById('leaders-context').textContent=`${data.season} · Week ${data.week} · ${Date.now()>=Date.parse(data.expires_at)?'Saved / expired projections':'Pregame projections'} · captured ${stamp(data.data_as_of)}. Top 10 in this salary pool, not season actuals. ESPN projections; availability is limited to the saved salary status.`;render();
 }catch{if(id===request)document.getElementById('leaders-context').textContent='Leaders unavailable for this saved build. Recommendations are still available above.';}
}
