import { doctorBrief } from './doctor-chart.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const fmt = value => numeric(value) ? value.toLocaleString('en-US',{maximumFractionDigits:1}) : '—';
export function defenseGrade(rank) {
  if (!Number.isInteger(rank) || rank < 1 || rank > 32) return '—';
  return rank <= 4 ? 'A+' : rank <= 8 ? 'A' : rank <= 16 ? 'B' : rank <= 24 ? 'C' : 'D';
}
export function propCard(signal, media = {}, index = 0, teams = {}, notebook = {}) {
  const side = signal.direction === 'over' ? 'OVER' : 'UNDER';
  const name = esc(signal.playerName), market = esc(signal.marketLabel), line = fmt(signal.line);
  const photo = media[signal.playerId]?.headshot;
  const team = teams[signal.playerTeam] || {};
  const color = /^#[0-9a-f]{6}$/i.test(team.color || '') ? team.color : '#173b60';
  const confidence = numeric(signal.confidence) && signal.confidence >= 0 && signal.confidence <= 100 ? `${fmt(signal.confidence)}%` : '—';
  const badge = numeric(signal.confidence) && signal.confidence >= 80 && signal.confidence <= 100;
  const logo = team.logo ? `<img src="${esc(team.logo)}" alt="">` : `<b>${esc(signal.playerTeam)}</b>`;
  const book = signal.lineSource === 'quoted' && signal.sportsbook ? String(signal.sportsbook).replace(/[_-]/g,' ') : 'Market average';
  const bookBadge = book.toLowerCase().replace(/[^a-z]/g,'') === 'draftkings' ? '<img class="chart-book-logo" src="/assets/draftkings-source.png" alt="DraftKings">' : '';
  const brief = doctorBrief(signal,notebook);
  const label = `${signal.playerName}: ${side} ${line} ${signal.marketLabel}`;
  const backId = `card-evidence-${index}`;
  const position = {QB:'Quarterback',RB:'Running back',WR:'Wide receiver',TE:'Tight end'}[signal.position] || signal.position;
  return `<article class="sports-card collector ${signal.direction}" style="--team-color:${color}"><button class="card-flip" type="button" aria-expanded="false" aria-controls="${backId}" aria-label="${esc(label)}. Flip for Doctor Chart" data-card-label="${esc(label)}"><span class="card-rotor"><span class="card-face card-front"><span class="collector-frame"><span class="collector-photo"><span class="collector-brand">DR<span aria-hidden="true">━━</span><br>LOCKS</span>${badge ? '<img class="doctor-badge" src="/assets/dr-locks-badge.png" alt="Dr. Locks: confidence at least 80 percent">' : ''}${photo ? `<img class="collector-portrait" src="${esc(photo)}" alt="" loading="lazy">` : `<span class="collector-initials">${esc((signal.playerName || '').split(' ').map(n=>n[0]).slice(0,2).join(''))}</span>`}<span class="collector-line"><span class="collector-ball" aria-hidden="true"><img src="/assets/card-football.svg" alt=""></span><span><b>${side} ${line}</b><strong>${market}</strong></span></span></span><span class="collector-nameplate"><span class="collector-confidence"><b>${confidence}</b><small>CONFIDENCE</small></span><span class="collector-team">${logo}</span><span class="collector-name"><strong>${name}</strong><small>${esc(position)}</small></span></span><span class="collector-flip-hint">Doctor Chart ↻</span></span></span><span class="card-face card-back doctor-chart" id="${backId}" aria-hidden="true" inert><span class="chart-frame"><span class="chart-header"><span class="chart-team">${logo}</span><span><strong>${name}</strong><small>${esc(signal.playerTeam)} · ${esc(position)}</small></span><b class="chart-number">DC-${String(index+1).padStart(2,'0')}</b></span><strong class="chart-title">[ DOCTOR CHART ]</strong><span class="chart-bet"><b>BETTING LINE</b><span>${side} ${line} ${market}</span><span class="chart-book">${bookBadge}${esc(book)}</span></span>${brief.sections.map((section,i)=>`${i===1 ? `<span class="chart-statline"><b>${fmt(signal.recentGames)} G</b><span>${market}</span>${numeric(signal.recentTotal) ? `<strong>${fmt(signal.recentTotal)} <small>TOTAL</small></strong>` : ''}<strong>${fmt(signal.recentAverage)} <small>AVG</small></strong></span>` : ''}<span class="chart-section"><b>${esc(section.label)}:</b> ${esc(section.text)}</span>`).join('')}<span class="chart-source">${esc(brief.source)}${signal.oddsCapturedAt ? ` · Line captured ${esc(new Date(signal.oddsCapturedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}))}` : ''}</span><span class="chart-footer"><b>DR. LOCKS</b><span>↶ Turn card over</span></span></span></span></span></button></article>`;
}
export function flipCard(button, force) {
  const expanded = force ?? button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded',String(expanded));
  button.setAttribute('aria-label',`${button.dataset.cardLabel}. ${expanded ? 'Evidence shown. Flip back to player' : 'Flip for evidence'}`);
  for (const [selector, hidden] of [['.card-front',expanded],['.card-back',!expanded]]) {
    const face = button.querySelector(selector);
    face.setAttribute('aria-hidden',String(hidden)); face.inert = hidden;
  }
}
