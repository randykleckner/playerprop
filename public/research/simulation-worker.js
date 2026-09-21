import {runSlateSimulation,dkScore} from '../simulation/engine.js';
self.onmessage=({data})=>{
 try{const threshold=data.threshold??20;let hits=0,joint=0,td=0,observations=0;
 const result=runSlateSimulation(data.input,data.count||1000,'research-station-v1',{overrides:data.overrides||[],generateCandidates:false,includeStacks:false,onDraw:draw=>{
  const player=data.input.players.find(p=>p.player_id===data.playerId);if(!player||player.game_id!==draw.game_id)return;const stats=draw.players.get(player.player_id);if(!stats)return;observations++;const hit=dkScore(stats,player.position)>threshold;if(hit)hits++;if(stats.passing_tds+stats.rushing_tds+stats.receiving_tds>0)td++;const other=data.input.players.find(p=>p.player_id===data.compareId);if(other?.game_id===draw.game_id){const os=draw.players.get(other.player_id);if(os&&hit&&dkScore(os,other.position)>threshold)joint++;}
 }});
 self.postMessage({result,query:{threshold,observations,exceed:observations?100*hits/observations:null,td:observations?100*td/observations:null,joint:observations&&data.input.players.find(p=>p.player_id===data.compareId)?.game_id===data.input.players.find(p=>p.player_id===data.playerId)?.game_id?100*joint/observations:null}});
 }catch(e){self.postMessage({error:e.message});}
};
