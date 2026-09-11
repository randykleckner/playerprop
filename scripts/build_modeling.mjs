import {build} from 'esbuild';import {copyFileSync,mkdirSync} from 'node:fs';
mkdirSync('public/modeling',{recursive:true});
await build({entryPoints:['src/modeling/worker.ts'],outfile:'public/modeling/worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await build({entryPoints:['src/modeling/run.ts','src/modeling/contract.ts','src/modeling/outputs.ts'],outdir:'public/modeling/core',bundle:true,format:'esm',platform:'browser',target:'es2022',splitting:true,minify:true});
copyFileSync('config/model-presets.json','public/modeling/presets.json');
