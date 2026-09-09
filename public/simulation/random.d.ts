export interface Random {uniform():number;normal():number;poisson(lambda:number):number;binomial(count:number,p:number):number;lognormal(sigma:number):number;}
export function random(seed:string):Random;
export function hash(text:unknown):number;
export function fingerprint(value:unknown):string;
export function allocate(count:number,weights:number[],rng:Random):number[];
