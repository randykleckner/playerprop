const $=id=>document.getElementById(id);
function el(tag,className,html=''){const node=document.createElement(tag);node.className=className;node.innerHTML=html;return node;}
function heading(node,title,description){if(!node)return;node.innerHTML=`<p class="eyebrow">DR LOCKS · NFL WORKSPACE</p><h1>${title}</h1><p>${description}</p>`;}
function moveContext(id){const control=$(id);if(control&&$('ui-context')){$('ui-context').textContent='';$('ui-context').append(control.closest('label')||control);}}
function tabs(container,groups){const nav=el('div','ui-page-tabs');nav.setAttribute('role','tablist');const panels=[];groups.forEach(([title,nodes],index)=>{const panel=el('div','ui-tab-panel');panel.id='workspace-panel-'+index;panel.setAttribute('role','tabpanel');const button=el('button','',title);button.type='button';button.id='workspace-tab-'+index;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);panel.setAttribute('aria-labelledby',button.id);const select=()=>{for(const [i,p]of panels.entries()){p.hidden=i!==index;nav.children[i].setAttribute('aria-selected',String(i===index));nav.children[i].tabIndex=i===index?0:-1;}};button.onclick=select;button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?groups.length-1:(index+(e.key==='ArrowRight'?1:-1)+groups.length)%groups.length;nav.children[i].click();nav.children[i].focus();};nav.append(button);panel.hidden=index!==0;button.setAttribute('aria-selected',String(index===0));button.tabIndex=index===0?0:-1;nodes.filter(Boolean).forEach(node=>panel.append(node));panels.push(panel);});container.append(nav,...panels);}
function disclosure(title,nodes){const d=el('details','panel',`<summary>${title}</summary>`);nodes.filter(Boolean).forEach(n=>d.append(n));return d;}
export function layoutPage(){
 const main=document.querySelector('main'),path=location.pathname;if(!main)return;
 document.body.dataset.page=path.split('/').filter(Boolean).join('-')||'home';
 if(path==='/drive-lab/'||path==='/drive-lab/index.html'){
  heading(main.querySelector('.drive-intro'),'Drive Lab','Explore a game, its matchups, and the players shaping the outcome.');
  const intro=main.querySelector('.drive-intro');main.prepend(intro);
  const controls=main.querySelector(':scope > .drive-controls');moveContext('game');$('game')?.setAttribute('aria-label','Select game matchup');$('game')?.setAttribute('title','Choose a game to analyze');
  const grid=el('div','ui-page-grid'),primary=el('div','ui-page-primary'),inspector=el('aside','ui-page-inspector','<h2>Game controls</h2>');inspector.setAttribute('aria-label','Game controls');inspector.append(controls);inspector.append(disclosure('Engine & assumptions',['model','influence','seed','home-rate','away-rate','trace'].map(id=>inspector.querySelector('#'+id)?.closest('label'))));
  const hero=el('div','');hero.id='matchup-hero';primary.append(hero);if($('status'))primary.append($('status'));if($('input-note'))inspector.append(disclosure('Data details',[$('input-note')]));
  const embedded=main.querySelector(':scope > .model-app');if(embedded){const h=embedded.querySelector('h2');if(h)h.textContent='Shared scenario workspace';}
  const availability=$('availability-controls');if(availability){availability.querySelector('h2').textContent='What-If Scenario';availability.querySelector('p').classList.add('ui-scenario-banner');availability.querySelector('p').textContent='HYPOTHETICAL ASSUMPTIONS · Changes apply only to a scenario. Source injury and roster records stay unchanged.';}
  const overview=$('results');const overviewEmpty=el('div','panel ui-drive-empty','<p>Run a simulation to explore scoring, pace and drive outcomes.</p>');
  if(overview){const watcher=new MutationObserver(()=>{overviewEmpty.hidden=!overview.hidden;});watcher.observe(overview,{attributes:true,attributeFilter:['hidden']});}
  const personnel=$('personnel')?.closest('details'),evaluation=$('evaluation')?.closest('section');
  tabs(primary,[['Game overview',[overviewEmpty,overview]],['Matchup',[$('active-personnel'),personnel]],['Player projections',[$('fantasy-results'),el('p','','Player outcome distributions appear here after simulating games with the Base or Personnel engine.')]],['What-if scenario',[availability,embedded]],['Model evidence',[evaluation]]]);
  const leftovers=[...main.children].filter(n=>n!==intro&&!n.contains(grid)&&!n.matches('script'));
  const notes=leftovers.filter(n=>n!==grid);if(notes.length)inspector.append(disclosure('Sources & assumptions',notes));
  grid.append(primary,inspector);main.append(grid);
 }
 if(path==='/simulation/'||path==='/simulation/index.html'){
  heading(main.querySelector('.intro'),'Simulation Station','Explore player outcomes and compare hypothetical changes with a baseline.');
  const controls=main.querySelector(':scope > .controls');moveContext('slate');
  const grid=el('div','ui-page-grid'),primary=el('div','ui-page-primary'),inspector=el('aside','ui-page-inspector','<h2>Simulation settings</h2>');inspector.setAttribute('aria-label','Simulation settings');inspector.append(controls);const seedControl=inspector.querySelector('#seed');if(seedControl)inspector.append(disclosure('Advanced settings',[seedControl.closest('label')]));
  const scenario=[...main.querySelectorAll(':scope > details')].find(d=>d.querySelector('#scenario'));if(scenario){scenario.querySelector('summary').textContent='What-If Scenario';scenario.querySelector('p').classList.add('ui-scenario-banner');inspector.append(scenario);}
  if($('research-panel'))inspector.append($('research-panel'));
  for(const id of ['snapshot-update','status','progress','comparison'])if($(id))primary.append($(id));
  const focus=el('section','panel ui-sim-focus',`<div class="ui-filter-toolbar"><label>Find player<input id="focus-search" type="search" placeholder="Search roster…"></label><label>Selected player<select id="focus-player" aria-label="Selected player"></select></label></div><div id="focus-empty"><h2>See the range behind a projection</h2><p>Choose any player from the slate and run a baseline. Player percentiles and the distribution will appear here.</p></div>`);primary.append(focus);if($('distribution'))focus.append($('distribution'));
  const results=$('results');if(results){const roster=$('player-workbench'),others=[...results.children].filter(n=>n!==roster);tabs(results,[['Player pool',[roster]],['Stacks & lineups',others]]);primary.append(results);}
  grid.append(primary,inspector);main.append(grid);
 }
 if(path==='/engineer/'||path==='/engineer/index.html'){
  const title=main.querySelector('h1');if(title)title.textContent='What-If Scenario';
  const p=title?.nextElementSibling;if(p){p.textContent='HYPOTHETICAL ASSUMPTIONS · Explore changes without modifying verified injury or roster records.';p.className='ui-scenario-banner';}
  const root=$('controls');if(root){const sections=[...root.children],results=$('results');const navHost=el('div','');tabs(navHost,[['Personnel',[sections[1]]],['Assumptions',[sections[2]]],['Sensitivity',[sections[5]]]]);root.insertBefore(navHost,sections[3]);if(results)root.append(results);}
 }
 if(path==='/lineups/'||path==='/lineups/index.html'){
  const view=new URLSearchParams(location.search).get('view');
  if(view){main.classList.add('ui-recommendation-drilldown');for(const tier of ['projection','floor','ceiling']){const section=$(tier+'-lineups')?.closest('.lineup-section');if(section)section.hidden=tier!==(view==='stacks'?'ceiling':view);}}
  for(const a of document.querySelectorAll('#recommendation-tabs a')){const active=(new URL(a.href).searchParams.get('view')||'')===(view||'');if(active)a.setAttribute('aria-current','page');}
  if($('lineup-retry'))$('lineup-retry').onclick=()=>location.reload();
 }
 if(path==='/story/'||path==='/story/index.html'){main.prepend(el('p','','<a href="/preview/">← Player Props</a>'));}
}
