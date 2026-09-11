// Catalogs join by authoritative player ID/team abbreviation, never by display name.
export function enhancePlayerMedia(){
 let request,timer;
 async function update(){
  const nodes=[...document.querySelectorAll('[data-ui-player]:not([data-media-checked]),[data-ui-team]:not([data-media-checked])')];if(!nodes.length)return;
  if(!request)request=Promise.all(['/player-media.json','/team-media.json'].map(path=>fetch(path,{cache:'force-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({}))));
  const [players,teams]=await request;
  for(const node of nodes){if(node.dataset.mediaChecked)continue;node.dataset.mediaChecked='true';const url=node.hasAttribute('data-ui-team')?teams[node.dataset.uiTeam]?.logo:players[node.dataset.uiPlayer]?.headshot;if(!/^https:\/\//.test(url||''))continue;const img=document.createElement('img');img.alt='';img.loading='lazy';img.addEventListener('error',()=>{img.remove();node.classList.add('ui-media-unavailable');},{once:true});img.src=url.includes('static.www.nfl.com/image/')?url.replace('/f_auto,q_auto/','/f_auto,q_auto,w_192/'):url;node.append(img);}
 }
 const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(update,60);});observer.observe(document.querySelector('main')||document.body,{childList:true,subtree:true});update();
}
