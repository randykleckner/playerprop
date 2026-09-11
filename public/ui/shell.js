import {enhancePlayerMedia} from './player-media.js?v=ui-polish-2';
import {esc} from './components.js?v=ui-polish-2';
import {layoutPage} from './page-layout.js?v=ui-polish-2';
const routes=[['/command-center/','Home','home'],['/builder/','Lineup Builder','grid'],['/lineups/','Recommended Lineups','star'],['/preview/','Player Props','chart'],['/drive-lab/','Drive Lab','play'],['/simulation/','Simulation Station','activity'],['/newsroom/','Injuries & News','news'],['/research/calibration/','Analytics','chart'],['/saved/','Saved Lineups','save'],['/settings/','Settings','settings']];
const descriptions={'Home':'Your slate at a glance','Lineup Builder':'Choose players & optimize','Recommended Lineups':'Ready-made lineup ideas','Player Props':'Compare lines & player form','Drive Lab':'Explore game matchups','Simulation Station':'See player outcome ranges','Injuries & News':'Availability & team updates','Analytics':'Track model performance','Saved Lineups':'Your lineups & scenarios','Settings':'Display & preferences'};
const paths={home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',grid:'M3 3h18v18H3ZM3 9h18M9 9v12',star:'m12 3 3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1Z',chart:'M4 3v18h17M8 17v-5m5 5V8m5 9V4',play:'m8 5 11 7-11 7Z',activity:'M2 12h5l3-8 4 16 3-8h5',news:'M3 4h18v16H3ZM7 8h10M7 12h4m3 0h3M7 16h10',save:'M4 3h14l3 3v15H3V3Zm3 0v6h10V3M7 21v-7h10v7',settings:'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2 2m8.8 8.8 2 2M5.6 18.4l2-2m8.8-8.8 2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'};
const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key]||paths.grid}"/></svg>`;
export function mountShell(){
 if(document.querySelector('.ui-sidebar'))return;
 if(new URLSearchParams(location.search).has('embed')){document.body.classList.add('ui-embedded');const style=document.createElement('link');style.rel='stylesheet';style.href='/ui/redesign.css?v=ui-polish-2';document.head.append(style);return;}
 const link=document.createElement('link');link.rel='stylesheet';link.href='/ui/workspace.css?v=ui-polish-2';document.head.append(link);
 const redesign=document.createElement('link');redesign.rel='stylesheet';redesign.href='/ui/redesign.css?v=ui-polish-2';document.head.append(redesign);
 document.body.classList.add('ui-shell');
 try{document.body.dataset.density=localStorage.getItem('drlocks-density')||'comfortable';}catch{}
 const route=routes.find(([url])=>location.pathname===url||location.pathname===url+'index.html'||url==='/command-center/'&&['/','/index.html'].includes(location.pathname));
 const sidebar=document.createElement('aside');sidebar.className='ui-sidebar';sidebar.id='app-navigation';
 sidebar.innerHTML=`<a class="ui-brand" aria-label="Dr Locks home" href="/command-center/"><svg viewBox="0 0 32 38" aria-hidden="true"><rect x="4" y="16" width="24" height="20" rx="4" fill="currentColor"/><path d="M9 17V10a7 7 0 0 1 14 0v7" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="16" cy="25" r="2" fill="#142331"/></svg><span>Dr Locks<small>Smarter sports decisions.</small></span></a><div class="ui-nav-label">WORKSPACE</div><nav aria-label="Main navigation">${routes.map(([url,label,key])=>`<a href="${url}" ${route?.[0]===url?'aria-current="page"':''} title="${label}">${icon(key)}<span>${label}<small>${descriptions[label]}</small></span></a>`).join('')}</nav><div class="ui-sidebar-bottom"><details><summary>Research tools</summary><a href="/engineer/">Betting Engineer</a><a href="/research/">Data readiness</a></details><span class="ui-system-dot"></span> NFL research workspace</div>`;
 const toolbar=document.createElement('div');toolbar.className='ui-toolbar';toolbar.innerHTML=`<button class="ui-menu" aria-label="Toggle navigation" aria-controls="app-navigation" aria-expanded="false">☰</button><span class="ui-toolbar-league">NFL</span><span class="ui-toolbar-divider"></span><div id="ui-context">${esc(route?.[1]||'Research workspace')}</div><a class="ui-toolbar-help" href="/research/">Data & sources ↗</a>`;
 const skip=document.createElement('a');skip.className='ui-skip';skip.href='#workspace';skip.textContent='Skip to workspace';
 document.body.prepend(skip,sidebar,toolbar);
 const main=document.querySelector('main');if(main&&!main.id)main.id='workspace';
 toolbar.querySelector('button').onclick=()=>{const open=document.body.classList.toggle('ui-nav-open');toolbar.querySelector('button').setAttribute('aria-expanded',String(open));};
 layoutPage();enhancePlayerMedia();
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.classList.remove('ui-nav-open');toolbar.querySelector('button').setAttribute('aria-expanded','false');}});
}
mountShell();
