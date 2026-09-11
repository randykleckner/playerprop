export function mediaCandidates(node,players,teams){
 const player=players[node.uiPlayer],team=node.uiTeam||node.playerTeam||player?.team;
 return [...new Set([...(node.uiTeam?[]:[player?.headshot]),teams[team]?.logo].filter(url=>/^https:\/\//.test(url||'')))];
}
// Catalogs join by authoritative player ID/team abbreviation, never by display name.
export function enhancePlayerMedia(){
 let request,timer;
 async function update(){
  const nodes=[...document.querySelectorAll('[data-ui-player]:not([data-media-checked]),[data-ui-team]:not([data-media-checked])')];if(!nodes.length)return;
  if(!request)request=Promise.all(['/player-media.json','/team-media.json'].map(path=>fetch(path,{cache:'force-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({}))));
  const [players,teams]=await request;
  for(const node of nodes){if(node.dataset.mediaChecked)continue;node.dataset.mediaChecked='true';const player=players[node.dataset.uiPlayer],team=node.dataset.uiTeam||node.dataset.playerTeam||player?.team;
   const urls=mediaCandidates(node.dataset,players,teams);
   if(teams[team]?.color)node.style.setProperty('--team-color',/^#?[0-9a-f]{6}$/i.test(teams[team].color)?'#'+teams[team].color.replace('#',''):'#dfe7f1');
   let index=0;const next=()=>{if(index>=urls.length){node.classList.add('ui-media-unavailable');return;}const url=urls[index++],img=document.createElement('img');img.alt='';img.loading='lazy';if(url===teams[team]?.logo)img.className='ui-team-image';img.addEventListener('error',()=>{img.remove();next();},{once:true});img.src=url.includes('static.www.nfl.com/image/')?url.replace('/f_auto,q_auto/','/f_auto,q_auto,w_192/'):url;node.append(img);};next();}

 }
 const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(update,60);});observer.observe(document.body,{childList:true,subtree:true});update();
}
