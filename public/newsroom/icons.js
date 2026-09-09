import {activeStories,briefHtml,escapeHtml} from './shared.js';
let data={stories:[]},dialog,returnFocus;
function hydrate(){const ids=new Set(activeStories(data).map(s=>s.player_id));document.querySelectorAll('[data-news-player]').forEach(a=>{a.hidden=!ids.has(a.dataset.newsPlayer);});}
async function refresh(){try{const r=await fetch('/newsroom/latest.json',{cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();if(next.version!==1||!Array.isArray(next.stories))throw Error();data=next;}catch{}hydrate();}
function open(id,anchor){
 const stories=activeStories(data).filter(s=>s.player_id===id);if(!stories.length)return;
 if(!dialog){dialog=document.createElement('dialog');dialog.className='news-dialog';document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>returnFocus?.focus());}
 returnFocus=anchor;dialog.innerHTML=`<div class="news-dialog-top"><strong id="news-dialog-title">Player briefing</strong><button type="button" aria-label="Close player news">×</button></div>${stories.map(s=>briefHtml(s)).join('')}<p><a href="/newsroom/?player=${encodeURIComponent(id)}">Open in Newsroom →</a></p>`;dialog.setAttribute('aria-labelledby','news-dialog-title');dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();
}
document.addEventListener('click',e=>{const a=e.target.closest('[data-news-player]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();e.stopPropagation();open(a.dataset.newsPlayer,a);},true);
new MutationObserver(hydrate).observe(document.body,{childList:true,subtree:true});
refresh();setInterval(refresh,60000);
