import {readdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
const root=process.argv[2]||'public',base=root+'/research/bundles',entries=[];
for(const bundle of readdirSync(base)){const path=base+'/'+bundle+'/lineups.json';if(!existsSync(path))continue;const d=JSON.parse(readFileSync(path));if(d.version!==1||d.lineups?.length!==6||!Number.isFinite(Date.parse(d.generated_at)))continue;entries.push({bundle,slate_id:String(d.slate.draft_group_id),season:d.season,week:d.week,start_time:d.slate.start_time,generated_at:d.generated_at,lineups_path:`/research/bundles/${bundle}/lineups.json`});}
entries.sort((a,b)=>Date.parse(b.start_time)-Date.parse(a.start_time)||Date.parse(b.generated_at)-Date.parse(a.generated_at));
writeFileSync(root+'/lineups/archive.json',JSON.stringify({version:1,entries},null,2)+'\n');
console.log(`Indexed ${entries.length} immutable lineup builds`);
