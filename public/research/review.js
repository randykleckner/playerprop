import {newsIcon} from '../newsroom/shared.js';
import {loadResearch,readinessHtml} from './readiness.js';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function evidenceHtml(e){
 if(!e)return 'Evidence report unavailable';
 const c=e.canonical_evidence,r=e.context_review;
 const links=(r?.sources||[]).filter(url=>/^https:\/\//.test(url)).map(url=>`<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(new URL(url).hostname)}</a></li>`).join('');
 return `<details><summary>${esc(e.priority.replaceAll('_',' '))}</summary><p>${esc(e.reasons.join(', ')||'Catalog and crosswalk corroborate the candidate; DK bridge still needed.')}</p><p>Canonical: ${esc(c?.display_name)} · GSIS ${esc(c?.player_id)} · ESPN ${esc(c?.espn_id)} · ${esc(c?.position)} · ${esc(c?.current_team_id)}</p><p>Crosswalk: ${esc(JSON.stringify(e.crosswalk_evidence))}</p>${r?`<p>${esc(r.finding)}</p><p>Reviewed ${esc(r.reviewed_on)} by ${esc(r.reviewer)} · ${esc(r.review_id)}</p><ul>${links}</ul>`:''}<p>${esc(e.required_evidence)}</p></details>`;
}
try{
 const manifest=await loadResearch();$('readiness').innerHTML=readinessHtml(manifest);
 const [report,input]=await Promise.all([manifest.snapshot.identities_path,manifest.snapshot.simulation_path].map(async path=>{const response=await fetch(path);if(!response.ok)throw Error('Evidence snapshot unavailable');return response.json();}));
 const eligible=new Set(input.players.map(p=>p.draftable_id)),rank={identity_conflict:0,unresolved:1,context_discrepancy:2,bridge_needed:3};
 const render=()=>{
  const rows=report.rows.filter(r=>(!$('filter').value||r.confidence===$('filter').value)&&(!$('priority').value||r.priority===$('priority').value)&&(!$('eligible-only').checked||eligible.has(r.draftable_id))).sort((a,b)=>(rank[a.priority]??4)-(rank[b.priority]??4)||a.player_name.localeCompare(b.player_name));
  $('counts').textContent=`${rows.length} of ${report.rows.length} offensive salary entries · draft group ${report.slate_id}`;
  $('rows').innerHTML=rows.map(r=>`<tr><td>${esc(r.player_name)}${newsIcon(r.canonical_player_id,r.player_name)}</td><td>${esc(r.team)} ${esc(r.position)}</td><td>${esc(r.confidence.replaceAll('_',' '))}</td><td>${esc(JSON.stringify(r.external_ids))}</td><td>${esc(r.canonical_player_id||r.candidates.join(', ')||'No candidate')}</td><td>${r.tier_evidence?`<p>${esc(r.tier_evidence.tier.replaceAll('_',' '))}${r.tier_evidence.override_id?' · Override '+esc(r.tier_evidence.override_id):''}</p>`:''}${evidenceHtml(r.review_evidence)}</td></tr>`).join('');
 };
 for(const id of ['filter','priority','eligible-only'])$(id).onchange=render;
 render();$('sources').textContent=JSON.stringify(report.evidence_sources||{},null,2);
 $('exclusions').innerHTML=Object.entries(report.exclusions).map(([reason,count])=>`<li>${esc(reason.replaceAll('_',' '))}: ${count}</li>`).join('');
}catch(e){$('readiness').textContent=e.message;}
