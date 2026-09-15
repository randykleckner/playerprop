import {loadLeaders} from './leaders.js?v=visual-slate-2';
import {avatar,avatarGroup,icon,stackPreview,positionBadge} from '../ui/components.js?v=ui-polish-5';
import {newsIcon} from '../newsroom/shared.js';
import {loadResearch,readinessHtml} from '../research/readiness.js';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const date = value => new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
let theme = 'dark';
try { theme = localStorage.getItem('drlocks-theme') || theme; } catch {}
function setTheme(value) { document.body.dataset.theme = value; $('theme-toggle').textContent = value === 'dark' ? 'Light mode' : 'Dark mode'; $('theme-toggle').setAttribute('aria-pressed', String(value === 'dark')); }
setTheme(theme);
$('theme-toggle').onclick = () => { theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark'; setTheme(theme); try { localStorage.setItem('drlocks-theme', theme); } catch {} };
function card(lineup) {
  const featured = lineup.tier === 'projection';
  const provisional = lineup.players.filter(p => p.provisional).length;
  const identityCounts = ['verified','strongly_corroborated','provisional','unresolved'].map(t=>`${lineup.players.filter(p=>p.position!=='DST'&&(p.identity_confidence|| (p.provisional?'provisional':'verified'))===t).length} ${t.replaceAll('_',' ')}`).join(' · ');
  const explanation = `<p class="lineup-reason">${escape(lineup.explanation)}</p>`;
  return `<article class="lineup-card ${featured ? 'featured' : ''} ui-tier-${escape(lineup.tier)}" aria-labelledby="title-${escape(lineup.id)}"><div class="lineup-card-head"><div class="ui-recommendation-kind">${icon(featured?'trophy':lineup.tier==='floor'?'shield':'upside')}${featured?'Best overall':lineup.tier==='floor'?'Floor strategy':'Upside stack'}</div><h3 id="title-${escape(lineup.id)}">${escape(lineup.title)}</h3><div class="lineup-stats"><div><strong class="points">${lineup.points.toFixed(2)}</strong><span>PROJECTED PTS</span></div><div><strong>${money(lineup.salary)}</strong><span>TOTAL SALARY</span></div></div>${avatarGroup(lineup.players.map(p=>({...p,player_id:p.id})))}${stackPreview(lineup.players.filter(p=>lineup.required?.includes(p.id)).map(p=>({...p,player_id:p.id})))}<div class="lineup-budget">${money(50000 - lineup.salary)} remaining</div><div class="ui-recommendation-actions" ${document.body.dataset.snapshotState==='locked'||selectedBundle?'hidden':''}><a href="/builder/?recommendation=${encodeURIComponent(lineup.id)}&slate=${encodeURIComponent(activeSlate)}">Export to Builder ↗</a>${lineup.required?.length ? `<a href="/builder/?recommendation=${encodeURIComponent(lineup.id)}&slate=${encodeURIComponent(activeSlate)}&stack=1">Build around stack ↗</a>` : ''}</div></div><details class="ui-lineup-roster"><summary>View lineup & rationale</summary><table class="lineup-table" aria-label="${escape(lineup.title)} roster"><thead><tr><th scope="col">Slot</th><th scope="col">Player / matchup</th><th scope="col">Salary</th><th scope="col">Proj.</th></tr></thead><tbody>${lineup.players.map(p => `<tr><td>${positionBadge(p.slot)}</td><td><div class="ui-player-cell">${avatar({...p,player_id:p.id},'xs')}<div><span class="player-name">${escape(p.player_name)}${newsIcon(p.player_id,p.player_name)}${!['NONE', 'ACTIVE', 'HEALTHY'].includes(p.status.toUpperCase()) ? `<span class="injury-tag">${escape(p.status)}</span>` : ''}</span><span class="player-meta">${escape(p.team)} ${p.home_away === 'away' ? '@' : 'vs'} ${escape(p.opponent)} · ${escape(p.position)}</span></div></div></td><td>${money(p.salary)}</td><td>${p.points.toFixed(2)}</td></tr>`).join('')}</tbody></table><details class="lineup-detail"><summary>Why this build & data notes</summary>${explanation}<p>Totals are mean estimates, not floor or ceiling scores. ${identityCounts}. ${lineup.excluded.length ? 'Strategy exclusions apply, including roster changes when needed to keep builds distinct.' : 'Optimal for the included pool under the displayed roster constraints.'}</p><p>Scoring flags: ${escape([...new Set(lineup.players.flatMap(p => p.quality_flags))].join(', ').replaceAll('_', ' '))}.</p></details></details></article>`;
}
let loadedBundle, activeSlate, archive=[], selectedBundle=new URLSearchParams(location.search).get('bundle'), selectedData;
async function archiveOptions(){try{const r=await fetch('/lineups/archive.json',{cache:'no-store'});archive=(await r.json()).entries??[];$('lineup-archive').innerHTML='<option value="">Latest build</option>'+archive.map(a=>`<option value="${escape(a.bundle)}">${a.season} Week ${a.week} · ${escape(date(a.start_time))} · built ${escape(date(a.generated_at))}</option>`).join('');$('lineup-archive').value=selectedBundle??'';}catch{}}
$('lineup-archive').onchange=()=>{selectedBundle=$('lineup-archive').value||null;const u=new URL(location.href);if(selectedBundle)u.searchParams.set('bundle',selectedBundle);else u.searchParams.delete('bundle');history.replaceState(null,'',u);load();};
async function load() {
  $('lineup-content').hidden = true;
  $('lineup-empty').hidden = true;
  try {
    let manifest;try{manifest=await loadResearch();}catch{}
    await archiveOptions();const selected=archive.find(a=>a.bundle===selectedBundle);if(selectedBundle&&!selected)throw Error('Unknown archived bundle');
    const response = await fetch(selected?.lineups_path||manifest?.snapshot.lineups_path||'/lineups/latest.json', { cache: 'no-store' });
    if (!response.ok) throw Error('No saved lineup data');
    const data = await response.json();
    selectedData=data;loadedBundle=selected?.bundle||manifest?.snapshot.bundle;
    activeSlate=String(data.slate.draft_group_id);
    if (data.version !== 1 || !Array.isArray(data.lineups) || data.lineups.length !== 6 || !Number.isFinite(Date.parse(data.expires_at))) throw Error('Invalid lineup snapshot');
    if (!Number.isFinite(Date.parse(data.slate?.start_time))) throw Error('Invalid slate date');
    const locked = Date.now() >= Date.parse(data.slate.start_time);
    const stale = Date.now() >= Date.parse(data.expires_at);
    document.body.dataset.snapshotState = locked ? 'locked' : stale ? 'stale' : 'fresh';
    document.body.dataset.expires = Date.parse(data.expires_at);
    document.body.dataset.lock = Date.parse(data.slate.start_time);
    $('slate-title').textContent = `${data.season} · Week ${data.week} · Classic`;
    $('slate-details').textContent = `${date(data.slate.start_time)} · ${data.slate.game_count} games`;
    if (locked) {
      $('lineup-status').textContent = 'This saved slate has locked. Refresh salary and projection snapshots for the next slate.';
      $('slate-title').textContent += ' · LOCKED';
      $('review-banner').hidden=false;$('review-banner').textContent='LOCKED — REVIEW ONLY. These are the saved pregame recommendations, not lineups available for entry. Original projections and salaries are preserved.';
    }
    if(!locked){$('review-banner').hidden=!selectedBundle;$('review-banner').textContent='ARCHIVED BUILD — saved projections, not current recommendations.';}
    $('lineup-status').innerHTML = locked?'Locked — review only. Original saved projections remain visible.':!selectedBundle&&manifest?readinessHtml(manifest):`${stale ? '<strong class="archived-label">STALE SNAPSHOT — refresh required.</strong> The salary or projection source has expired. ' : '<strong>Research preview.</strong> '}${data.coverage.eligible_players} of ${data.coverage.salary_players} salary entries passed the research-pool checks. ESPN is the only projection source so far. See data notes for identity coverage and model evaluation. <a href="#methodology">View methodology</a>.`;
    for (const tier of ['projection', 'floor', 'ceiling']) $(`${tier}-lineups`).innerHTML = data.lineups.filter(l => l.tier === tier).map(card).join('');
    $('methodology').innerHTML = `<p><strong>Built ${escape(date(data.generated_at))}.</strong> Salaries captured ${escape(date(data.sources.salary.fetched_at))}; ESPN projections ${escape(date(data.sources.projections.fetched_at))}. Snapshots expire after 24 hours or at lock. This page reads the last validated shared research build. Source refresh and publication happen outside the browser; the readiness panel shows the last attempt.</p><p><strong>Pool:</strong> ${data.coverage.eligible_players} / ${data.coverage.salary_players} salary entries; ${data.coverage.provisional_players} provisional joins. Excluded: ${escape(Object.entries(data.coverage.rejected).map(([k, v]) => `${v} ${k.replaceAll('_', ' ')}`).join('; '))}. Matchups and kickoffs were checked against the matching ESPN regular-season week.</p><p><strong>Optimization:</strong> Exact salary-grid search: QB, 2 RB, 3 WR, TE, FLEX (RB/WR/TE), DST; 9 unique players; at least 2 teams; $50,000 cap. The leader maximizes the mean within this pool. Alternatives follow the card rules and require distinct rosters. They may share many players.</p><p><strong>Interpretation:</strong> Floor strategies discount touchdowns and emphasize receptions. Ceiling strategies pair a quarterback with a pass catcher and an opponent. These are proxies, not calibrated outcome distributions. Ownership, contest field strength, betting lines, historical variance and defensive matchup adjustments are not yet modeled.</p><p><strong>Scoring:</strong> ESPN statistics converted to DraftKings estimates with expected yardage bonuses. Sparse fields and rare events have limitations; DST points-allowed buckets require an approximation. Provisional joins are research-only and do not update verified mappings.</p><p>Model: <code>${escape(data.model)}</code> · Salary snapshot: <code>${escape(data.sources.salary.id)}</code></p>`;
    $('lineup-content').hidden = false;liveGames();loadLeaders(loadedBundle,activeSlate);
    $('lineup-status').querySelector?.('a')?.addEventListener('click', () => { $('methodology').parentElement.open = true; });
  } catch {
    $('lineup-status').textContent = 'Lineup data could not be loaded. The existing prop board remains available.';
    $('lineup-empty').hidden = false;
  }
}
load();
// Refresh on age/lock transitions without resetting open disclosure panels every minute.
setInterval(async () => {
  if(selectedBundle)return;
  try{const latest=await loadResearch();if(latest.snapshot.bundle!==loadedBundle){await load();return;}if(document.body.dataset.snapshotState!=='locked')$('lineup-status').innerHTML=readinessHtml(latest);}catch{}
  const state = document.body.dataset.snapshotState;
  const expiry = Number(document.body.dataset.expires);
  const lock = Number(document.body.dataset.lock);
  if ((state === 'fresh' && Date.now() >= expiry) || (state !== 'locked' && Date.now() >= lock)) load();
}, 60000);

$('lineup-retry').onclick=load;
async function liveGames(){
 if(!selectedData)return;const requestBundle=loadedBundle;
 const teams=new Set(selectedData.lineups.flatMap(l=>l.players.flatMap(p=>[p.team,p.opponent])));
 const start=new Date(selectedData.slate.start_time),end=new Date(start.getTime()+2*86400000),ymd=d=>d.toISOString().slice(0,10).replaceAll('-','');
 try{
  const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${ymd(start)}-${ymd(end)}&limit=100`,{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('Score feed unavailable');const data=await r.json();
  const rows=(data.events??[]).filter(g=>g.competitions?.[0]?.competitors?.some(c=>teams.has(c.team?.abbreviation==='LAR'?'LA':c.team?.abbreviation)));
  if(requestBundle!==loadedBundle)return;
  $('live-game-list').innerHTML=rows.map(g=>{const cs=g.competitions[0].competitors;return `<p><strong>${cs.map(c=>`${escape(c.team.abbreviation)} ${escape(c.score??'—')}`).join(' — ')}</strong> · ${escape(g.status?.type?.shortDetail??'Status unavailable')} <a href="https://www.espn.com/nfl/game/_/gameId/${encodeURIComponent(g.id)}" target="_blank" rel="noopener">Box score ↗</a></p>`;}).join('')||'<p>No matching games returned.</p>';
  $('live-game-status').textContent=`Checked ${new Date().toLocaleTimeString()} · refreshes each minute while this page is visible. Game scores, not player fantasy points.`;
 }catch{$('live-game-status').textContent='Live game feed unavailable. Any displayed scores are from the previous check.';}
}
setInterval(()=>{if(!document.hidden)liveGames();},60000);
