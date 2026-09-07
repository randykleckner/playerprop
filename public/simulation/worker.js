import {runSlateSimulation} from './engine.js';
self.onmessage=({data})=>{try{const result=runSlateSimulation(data.input,data.count,data.seed,{...data.options,onProgress:p=>self.postMessage({progress:(p.game+p.iteration/p.count)/p.games})});self.postMessage({result});}catch(e){self.postMessage({error:e.message});}};
