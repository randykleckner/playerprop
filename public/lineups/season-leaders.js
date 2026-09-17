import {esc} from '../research/highlights.js';
import {avatar} from '../ui/components.js';
const root=document.getElementById('season-leaders');
const metrics={passing_yards:'Passing yards',passing_tds:'Passing TDs',rushing_yards:'Rushing yards',rushing_tds:'Rushing TDs',receiving_yards:'Receiving yards',receptions:'Receptions'};
root.innerHTML='<h2>Season leaders · actual results</h2><p id="season-leader-status">Loading season statistics…</p><label>Statistic <select id="season-leader-metric">'+Object.entries(metrics).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')+'</select></label><div id="season-leader-rows" class="table-scroll"></div>';
try{const r=await fetch('/lineups/season-leaders.json',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();
 document.getElementById('season-leader-status').textContent=`${d.season} regular season · through Week ${d.through_week} · NFLverse actuals · league-wide, independent of selected salary slate${Date.now()-Date.parse(d.fetched_at)>48*3600000?' · Update overdue':''}`;
 const select=document.getElementById('season-leader-metric');const render=()=>{const metric=select.value;const rows=d.players.filter(p=>Number.isFinite(p[metric])&&p[metric]>0).sort((a,b)=>b[metric]-a[metric]||a.player_name.localeCompare(b.player_name)).slice(0,10);
 document.getElementById('season-leader-rows').innerHTML=`<table class="lineup-table"><thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>${esc(metrics[metric])}</th></tr></thead><tbody>${rows.map((p,i)=>`<tr><td>${i+1}</td><td><div class="ui-player-cell">${avatar(p,'xs')}${esc(p.player_name)}</div></td><td>${esc(p.team)}</td><td>${p[metric].toLocaleString()}</td></tr>`).join('')}</tbody></table>`;};select.onchange=render;render();
}catch{document.getElementById('season-leader-status').textContent='Actual season statistics unavailable. Projected leaders above remain separate.';}
