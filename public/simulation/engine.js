import {DEFAULTS,MODEL_VERSION,ASSUMPTIONS} from './config.js';
import {random,allocate,fingerprint} from './random.js';
import {summarize} from './statistics.js';
import {optimize} from './optimizer.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const positions=['QB','RB','WR','TE','DST'];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const sum=(rows,key)=>rows.reduce((s,p)=>s+(p[key]||0),0);
const sessions=new WeakMap();
export function dkScore(s,position){
  if(position==='DST'){const pa=s.points_allowed;return s.sacks+2*s.interceptions+2*s.recoveries+6*s.defensive_tds+(pa===0?10:pa<=6?7:pa<=13?4:pa<=20?1:pa<=27?0:pa<=34?-1:-4);}
  return .04*s.passing_yards+4*s.passing_tds-s.interceptions+.1*s.rushing_yards+6*s.rushing_tds+.1*s.receiving_yards+6*s.receiving_tds+s.receptions- s.fumbles_lost+(s.passing_yards>=300?3:0)+(s.rushing_yards>=100?3:0)+(s.receiving_yards>=100?3:0);
}
function emptyStats(){return {pass_attempts:0,targets:0,carries:0,receptions:0,passing_yards:0,passing_tds:0,interceptions:0,rushing_yards:0,rushing_tds:0,receiving_yards:0,receiving_tds:0,fumbles_lost:0,sacks:0,recoveries:0,defensive_tds:0,points_allowed:0};}
export function validateInput(input){
  if(!input?.slate_id||!Array.isArray(input.games)||!input.games.length||!Array.isArray(input.players)||!input.players.length)throw Error('Slate, games and players required');
  if(input.players.length>1000||input.games.length>20)throw Error('Input size exceeds foundation limits');
  const games=new Map(),teams=new Set(),ids=new Set();
  for(const g of input.games){if(typeof g.game_id!=='string'||!g.game_id||games.has(g.game_id)||!g.home||!g.away||g.home===g.away||teams.has(g.home)||teams.has(g.away))throw Error('Duplicate or invalid game/team');games.set(g.game_id,g);teams.add(g.home);teams.add(g.away);for(const k of ['total','home_spread','home_implied_total','away_implied_total'])if(g[k]!=null&&!finite(g[k]))throw Error('Invalid game market');if(g.total!=null&&(g.total<10||g.total>100))throw Error('Invalid game total');if(Math.abs(g.home_spread??0)>50||['home_implied_total','away_implied_total'].some(k=>g[k]!=null&&(g[k]<0||g[k]>80)))throw Error('Invalid implied total or spread');}
  for(const p of input.players){const g=games.get(p.game_id);if(typeof p.player_id!=='string'||!p.player_id||ids.has(p.player_id)||!g||!positions.includes(p.position)||!Number.isInteger(p.salary)||p.salary<=0||!([g.home,g.away].includes(p.team))||p.opponent!==(p.team===g.home?g.away:g.home))throw Error('Invalid player identity, game, position or salary');ids.add(p.player_id);
    for(const [k,v]of Object.entries(p.inputs||{}))if(v!=null&&(!finite(v)||v<0))throw Error(`Invalid player input ${k}`);
    for(const k of ['catch_probability','completion_probability','rush_share','target_share','touchdown_probability'])if(p.inputs?.[k]>1)throw Error(`Probability/share out of range: ${k}`);
    if(p.projected_snap_share!=null&&(!finite(p.projected_snap_share)||p.projected_snap_share<0||p.projected_snap_share>1))throw Error('Snap share must be in [0,1]');
    if(p.final_projection!=null&&!finite(p.final_projection))throw Error('Invalid final projection');
  }
  return input;
}
export function applyOverrides(input,overrides=[]){
  const copy=structuredClone(input);validateInput(copy);if(!Array.isArray(overrides)||overrides.length>40)throw Error('At most 40 overrides');
  for(const o of overrides){
    if(o.target==='player'){
      const p=copy.players.find(p=>p.player_id===o.id);if(!p)throw Error('Unknown override player');p.inputs||={};
      if(o.parameter==='out'){if(typeof o.value!=='boolean')throw Error('OUT must be boolean');p.active=!o.value;continue;}
      if(p.position==='DST'||p.position==='QB'&&['target_share','target_share_delta'].includes(o.parameter))throw Error('This parameter is not modeled for this position');
      if(!finite(o.value))throw Error('Override must be numeric');
      if(o.parameter==='limited'){if(o.value<0||o.value>1)throw Error('Limited factor must be 0–1');p.workload_factor=o.value;}
      else if(o.parameter==='carries_multiplier'){if(o.value<0||o.value>3)throw Error('Carry multiplier must be 0–3');p.inputs.carries=(p.inputs.carries||0)*o.value;}
      else if(o.parameter==='target_share_delta'){if(Math.abs(o.value)>1)throw Error('Target-share change uses percentage-point fractions');p.target_share_delta=o.value;}
      else if(['rush_share','target_share','snap_share'].includes(o.parameter)){if(o.value<0||o.value>1)throw Error('Share must be 0–1');if(o.parameter==='snap_share'){p.workload_factor=o.value/Math.max(p.projected_snap_share??1,.05);p.projected_snap_share=o.value;}else {p.inputs[o.parameter]=o.value;p[`fixed_${o.parameter}`]=true;}}
      else throw Error('Unsupported player override');
    }else if(o.target==='game'){
      const g=copy.games.find(g=>g.game_id===o.id);if(!g||o.parameter!=='total'||!finite(o.value)||o.value<10||o.value>100)throw Error('Invalid game override');g.total=o.value;delete g.home_implied_total;delete g.away_implied_total;
    }else if(o.target==='team'){
      if(o.parameter!=='pass_rate'||!finite(o.value)||o.value<.1||o.value>.9||!copy.games.some(g=>[g.home,g.away].includes(o.id)))throw Error('Invalid pass-rate override');copy.team_overrides||={};copy.team_overrides[o.id]={pass_rate:o.value};
    }else throw Error('Unknown override target');
  }
  for(const g of copy.games)for(const team of [g.home,g.away])for(const kind of ['rush_share','target_share'])if(copy.players.filter(p=>p.team===team&&p.active!==false&&p[`fixed_${kind}`]).reduce((s,p)=>s+p.inputs[kind],0)>1+1e-9)throw Error('Fixed shares exceed team opportunity');
  return copy;
}
function weights(players,kind,base,residual){
  const share=kind==='carries'?'rush_share':'target_share';
  const values=players.map(p=>p.active===false?0:Math.max(0,((p.inputs?.[kind]??(p.inputs?.[share]!=null?p.inputs[share]*base:0))+(kind==='targets'?(p.target_share_delta||0)*base:0))*(p.workload_factor??1)));
  const fixed=players.reduce((s,p)=>s+(p.active!==false&&p[`fixed_${share}`]?p.inputs[share]:0),0);
  if(players.some(p=>p.active!==false&&p[`fixed_${share}`])){const free=values.reduce((s,v,i)=>s+(players[i][`fixed_${share}`]?0:v),0)+residual;for(let i=0;i<values.length;i++)values[i]=players[i].active===false?0:players[i][`fixed_${share}`]?players[i].inputs[share]*base:free?values[i]/free*(1-fixed)*base:0;residual=free?residual/free*(1-fixed)*base:(1-fixed)*base;}
  return [...values,residual];
}
function prepareTeam(input,team,c){
  const all=input.players.filter(p=>p.team===team&&p.position!=='DST');
  const receivers=all.filter(p=>['RB','WR','TE'].includes(p.position));const rushers=all;const qbs=all.filter(p=>p.position==='QB');
  const original=input.original_players||input.players;
  const originalTeam=original.filter(p=>p.team===team&&p.position!=='DST');
  const attempts=sum(originalTeam.map(p=>({v:p.inputs?.pass_attempts})), 'v')||c.defaultPlays*c.defaultPassRate;
  const carries=sum(originalTeam.map(p=>({v:p.inputs?.carries})), 'v')||c.defaultPlays*(1-c.defaultPassRate);
  const plays=clamp(attempts+carries,40,85),passRate=input.team_overrides?.[team]?.pass_rate??clamp(attempts/(attempts+carries),.25,.85);
  const targetResidual=Math.max(attempts*c.targetedPassFraction-sum(originalTeam.map(p=>({v:p.inputs?.targets})),'v'),attempts*.03);
  const carryResidual=Math.max(carries-sum(originalTeam.map(p=>({v:p.inputs?.carries})),'v'),carries*.03);
  const targetWeights=weights(receivers,'targets',attempts*c.targetedPassFraction,targetResidual),carryWeights=weights(rushers,'carries',carries,carryResidual);
  const qbWeights=qbs.map(p=>p.active===false?0:(p.inputs?.pass_attempts||0)*(p.workload_factor??1));
  const missingQbWeight=Math.max(0,attempts-qbWeights.reduce((a,b)=>a+b,0));
  qbWeights.push(qbWeights.some(v=>v>0)?missingQbWeight:1);
  const passingTds=qbs.reduce((s,p)=>s+(p.inputs?.passing_touchdowns||0),0),rushingTds=rushers.reduce((s,p)=>s+(p.inputs?.carries||0)*(p.inputs?.rushing_td_weight??.03),0);
  const passTdShare=passingTds+rushingTds>0?clamp(passingTds/(passingTds+rushingTds),.2,.9):c.passTdShare;
  const projectedPassingYards=qbs.reduce((s,p)=>s+(p.inputs?.pass_attempts||0)*(p.inputs?.passing_efficiency||0),0),projectedReceivingYards=receivers.reduce((s,p)=>s+(p.inputs?.targets||0)*(p.inputs?.catch_probability??c.defaultCatchProbability)*(p.inputs?.receiving_efficiency??c.defaultYardsPerCatch),0)+targetResidual*c.defaultCatchProbability*c.defaultYardsPerCatch;
  const passingEfficiencyScale=projectedPassingYards>0?clamp(projectedPassingYards/projectedReceivingYards,.7,1.3):1;
  return {team,all,receivers,rushers,qbs,plays,passRate,targetWeights,carryWeights,qbWeights,passTdShare,passingEfficiencyScale};
}
export function validateLineup(lineup,players){
  const ids=lineup.map(p=>typeof p==='string'?p:p.player_id);if(ids.length!==9||new Set(ids).size!==9)throw Error('Lineup must have 9 unique players');
  const rows=ids.map(id=>players.find(p=>p.player_id===id));if(rows.some(p=>!p||p.active===false))throw Error('Unknown or inactive lineup player');
  const counts=Object.fromEntries(positions.map(pos=>[pos,rows.filter(p=>p.position===pos).length]));
  if(sum(rows,'salary')>50000||counts.QB!==1||counts.DST!==1||counts.RB<2||counts.WR<3||counts.TE<1||counts.RB+counts.WR+counts.TE!==7||new Set(rows.map(p=>p.team)).size<2)throw Error('Illegal Classic lineup: cap, positions, FLEX or teams');return rows;
}
export function identifyStacks(players,{maxStacks=DEFAULTS.maxStacks}={}){
  const stacks=[];const add=(type,rows)=>{stacks.push({id:rows.map(p=>p.player_id).join('+'),type,player_ids:rows.map(p=>p.player_id),qb:rows[0].player_id,team:rows[0].team,opponent:rows[0].opponent,label:rows.map(p=>p.player_name).join(' + ')});};
  for(const qb of players.filter(p=>p.position==='QB'&&p.active!==false&&(p.inputs?.pass_attempts||0)>5).sort((a,b)=>(b.final_projection||0)-(a.final_projection||0))){
    const catches=players.filter(p=>p.team===qb.team&&['WR','TE'].includes(p.position)&&p.active!==false).sort((a,b)=>(b.inputs?.targets||0)-(a.inputs?.targets||0)).slice(0,4);
    for(const p of catches)add(`QB+${p.position}`,[qb,p]);
    for(let i=0;i<catches.length;i++)for(let j=i+1;j<catches.length;j++)if(catches[i].position==='WR'||catches[j].position==='WR')add(catches[i].position===catches[j].position?'QB+WR+WR':'QB+WR+TE',[qb,catches[i],catches[j]]);
    const opposing=players.filter(p=>p.team===qb.opponent&&['WR','TE'].includes(p.position)&&p.active!==false).sort((a,b)=>(b.inputs?.targets||0)-(a.inputs?.targets||0)).slice(0,2);
    for(const p of catches.slice(0,2))for(const o of opposing)add('QB+catcher+opponent',[qb,p,o]);
  }
  // Round-robin across quarterbacks and stack types so early teams cannot consume the entire budget.
  const groups=[...new Set(stacks.map(s=>s.qb))].map(qb=>{const group=stacks.filter(s=>s.qb===qb),types=[...new Set(group.map(s=>s.type))];return [...types.map(t=>group.find(s=>s.type===t)),...group.filter(s=>!types.some(t=>group.find(x=>x.type===t)===s))];});
  const selected=[];for(let i=0;selected.length<maxStacks&&groups.some(g=>g[i]);i++)for(const group of groups)if(group[i]&&selected.length<maxStacks)selected.push(group[i]);return selected;
}
function combined(ids,draws,count){const result=new Float32Array(count);for(const id of ids){const values=draws.get(id);if(!values)throw Error('Unknown outcome player');for(let i=0;i<count;i++)result[i]+=values[i];}return result;}
export function simulateLineup(lineup,result,{thresholds=DEFAULTS.lineupThresholds}={}){const session=sessions.get(result);if(!session)throw Error('Draws are temporary; rerun with retainDraws or supply lineup before execution');const rows=validateLineup(lineup,session.input.players);return {player_ids:rows.map(p=>p.player_id),salary:sum(rows,'salary'),...summarize(combined(rows.map(p=>p.player_id),session.draws,result.simulation_count),{thresholds})};}
export function releaseDraws(result){sessions.delete(result);}
export function runSlateSimulation(source,count,seed,options={}){
  validateInput(source);if(!['string','number'].includes(typeof seed)||String(seed).length>128)throw Error('A seed of at most 128 characters is required');
  const c={...DEFAULTS,...options.configuration,modes:{...DEFAULTS.modes,...options.configuration?.modes}};
  if(!Number.isInteger(count)||count<1||count>Math.min(DEFAULTS.maxSimulations,c.maxSimulations))throw Error(`Simulation count must be 1–${c.maxSimulations}`);
  for(const k of ['environmentSigma','paceSigma','teamEfficiencySigma','playerEfficiencySigma'])if(!finite(c[k])||c[k]<0||c[k]>.8)throw Error('Invalid factor loading');
  if(!Number.isInteger(c.maxStacks)||c.maxStacks<0||c.maxStacks>500||!Number.isInteger(c.maxCandidates)||c.maxCandidates<0||c.maxCandidates>12)throw Error('Invalid result limits');
  for(const k of ['lineupThresholds','stackThresholds'])if(!Array.isArray(c[k])||c[k].length>30||c[k].some(v=>!finite(v)))throw Error('Invalid thresholds');
  for(const [k,v] of Object.entries(c))if(typeof DEFAULTS[k]==='number'&&(!finite(v)||v<0&&k!=='defaultSpread'||Math.abs(v)>200000))throw Error('Invalid configuration');
  for(const k of ['targetedPassFraction','defaultPassRate','defaultCatchProbability','passTdShare','defaultInterceptionRate'])if(c[k]>1)throw Error('Invalid probability');
  const bounds={referenceTotal:[10,100],defaultSpread:[-50,50],defaultPlays:[30,105],fieldGoals:[0,6],defaultYardsPerCatch:[0,40],defaultRushEfficiency:[0,20],scriptSigma:[0,30],trailingPassRatePerPoint:[0,.03],leadingPlaysPerPoint:[0,1],receivingYardsSdPerCatch:[0,30],rushingYardsSdPerCarry:[0,15],defaultSacks:[0,10],defaultRecoveries:[0,5]};
  for(const [k,[lo,hi]] of Object.entries(bounds))if(c[k]<lo||c[k]>hi)throw Error(`Configuration ${k} outside supported range`);
  const input=applyOverrides(source,options.overrides||[]);input.players.sort((a,b)=>a.player_id.localeCompare(b.player_id));input.games.sort((a,b)=>a.game_id.localeCompare(b.game_id));input.original_players=source.players;
  const draws=new Map(input.players.map(p=>[p.player_id,new Float32Array(count)]));const totals=new Map(input.players.map(p=>[p.player_id,{targets:0,carries:0,receptions:0}]));
  const teamTotals=new Map();const prepared=new Map(input.games.flatMap(g=>[g.home,g.away]).map(t=>[t,prepareTeam(input,t,c)]));
  for(const game of input.games){
    const gamePlayers=input.players.filter(p=>p.game_id===game.game_id);
    const rng=random(`${seed}|${game.game_id}`),total=game.total??c.referenceTotal,spread=game.home_spread??c.defaultSpread;
    const implied={ [game.home]:game.home_implied_total??(total-spread)/2,[game.away]:game.away_implied_total??(total+spread)/2 };
    for(let iteration=0;iteration<count;iteration++){
      const environment=rng.lognormal(c.environmentSigma),pace=rng.lognormal(c.paceSigma),homeLead=-spread+c.scriptSigma*rng.normal();
      const outcomes={};const playerStats=new Map();
      for(const team of [game.home,game.away]){
        const t=prepared.get(team),lead=team===game.home?homeLead:-homeLead,efficiency=rng.lognormal(c.teamEfficiencySigma)*environment;
        const plays=Math.round(clamp(t.plays*pace*Math.pow(total/c.referenceTotal,.12)+lead*c.leadingPlaysPerPoint,30,105));
        const passRate=clamp(t.passRate-lead*c.trailingPassRatePerPoint,.15,.90),passAttempts=rng.binomial(plays,passRate),rushAttempts=plays-passAttempts;
        const qbCounts=allocate(passAttempts,t.qbWeights,rng);const targets=allocate(rng.binomial(passAttempts,c.targetedPassFraction),t.targetWeights,rng);const carries=allocate(rushAttempts,t.carryWeights,rng);
        const qbCompletion=t.qbs.reduce((s,p,i)=>s+(p.inputs?.completion_probability??c.defaultCatchProbability)*qbCounts[i],qbCounts.at(-1)*c.defaultCatchProbability)/Math.max(1,passAttempts);
        const recStats=[],rushStats=[];
        for(let i=0;i<targets.length;i++){
          const p=t.receivers[i],st=p?(playerStats.get(p.player_id)||emptyStats()):emptyStats();
          const probability=clamp((p?.inputs?.catch_probability??c.defaultCatchProbability)*(qbCompletion/Math.max(.001,c.defaultCatchProbability)),0,.99);
          st.targets=targets[i];st.receptions=rng.binomial(st.targets,probability);
          const yardsPerCatch=p?.inputs?.receiving_efficiency??c.defaultYardsPerCatch;
          st.receiving_yards=Math.max(0,Math.round(st.receptions*yardsPerCatch*t.passingEfficiencyScale*efficiency*rng.lognormal(c.playerEfficiencySigma)+rng.normal()*c.receivingYardsSdPerCatch*Math.sqrt(st.receptions)));
          if(p)playerStats.set(p.player_id,st);recStats.push(st);
        }
        for(let i=0;i<carries.length;i++){
          const p=t.rushers[i],st=p?(playerStats.get(p.player_id)||emptyStats()):emptyStats();st.carries=carries[i];
          st.rushing_yards=Math.max(0,Math.round(st.carries*(p?.inputs?.rushing_efficiency??c.defaultRushEfficiency)*efficiency*rng.lognormal(c.playerEfficiencySigma)+rng.normal()*c.rushingYardsSdPerCarry*Math.sqrt(st.carries)));
          if(p)playerStats.set(p.player_id,st);rushStats.push(st);
        }
        const expectedTds=Math.max(.1,(implied[team]-3*c.fieldGoals)/7)*environment*rng.lognormal(c.teamEfficiencySigma);
        const touchdownEvents=rng.poisson(expectedTds);let passTds=0,rushTds=0;
        for(let td=0;td<touchdownEvents;td++){
          const passing=rng.uniform()<clamp(t.passTdShare+(passRate-t.passRate)*.5,.3,.85);
          const stats=passing?recStats:rushStats,ps=passing?t.receivers:t.rushers,key=passing?'receiving_tds':'rushing_tds';
          const weights=stats.map((st,i)=>Math.max(0,(passing?st.receptions:st.carries)-st[key])*(ps[i]?.inputs?.[passing?'receiving_td_weight':'rushing_td_weight']??(passing?.06:.03)));
          if(weights.some(v=>v>0)){const allocations=allocate(1,weights,rng);const i=allocations.indexOf(1);stats[i][key]++;if(passing)passTds++;else rushTds++;}
        }
        const receptions=sum(recStats,'receptions'),receivingYards=sum(recStats,'receiving_yards');
        const intRate=t.qbs.reduce((s,p,i)=>s+(p.inputs?.interceptions??c.defaultInterceptionRate*Math.max(p.inputs?.pass_attempts||0,1))*qbCounts[i]/Math.max(p.inputs?.pass_attempts||1,1),qbCounts.at(-1)*c.defaultInterceptionRate)/Math.max(passAttempts,1);
        const interceptions=rng.binomial(Math.max(0,passAttempts-receptions),clamp(intRate/Math.max(.15,1-c.defaultCatchProbability),0,.25));
        const qbYards=allocate(receivingYards,qbCounts,rng),qbTds=allocate(passTds,qbCounts,rng),qbInts=allocate(interceptions,qbCounts,rng);
        for(let i=0;i<t.qbs.length;i++){const p=t.qbs[i],st=playerStats.get(p.player_id)||emptyStats();st.pass_attempts=qbCounts[i];st.passing_yards=qbYards[i];st.passing_tds=qbTds[i];st.interceptions=qbInts[i];playerStats.set(p.player_id,st);}
        const points=7*(passTds+rushTds)+3*rng.poisson(c.fieldGoals*environment);
        outcomes[team]={plays,passAttempts,rushAttempts,targets:sum(recStats,'targets'),carries:sum(rushStats,'carries'),receptions,receivingYards,passingYards:qbYards.reduce((a,b)=>a+b,0),touchdowns:passTds+rushTds,passTds,rushTds,points,interceptions,script:lead};
        const aggregate=teamTotals.get(team)||{team,plays:0,passes:0,points:0};aggregate.plays+=plays;aggregate.passes+=passAttempts;aggregate.points+=points;teamTotals.set(team,aggregate);
      }
      for(const p of gamePlayers){
        let st=playerStats.get(p.player_id)||emptyStats();
        if(p.position==='DST'&&p.active!==false){const opponent=outcomes[p.opponent];st={...st,points_allowed:opponent.points,sacks:rng.poisson(c.defaultSacks*opponent.passAttempts/35/Math.sqrt(environment)),interceptions:opponent.interceptions,recoveries:rng.poisson(c.defaultRecoveries)};}
        if(p.position!=='DST')st.fumbles_lost=rng.binomial(st.receptions+st.carries+st.pass_attempts,Math.min(.1,p.inputs?.fumble_rate??.004));
        playerStats.set(p.player_id,st);
        const score=p.active===false?0:dkScore(st,p.position);draws.get(p.player_id)[iteration]=score;
        const acc=totals.get(p.player_id);for(const k of ['targets','carries','receptions'])acc[k]+=st[k];
      }
      if(options.onProgress&&iteration%1000===0)options.onProgress({game:input.games.indexOf(game),games:input.games.length,iteration,count});
      if(options.onDraw)options.onDraw({iteration,game_id:game.game_id,teams:outcomes,players:playerStats});
    }
  }
  const inputFingerprint=fingerprint(source),runId=`sim-${fingerprint([MODEL_VERSION,inputFingerprint,count,String(seed),options.overrides||[],c,options.lineups||[],options.stackPlayerIds||[],options.includeStacks!==false,options.generateCandidates!==false])}`;
  const players=input.players.map(p=>({...p,...summarize(draws.get(p.player_id),{salary:p.salary,projection:p.final_projection}),mean_targets:totals.get(p.player_id).targets/count,mean_carries:totals.get(p.player_id).carries/count,mean_receptions:totals.get(p.player_id).receptions/count}));
  const result={run_id:runId,slate_id:input.slate_id,model_version:MODEL_VERSION,input_fingerprint:inputFingerprint,simulation_count:count,seed:String(seed),data_as_of:input.data_as_of,configuration:c,overrides:options.overrides||[],assumptions:[...ASSUMPTIONS,...(input.assumptions||[])],sources:input.sources,players,teams:[...teamTotals.values()].map(t=>({team:t.team,mean_plays:t.plays/count,pass_rate:t.passes/t.plays,mean_points:t.points/count})),stacks:[],lineups:[],calibration_status:'uncalibrated'};
  const stackCandidates=identifyStacks(input.players,{maxStacks:c.maxStacks});
  if(options.includeStacks!==false)result.stacks=stackCandidates.map(stack=>{const salary=sum(stack.player_ids.map(id=>input.players.find(p=>p.player_id===id)),'salary');const stats=summarize(combined(stack.player_ids,draws,count),{thresholds:c.stackThresholds});return {...stack,salary,...stats,points_per_1k:stats.mean/(salary/1000)};});
  sessions.set(result,{draws,input});
  const pool=players.filter(p=>p.active!==false).map(p=>({...p,id:p.player_id,points:p.mean}));
  if(options.generateCandidates!==false){
    const specs=[['Median',p=>p.median,[]],['Floor',p=>p.p25,[]],['Ceiling',p=>p.p95,[]],['Value',p=>p.mean/(p.salary/1000),[]]];
    const fixed=options.stackPlayerIds||stackCandidates[0]?.player_ids;if(fixed)specs.push(['Stack',p=>p.mean,fixed]);
    const seen=new Set();
    for(const [strategy,score,required] of specs.slice(0,c.maxCandidates)){
      const excluded=[];let lineup=optimize(pool,{score,required,excluded});
      while(lineup&&seen.has(lineup.players.map(p=>p.id).sort().join('|'))){const change=lineup.players.filter(p=>!required.includes(p.id)).sort((a,b)=>b.salary-a.salary)[0];if(!change)break;excluded.push(change.id);lineup=optimize(pool,{score,required,excluded});}
      if(lineup){seen.add(lineup.players.map(p=>p.id).sort().join('|'));result.lineups.push({strategy,stack_description:required.length?required.map(id=>pool.find(p=>p.id===id)?.player_name).join(' + '):null,...simulateLineup(lineup.players.map(p=>p.id),result,{thresholds:c.lineupThresholds})});}
    }
  }
  for(const lineup of options.lineups||[])result.lineups.push({strategy:'Manual',...simulateLineup(lineup,result,{thresholds:c.lineupThresholds})});
  if(!options.retainDraws)releaseDraws(result);
  return result;
}
