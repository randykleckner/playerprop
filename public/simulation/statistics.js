export function quantile(sorted,p){if(!sorted.length)return null;const x=(sorted.length-1)*p,i=Math.floor(x);return sorted[i]+(sorted[Math.min(i+1,sorted.length-1)]-sorted[i])*(x-i);}
export function summarize(draws,{salary=null,projection=null,thresholds=[]}={}) {
  const sorted=Array.from(draws).sort((a,b)=>a-b),n=sorted.length;
  if(!n)throw Error('No draws');
  const mean=sorted.reduce((a,b)=>a+b,0)/n,stddev=Math.sqrt(sorted.reduce((a,b)=>a+(b-mean)**2,0)/n);
  const prob=threshold=>100*sorted.filter(v=>v>threshold).length/n;
  const min=sorted[0],max=sorted[n-1],width=(max-min)/20||1;
  const histogram=Array.from({length:20},(_,i)=>({from:min+i*width,to:min+(i+1)*width,count:0}));
  for(const value of sorted)histogram[Math.min(19,Math.floor((value-min)/width))].count++;
  return {simulation_count:n,mean,median:quantile(sorted,.5),stddev,p10:quantile(sorted,.1),p25:quantile(sorted,.25),p50:quantile(sorted,.5),p75:quantile(sorted,.75),p90:quantile(sorted,.9),p95:quantile(sorted,.95),min,max,
    probability_exceed_projection:typeof projection==='number'?prob(projection):null,
    probability_2x:salary?prob(2*salary/1000):null,probability_3x:salary?prob(3*salary/1000):null,probability_4x:salary?prob(4*salary/1000):null,
    probabilities:Object.fromEntries(thresholds.map(t=>[t,prob(t)])),histogram};
}
export function correlation(x,y){const n=x.length,mx=x.reduce((a,b)=>a+b,0)/n,my=y.reduce((a,b)=>a+b,0)/n;let a=0,b=0,c=0;for(let i=0;i<n;i++){a+=(x[i]-mx)*(y[i]-my);b+=(x[i]-mx)**2;c+=(y[i]-my)**2;}return b*c?a/Math.sqrt(b*c):0;}
export function compareRuns(baseline,scenario){
  if(baseline.slate_id!==scenario.slate_id || baseline.input_fingerprint!==scenario.input_fingerprint)throw Error('Compare runs from the same source slate');
  const before=new Map(baseline.players.map(p=>[p.player_id,p]));
  return {baseline_run_id:baseline.run_id,scenario_run_id:scenario.run_id,same_seed:baseline.seed===scenario.seed,
    players:scenario.players.map(p=>{const b=before.get(p.player_id);return {player_id:p.player_id,player_name:p.player_name,mean_delta:p.mean-b.mean,p90_delta:p.p90-b.p90,probability_3x_before:b.probability_3x,probability_3x_after:p.probability_3x,targets_delta:p.mean_targets-b.mean_targets,carries_delta:p.mean_carries-b.mean_carries};}),
    teams:scenario.teams.map(t=>{const b=baseline.teams.find(b=>b.team===t.team);return {team:t.team,pass_rate_delta:t.pass_rate-b.pass_rate,plays_delta:t.mean_plays-b.mean_plays};})};
}
export function calibrationReport(cases,{trainingWindow,evaluationWindow}={}) {
  if(!trainingWindow||!evaluationWindow||trainingWindow.end>=evaluationWindow.start)throw Error('Disjoint training and evaluation windows required');
  if(!cases.length)throw Error('No held-out observations');
  for(const window of [trainingWindow,evaluationWindow])if(!Number.isFinite(Date.parse(window.start))||!Number.isFinite(Date.parse(window.end))||window.start>window.end)throw Error('Invalid validation window');
  const seen=new Set();for(const r of cases){
    if(!r.player_id||!r.game_id||!['QB','RB','WR','TE','DST'].includes(r.position)||['mean','actual','p10','p90','stddev'].some(k=>!Number.isFinite(r[k]))||r.stddev<=0||r.p10>r.p90)throw Error('Invalid held-out observation');
    if(!Number.isFinite(Date.parse(r.game_date))||!Number.isFinite(Date.parse(r.pregame_as_of))||Date.parse(r.pregame_as_of)>=Date.parse(r.game_date)||r.game_date<evaluationWindow.start||r.game_date>evaluationWindow.end)throw Error('Observation outside held-out window or projection not pregame');
    const key=r.player_id+'|'+r.game_id;if(seen.has(key))throw Error('Duplicate held-out observation');seen.add(key);
  }
  const metrics=rows=>({count:rows.length,mae:rows.reduce((s,r)=>s+Math.abs(r.mean-r.actual),0)/rows.length,above_p90_pct:100*rows.filter(r=>r.actual>r.p90).length/rows.length,below_p10_pct:100*rows.filter(r=>r.actual<r.p10).length/rows.length,mean_squared_standardized_error:rows.reduce((s,r)=>s+(r.actual-r.mean)**2/Math.max(r.stddev**2,1e-9),0)/rows.length});
  return {trainingWindow,evaluationWindow,overall:metrics(cases),by_position:Object.fromEntries([...new Set(cases.map(r=>r.position))].map(p=>[p,metrics(cases.filter(r=>r.position===p))]))};
}
