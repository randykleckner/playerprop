export function snapshotState(snapshot,attempt={},now=Date.now()) {
 const expiry=Date.parse(snapshot?.expires_at),asOf=Date.parse(snapshot?.data_as_of);
 const locked=Number.isFinite(Date.parse(snapshot?.lock_time))&&now>=Date.parse(snapshot.lock_time);
 const age=Number.isFinite(asOf)?now-asOf:Infinity;
 const freshness=!Number.isFinite(expiry)||age<0||now>=expiry?'STALE':age>=12*3600000?'AGING':'CURRENT';
 return {state:attempt.error?'FAILED':freshness,freshness,locked,generated_at:snapshot?.generated_at,last_attempt_at:attempt.attempted_at,error:attempt.error||null};
}
export async function loadResearch(fetcher=fetch){
 const response=await fetcher('/research/latest.json',{cache:'no-store'});
 if(!response.ok)throw Error('Research refresh status unavailable');
 const manifest=await response.json();
 if(manifest.version!==1||!manifest.snapshot)throw Error(manifest.attempt?.error||'No usable research snapshot');
 return manifest;
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Date(value).toLocaleString('en-US',{timeZone:'America/Chicago',timeZoneName:'short'}):'Unavailable';
export function readinessHtml(manifest,now=Date.now()){
 const s=manifest.snapshot,state=snapshotState(s,manifest.attempt,now);
 return `<strong>${state.locked?'LOCKED · ':''}${state.state}</strong> · Research generated ${esc(date(s.generated_at))}<p>Oldest salary/projection capture ${esc(date(s.data_as_of))} · Expires ${esc(date(s.expires_at))}. Last refresh attempt ${esc(date(manifest.attempt?.attempted_at))}. ${state.error?`Last refresh failed: ${esc(state.error)}. Showing the last valid snapshot (${state.freshness}).`:''}</p><ul>${s.readiness.map(r=>`<li><strong>${esc(r.label)}</strong>: ${esc(r.detail)}${r.fetched_at?' · '+esc(date(r.fetched_at)):''}</li>`).join('')}</ul><a href="/research/">Identity review & exclusion report</a>`;
}
