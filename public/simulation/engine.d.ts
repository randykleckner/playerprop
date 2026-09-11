/** JSON contracts are documented in docs/simulation-lab.md. Implementation is shared with browser and CLI. */
export function runSlateSimulation(source: unknown,count:number,seed:string|number,options?:{overrides?:unknown[];lineups?:string[][];includeStacks?:boolean;generateCandidates?:boolean;onDraw?:(draw:any)=>void}):Record<string,unknown>;
