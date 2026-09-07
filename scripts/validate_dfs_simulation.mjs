#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {calibrationReport} from '../public/simulation/statistics.js';
try{if(!process.argv[2])throw Error('Supply a held-out cases JSON file. No archived pregame historical inputs are currently available. See docs/simulation-lab.md.');const data=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(calibrationReport(data.cases,data),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
