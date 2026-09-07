export function hash(text) { let h=2166136261; for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0; }
export function random(seed) {
  let a=hash(seed), spare=null;
  const uniform=()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  const normal=()=>{if(spare!==null){const n=spare;spare=null;return n;}const r=Math.sqrt(-2*Math.log(Math.max(uniform(),1e-12))),angle=2*Math.PI*uniform();spare=r*Math.sin(angle);return r*Math.cos(angle);};
  const poisson=lambda=>{if(lambda<=0)return 0;const stop=Math.exp(-lambda);let n=0,p=1;do{n++;p*=uniform();}while(p>stop);return n-1;};
  const binomial=(count,p)=>{if(p<=0)return 0;if(p>=1)return count;let n=0;for(let i=0;i<count;i++)if(uniform()<p)n++;return n;};
  return {uniform,normal,poisson,binomial,lognormal:sigma=>Math.exp(normal()*sigma-sigma*sigma/2)};
}
export function allocate(count, weights, rng) {
  const total=weights.reduce((a,b)=>a+b,0), result=weights.map(()=>0);
  if(count && total<=0)throw Error('Opportunity allocation requires a residual recipient');
  // Sequential binomial is an exact multinomial with fixed total.
  let remaining=count, mass=total;
  for(let i=0;i<weights.length-1;i++){const n=mass>0?rng.binomial(remaining,Math.max(0,Math.min(1,weights[i]/mass))):0;result[i]=n;remaining-=n;mass-=weights[i];}
  if(result.length)result[result.length-1]=remaining;return result;
}

export const fingerprint = value => [0,1,2,3].map(i=>hash(`${i}|${JSON.stringify(value)}`).toString(16).padStart(8,"0")).join("");
