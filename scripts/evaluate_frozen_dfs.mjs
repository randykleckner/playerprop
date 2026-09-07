#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {readFrozen,heldoutCases} from './research/archive.mjs';
import {calibrationReport} from '../public/simulation/statistics.js';
try{if(!process.argv[2]||!process.argv[3])throw Error('Usage: node scripts/evaluate_frozen_dfs.mjs archive-directory actuals-and-windows.json');const data=JSON.parse(readFileSync(process.argv[3])),joined=heldoutCases(readFrozen(process.argv[2]),data.actuals);console.log(JSON.stringify({...joined,report:joined.cases.length?calibrationReport(joined.cases,data):null,status:joined.cases.length?'evaluated':'no_verified_eligible_observations'},null,2));}catch(e){console.error(e.message);process.exitCode=1;}
