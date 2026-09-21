// Versioned, inspectable research heuristic. Percentile scores are not win probabilities.
export const VALUE_CONFIG={version:'research-value-1',breakoutSalaryMultiplier:3,weights:{efficiency:.30,projection:.15,ceiling:.20,breakout:.20,opportunity:.15}};
export function salaryTrend(player,history,season,week){
 const points=history.filter(h=>h.season===season&&h.week<week).map(h=>({week:h.week,salary:h.players?.find(p=>p.player_id===player.player_id)?.salary})).filter(p=>Number.isFinite(p.salary)).sort((a,b)=>a.week-b.week);
 const previous=points.find(p=>p.week===week-1);return {salary_history:points,previous_salary:previous?.salary??null,salary_change:previous?player.salary-previous.salary:null};
}
export function productionGap(actual,expected){return Number.isFinite(actual)&&Number.isFinite(expected)?actual-expected:null;}
export function valueRows(rows,simulation){
 const outcomes=new Map((simulation?.players||[]).map(p=>[p.player_id,p]));
 const enriched=rows.map(p=>{const s=outcomes.get(p.player_id);return {...p,mean:s?.mean??null,median:s?.median??null,floor:s?.p25??null,ceiling:s?.p90??null,p75:s?.p75??null,p90:s?.p90??null,breakout:s?.probability_3x??null,opportunity:Number.isFinite(p.projected_targets)&&Number.isFinite(p.projected_carries)?p.projected_targets+p.projected_carries:null};});
 return enriched.map(p=>{
  const peers=enriched.filter(q=>q.position===p.position&&q.active!==false),values={efficiency:p.points_per_1k,projection:p.projection,ceiling:p.ceiling,breakout:p.breakout,opportunity:p.opportunity},keys={efficiency:'points_per_1k',projection:'projection',ceiling:'ceiling',breakout:'breakout',opportunity:'opportunity'},components={};let weight=0,total=0;
  for(const [key,w] of Object.entries(VALUE_CONFIG.weights)){const numbers=peers.map(q=>q[keys[key]]).filter(Number.isFinite);if(!Number.isFinite(values[key])||numbers.length<2)continue;const score=100*(numbers.filter(v=>v<values[key]).length+.5*numbers.filter(v=>v===values[key]).length)/numbers.length;components[key]={score,weight:w,input:values[key]};weight+=w;total+=score*w;}
  const reasons=[];if(p.points_per_1k!=null)reasons.push(`${p.points_per_1k.toFixed(2)} projected points per $1,000`);if(p.salary_change<0)reasons.push(`Salary down $${Math.abs(p.salary_change)} from the previous archived week`);if(p.breakout!=null)reasons.push(`${p.breakout.toFixed(1)}% of simulated outcomes exceed 3× salary`);if(p.projected_targets>0)reasons.push(`${p.projected_targets.toFixed(1)} projected targets`);
  return {...p,value_score:p.active===false?null:weight?total/weight:null,value_components:components,value_coverage:weight,reasons};
 });
}
