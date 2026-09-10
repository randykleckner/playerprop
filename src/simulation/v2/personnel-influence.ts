import {resolvePlay,type GameState,type Outcome,type TeamInputs,type Rules,type PlayType} from './engine.ts';
import {empiricalYards,type EmpiricalProfile} from './empirical.ts';
import type {Random} from '../../../public/simulation/random.js';
import type {InfluenceConfig,PersonnelSnapshot,PlayerTeam} from './player-types.ts';
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export interface Adjustments {pressureDelta:number;completionDelta:number;runTilt:number;completionTilt:number;protectionDifference:number|null;runDifference:number|null;receivingDifference:number|null;receivingCoverage:number;flags:string[];}
export interface PlayerOutcome extends Outcome {pressure?:boolean;pressureChanged?:boolean;throwaway?:boolean;scramble?:boolean;runnerId?:string;targetId?:string;qbId?:string;}
export function validateInfluence(c:InfluenceConfig,level:number){
 if(!c.version||!Number.isFinite(level)||level<0||level>1.5)throw Error('Invalid personnel influence');
 for(const key of ['pressurePerRatingPoint','maxPressureDelta','completionPerRatingPoint','maxCompletionDelta','runShapePerRatingPoint','completionShapePerRatingPoint','maxShapeTilt'] as const)if(!Number.isFinite(c[key])||c[key]<0||c[key]>1)throw Error('Invalid personnel coefficient');
 for(const bounds of [c.pressureBounds,c.completionBounds])if(bounds.length!==2||!bounds.every(Number.isFinite)||bounds[0]<0||bounds[1]>1||bounds[0]>=bounds[1])throw Error('Invalid probability bounds');
 if(!Number.isFinite(c.minimumReceivingCoverage)||c.minimumReceivingCoverage<.9||c.minimumReceivingCoverage>1)throw Error('Receiving coverage must be at least 90%');
 if(c.maxPressureDelta>.15||c.maxCompletionDelta>.1||c.maxShapeTilt>.4)throw Error('Personnel safety caps exceeded');
 if(!Object.keys(c.receivingAttributes).length||Object.values(c.receivingAttributes).some(x=>!Number.isFinite(x)||x<=0)||Object.values(c.runShapeScores).some(x=>!Number.isFinite(x)||Math.abs(x)>1))throw Error('Invalid attribute/shape weights');
 for(const n of [c.runExplosiveYards,c.completionExplosiveYards])if(!Number.isFinite(n)||n<5||n>40)throw Error('Invalid explosive threshold');
}
export function adjustments(offense:string,defense:string,team:PlayerTeam,personnel:PersonnelSnapshot,c:InfluenceConfig,level:number):Adjustments{
 validateInfluence(c,level);const flags:string[]=[];const scales={pressure:1,run:1,receiving:1};
 const difference=(a:string,b:string)=>{const x=personnel.units[offense]?.[a],y=personnel.units[defense]?.[b];const scale=Math.min(typeof x?.scale==='number'?x.scale:x?.complete?1:0,typeof y?.scale==='number'?y.scale:y?.complete?1:0);if(!scale||x?.rating==null||y?.rating==null){flags.push(`${a}/${b}: adjustment disabled; ${[...(x?.missing??['offense evidence unavailable']),...(y?.missing??['defense evidence unavailable'])].join('; ')}`);return null;}if(![x.rating,y.rating].every(n=>Number.isFinite(n)&&n>=0&&n<=99))throw Error('Invalid personnel unit');flags.push(`${a}/${b}: coverage ${((x.coverage??1)*100).toFixed(1)}% / ${((y.coverage??1)*100).toFixed(1)}%; scale ${scale.toFixed(3)}; composites ${x.rating.toFixed(2)} / ${y.rating.toFixed(2)}`);if(a==='pass_protection')scales.pressure=scale;else scales.run=scale;return x.rating-y.rating;};
 const protectionDifference=difference('pass_protection','pass_rush'),runDifference=difference('run_block','run_front');let receivingDifference:number|null=null;let receiving=0,mass=0,missing=0;
 for(const p of team.players){const share=p.shares.normal_target;if(!share)continue;const attrs=p.madden_attributes;if(!attrs||!['verified','strongly_corroborated'].includes(p.madden_identity)||Object.keys(c.receivingAttributes).some(k=>!Number.isFinite(attrs[k])||attrs[k]<0||attrs[k]>99)){missing+=share;continue;}receiving+=share*Object.entries(c.receivingAttributes).reduce((n,[k,w])=>n+attrs[k]*w,0)/Object.values(c.receivingAttributes).reduce((a,b)=>a+b,0);mass+=share;}
 const secondary=personnel.units[defense]?.secondary;
 // Missing receiving contributors are not silently assigned average Madden values.
 const receivingUnit=personnel.units[offense]?.receiving;
 if(receivingUnit){const scale=Math.min(receivingUnit.scale??0,secondary?.scale??0);scales.receiving=scale;if(scale&&receivingUnit.rating!==null&&secondary?.rating!=null)receivingDifference=receivingUnit.rating-secondary.rating;else flags.push(`Receiving/secondary disabled: ${[...(receivingUnit.missing??[]),...(secondary?.missing??[])].join('; ')}`);flags.push(`Receiving/secondary: coverage ${((receivingUnit.coverage??0)*100).toFixed(1)}% / ${((secondary?.coverage??0)*100).toFixed(1)}%; scale ${scale}`);}
 else if(mass>=c.minimumReceivingCoverage&&secondary?.complete&&secondary.rating!==null)receivingDifference=(receiving/mass-secondary.rating)*mass;else flags.push('Receiving/secondary: incomplete evidence; adjustment disabled');
 if(missing>0&&!receivingUnit)flags.push(`Receiving Madden coverage ${(100*mass).toFixed(1)}%; ${receivingDifference===null?'receiving modifier disabled':'modifier scaled to observed share'}`);
 return {protectionDifference,runDifference,receivingDifference,receivingCoverage:mass,pressureDelta:clamp(-(protectionDifference??0)*c.pressurePerRatingPoint*level*scales.pressure,-c.maxPressureDelta,c.maxPressureDelta),completionDelta:clamp((receivingDifference??0)*c.completionPerRatingPoint*level*scales.receiving,-c.maxCompletionDelta,c.maxCompletionDelta),runTilt:clamp((runDifference??0)*c.runShapePerRatingPoint*level*scales.run,-c.maxShapeTilt,c.maxShapeTilt),completionTilt:clamp((receivingDifference??0)*c.completionShapePerRatingPoint*level*scales.receiving,-c.maxShapeTilt,c.maxShapeTilt),flags};
}
export function shapeWeight(y:number,kind:'run'|'complete',s:GameState,tilt:number,c:InfluenceConfig){const score=kind==='complete'?(y>=c.completionExplosiveYards?1:0):y<=0?c.runShapeScores.loss:y>=c.runExplosiveYards?c.runShapeScores.explosive:y>=s.distance?c.runShapeScores.firstDown:y<4?c.runShapeScores.short:c.runShapeScores.successful;return 1+tilt*score;}
export function reshape(y:number,kind:'run'|'complete',s:GameState,tilt:number,c:InfluenceConfig,p:EmpiricalProfile,rng:Random){
 if(tilt===0)return y;const max=1+Math.abs(tilt);if(rng.uniform()<shapeWeight(y,kind,s,tilt,c)/max)return y;
 const rows=p.yards[kind];let pick=rng.uniform()*rows.reduce((n,[v,count])=>n+count*shapeWeight(v,kind,s,tilt,c),0);for(const [v,count]of rows){pick-=count*shapeWeight(v,kind,s,tilt,c);if(pick<0)return v;}return rows.at(-1)![0];
}
/** Coupled intervention: unchanged baseline plays stay unchanged unless a bounded modifier acts. */
export function resolvePersonnel(type:PlayType,s:GameState,t:TeamInputs,playRng:Random,aux:Random,rules:Rules,profile:EmpiricalProfile,team:PlayerTeam,a:Adjustments,c:InfluenceConfig):PlayerOutcome {
 let out:PlayerOutcome=resolvePlay(type,s,t,playRng,rules,profile);
 if(type==='RUN'){out.yards=reshape(out.yards,'run',s,a.runTilt,c,profile,aux);return out;}
 if(type!=='PASS')return out;
 // Sacks imply pressure. Posterior tagging makes total baseline proxy pressure p0.
 const p0=clamp(Math.max(t.sackRate,team.pressure.probability),0,1);out.pressure=out.resultType==='SACK'||aux.uniform()<(p0-t.sackRate)/Math.max(1e-9,1-t.sackRate);
 const p1=a.pressureDelta===0?p0:clamp(p0+a.pressureDelta,...c.pressureBounds),delta=p1-p0;
 const added=delta>0&&!out.pressure&&aux.uniform()<delta/Math.max(1e-9,1-p0),removed=delta<0&&out.pressure&&aux.uniform()<-delta/Math.max(1e-9,p0);
 if(added||removed){
  out.pressure=added;out.pressureChanged=true;
  const press=team.pressure;let u=aux.uniform();
  if(added&&u<press.sack_given_pressure){out={...out,resultType:'SACK',yards:-Math.max(1,Math.min(15,Math.round(6+2*aux.normal()))),duration:6};}
  else if(added&&(u-=press.sack_given_pressure)<press.scramble_given_pressure){out={...out,playType:'RUN',resultType:'RUN',yards:empiricalYards('run',profile,aux),duration:6,scramble:true};}
  else if(added&&(u-=press.scramble_given_pressure)<press.incomplete_given_pressure){out={...out,resultType:'INCOMPLETE',yards:0,duration:5,throwaway:true};}
  else if(aux.uniform()<t.interceptionRate){out={...out,resultType:'INTERCEPTION',yards:Math.max(0,Math.round(12+10*aux.normal())),duration:6};}
  else if(aux.uniform()<t.completionRate){out={...out,resultType:'COMPLETE',yards:empiricalYards('complete',profile,aux),duration:6};}
  else out={...out,resultType:'INCOMPLETE',yards:0,duration:5};
 }
 if(out.playType==='RUN')return out;
 const c0=t.completionRate,c1=a.completionDelta===0?c0:clamp(c0+a.completionDelta,...c.completionBounds),dc=c1-c0;
 if(!out.throwaway&&out.resultType==='INCOMPLETE'&&dc>0&&aux.uniform()<dc/Math.max(1e-9,1-c0))out={...out,resultType:'COMPLETE',yards:empiricalYards('complete',profile,aux),duration:6};
 else if(out.resultType==='COMPLETE'&&dc<0&&aux.uniform()<-dc/Math.max(1e-9,c0))out={...out,resultType:'INCOMPLETE',yards:0,duration:5};
 if(out.resultType==='COMPLETE')out.yards=reshape(out.yards,'complete',s,a.completionTilt,c,profile,aux);
 return out;
}
