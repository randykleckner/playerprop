import {escapeHtml as esc} from '../newsroom/shared.js';
const date=t=>t?new Date(t).toLocaleString():'Not recorded';
async function load(){try{
 const r=await fetch('/data-health/latest.json',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();
 document.getElementById('health-status').textContent='Last health check: '+date(d.generated_at);
 document.getElementById('health-table').innerHTML='<table><thead><tr><th>Source</th><th>Status</th><th>Last attempt</th><th>Last successful capture</th><th>Records</th><th>Detail</th></tr></thead><tbody>'+d.sources.map(s=>{
 const stale=s.last_success&&(Date.now()-Date.parse(s.last_success))/3600000>s.max_age_hours;
 return `<tr><th>${esc(s.source)}</th><td>${esc(s.status==='CURRENT'&&stale?'STALE':s.status)}</td><td>${esc(date(s.last_attempt))}</td><td>${esc(date(s.last_success))}</td><td>${esc(s.record_count)}</td><td>${esc(s.error||'—')}</td></tr>`;
 }).join('')+'</tbody></table>';
 document.getElementById('health-notes').textContent=d.limitations.join(' ');
 }catch{document.getElementById('health-status').textContent='ERROR · Data health snapshot unavailable. Last displayed records retained.';}}
load();setInterval(load,60000);
