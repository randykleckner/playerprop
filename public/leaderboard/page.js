import {esc} from '../ui/components.js';
import {selectionUrl,attachImage,rowMarkup,skeletonMarkup} from './view.js';
const $=id=>document.getElementById(id),season=$('leaderboard-season'),week=$('leaderboard-week'),rows=$('leaderboard-rows'),hero=$('weekly-hero');
let requestNumber=0,controller;
function controls(data){
 const current=new Date().getFullYear()-(new Date().getMonth()<2?1:0);
 const seasons=[...new Set([current,data.season,...data.available.map(w=>w.season)])].sort((a,b)=>b-a);
 season.innerHTML=seasons.map(s=>`<option value="${s}">${s}</option>`).join('');season.value=String(data.season);
 week.innerHTML=Array.from({length:18},(_,i)=>`<option value="${i+1}">WEEK ${i+1}</option>`).join('');week.value=String(data.week);
}
function resetHero(){hero.className='weekly-hero';hero.innerHTML='<div class="hero-placeholder" aria-hidden="true">DR<br>LOCKS</div>';}
async function load(){
 const request=++requestNumber;controller?.abort();controller=new AbortController();
 $('workspace').setAttribute('aria-busy','true');$('leaderboard-retry').hidden=true;rows.innerHTML=skeletonMarkup();resetHero();
 const params=new URLSearchParams(location.search),selectedWeek=params.get('week');
 $('week-label').textContent=selectedWeek?`WEEK ${selectedWeek}`:'WEEK —';$('results-title').innerHTML='TOP FANTASY<br>FINISHES';$('leaderboard-status').textContent='Loading weekly leaderboard';
 try{
  const response=await fetch(`/api/leaderboard?${params}`,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('Request failed');const data=await response.json();if(request!==requestNumber)return;
  controls(data);history.replaceState(null,'',selectionUrl(data.season,data.week));$('week-label').textContent=`WEEK ${data.week}`;
  if(data.status!=='ready'){$('results-title').innerHTML='RESULTS<br>PENDING';rows.innerHTML='';$('leaderboard-status').textContent=`Week ${data.week} results pending`;return;}
  $('results-title').innerHTML='TOP FANTASY<br>FINISHES';rows.innerHTML=data.leaders.map(rowMarkup).join('');
  [...rows.children].forEach((node,index)=>{const row=data.leaders[index];attachImage(node.querySelector('.row-team-mark'),[row.teamLogo]);if(row.playerId)attachImage(node.querySelector('.row-player-mark'),[row.playerImage,row.teamLogo]);});
  const h=data.hero;hero.classList.add(`hero-${h.image.kind==='game-action'||h.image.kind==='approved-media'?'photo':h.image.kind==='headshot'?'headshot':'team'}`);
  hero.innerHTML=`<div class="hero-backdrop" aria-hidden="true">${esc(h.team)}</div><div class="hero-image"></div><div class="hero-caption"><span>WEEK ${data.week} / TOP FINISH</span><h2>${esc(h.name)}</h2><p>${esc(h.team)} <span>•</span> ${Number(h.fantasyPoints).toFixed(2)} PTS</p></div>`;
  attachImage(hero.querySelector('.hero-image'),[h.image.url,h.playerImage,h.teamLogo],{alt:h.name,focalX:h.image.focalX,focalY:h.image.focalY,eager:true});
  $('leaderboard-status').textContent=`Week ${data.week} leaderboard loaded`;
 }catch(error){if(error.name==='AbortError'||request!==requestNumber)return;rows.innerHTML='';$('results-title').innerHTML='RESULTS<br>UNAVAILABLE';$('leaderboard-status').textContent='Unable to load leaderboard';$('leaderboard-retry').hidden=false;}
 finally{if(request===requestNumber)$('workspace').setAttribute('aria-busy','false');}
}
const initial=new URLSearchParams(location.search),current=new Date().getFullYear()-(new Date().getMonth()<2?1:0);
controls({season:Number(initial.get('season'))||current,week:Number(initial.get('week'))||1,available:[]});
for(const select of [season,week])select.addEventListener('change',()=>{history.pushState(null,'',selectionUrl(season.value,week.value));load();});
window.addEventListener('popstate',load);$('leaderboard-retry').onclick=load;load();
