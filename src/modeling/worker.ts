import {runModel,sensitivity,type Sources} from './run.ts';
import type {Scenario} from './contract.ts';
const scope=self as unknown as {onmessage:(e:{data:{sources:Sources;scenario:Scenario;seed:string;count:number;range?:{key:string;values:number[]}}})=>void;postMessage:(v:unknown)=>void};
scope.onmessage=e=>{try{const {sources,scenario,seed,count,range}=e.data;const now=new Date().toISOString();const result=range?sensitivity(sources,scenario,range.key,range.values,seed,count,now):runModel(sources,scenario,seed,count,now);scope.postMessage({type:range?'sensitivity':'result',result});}catch(e){scope.postMessage({type:'error',message:e instanceof Error?e.message:'Simulation failed'});}};
