import {esc} from '../ui/components.js';
export const positions=['QB','RB','WR','TE','DST'];
export function selectionUrl(season,week){return `/leaderboard/?season=${encodeURIComponent(season)}&week=${encodeURIComponent(week)}`;}
export function imageCandidates(...urls){return [...new Set(urls.filter(url=>typeof url==='string'&&(/^https:\/\//.test(url)||/^\/(?!\/)/.test(url))))];}
export function attachImage(host,urls,{className='',alt='',focalX=50,focalY=50,eager=false}={}){
  const candidates=imageCandidates(...urls);let index=0;
  const next=()=>{if(index>=candidates.length){host.classList.add('image-unavailable');return;}const img=document.createElement('img');img.className=className;img.alt=alt;img.loading=eager?'eager':'lazy';img.style.objectPosition=`${Math.min(100,Math.max(0,Number(focalX)||0))}% ${Math.min(100,Math.max(0,Number(focalY)||0))}%`;img.onerror=()=>{img.remove();host.classList.add('image-fallback');next();};img.src=candidates[index++];host.append(img);};next();
}
export function rowMarkup(row){return `<article class="leader-row" aria-label="${esc(row.position)} leader: ${esc(row.name)}, ${Number(row.fantasyPoints).toFixed(2)} fantasy points"><span class="leader-position">${esc(row.position)}</span><strong class="score-shield">${Number(row.fantasyPoints).toFixed(2)}</strong><div class="leader-identity"><h2>${esc(row.name)}</h2><span>${esc(row.team)}</span></div><div class="leader-art" aria-hidden="true"><span class="row-team-mark"></span><span class="row-player-mark"></span></div></article>`;}
export function skeletonMarkup(){return positions.map(position=>`<div class="leader-row skeleton" aria-hidden="true"><span class="leader-position">${position}</span><span class="score-shield"></span><span class="skeleton-name"></span></div>`).join('');}
