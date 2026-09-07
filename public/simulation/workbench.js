export const SLOTS=['QB','RB','RB','WR','WR','WR','TE','FLEX','DST'];
export const eligible=(position,slot)=>slot==='FLEX'?['RB','WR','TE'].includes(position):slot===position;
export const salaryUsed=(roster,players)=>roster.reduce((sum,id)=>sum+(players.find(p=>p.player_id===id)?.salary||0),0);
export function addPlayer(roster,id,players){
 const p=players.find(p=>p.player_id===id);if(!p||p.active===false)throw Error('This player is unavailable.');if(roster.includes(id))throw Error('Player already selected.');if(salaryUsed(roster,players)+p.salary>50000)throw Error('Not enough salary remaining. Remove or replace a player first.');
 const next=[...roster];let index=SLOTS.findIndex((slot,i)=>!next[i]&&eligible(p.position,slot));
 if(index<0&&next[7]){const flex=players.find(p=>p.player_id===next[7]);const spare=SLOTS.findIndex((slot,i)=>i!==7&&!next[i]&&eligible(flex.position,slot));if(spare>=0&&eligible(p.position,'FLEX')){next[spare]=next[7];next[7]=null;index=7;}}
 if(index<0)throw Error(`No eligible ${p.position}/FLEX slot remains.`);next[index]=id;return next;
}
export function movePlayer(roster,from,to,players){
 const next=[...roster],p=players.find(p=>p.player_id===next[from]),other=players.find(p=>p.player_id===next[to]);
 if(!p||!SLOTS[to]||!eligible(p.position,SLOTS[to])||other&&!eligible(other.position,SLOTS[from]))throw Error('These players cannot occupy the requested slots.');
 [next[from],next[to]]=[next[to],next[from]];return next;
}
export function selectPlayers(players,filters={},sort={key:'mean',direction:'desc'}){
 const value=(p,k)=>k==='value'?p.mean/(p.salary/1000):p[k];const number=v=>v===''||v==null?null:Number(v);
 return players.filter(p=>(!filters.position||filters.position==='FLEX'?(!filters.position||eligible(p.position,'FLEX')):p.position===filters.position)&&(!filters.team||p.team===filters.team)&&(!filters.opponent||p.opponent===filters.opponent)&&(!filters.game||p.game_id===filters.game)&&(!filters.search||`${p.player_name} ${p.team} ${p.opponent}`.toLowerCase().includes(filters.search.toLowerCase()))&&(number(filters.maxSalary)==null||p.salary<=number(filters.maxSalary))&&(number(filters.min3x)==null||p.probability_3x>=number(filters.min3x))&&(!filters.activeOnly||p.active!==false)&&(!filters.affordableOnly||p.salary<=filters.remaining)&&(!filters.selectedOnly||filters.selected.includes(p.player_id))).sort((a,b)=>{const x=value(a,sort.key),y=value(b,sort.key);if(x==null&&y!=null)return 1;if(y==null&&x!=null)return -1;const compare=typeof x==='string'?x.localeCompare(y??''):(x??0)-(y??0);return compare*(sort.direction==='asc'?1:-1)||a.player_name.localeCompare(b.player_name);});
}
