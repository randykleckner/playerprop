#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {freezeResearch} from './research/archive.mjs';
try{const {values:v}=parseArgs({options:{input:{type:'string'},prediction:{type:'string'},directory:{type:'string',default:'.dfs-research/frozen'},raw:{type:'string',multiple:true,default:[]}}});const read=p=>JSON.parse(readFileSync(p,'utf8'));console.log(JSON.stringify(freezeResearch(read(v.input),read(v.prediction),{directory:v.directory,rawFiles:v.raw}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
