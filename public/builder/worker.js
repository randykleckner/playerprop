import {optimize} from '../simulation/optimizer.js';
self.onmessage=({data})=>{try{const pool=data.players.filter(p=>p.active!==false).map(p=>({...p,id:p.player_id,points:p.final_projection}));const result=optimize(pool,{required:data.required,excluded:data.excluded});self.postMessage({result});}catch(error){self.postMessage({error:error.message});}};
