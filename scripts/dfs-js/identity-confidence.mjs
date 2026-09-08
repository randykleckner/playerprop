const teams={LVR:'LV',NOS:'NO',TBB:'TB',GBP:'GB',KCC:'KC',SFO:'SF',NEP:'NE',JAC:'JAX',LAR:'LA',WSH:'WAS'};
const team=x=>teams[x]||x;
const name=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,'').trim().replace(/\s+(jr|sr|ii|iii|iv)$/,'').replace(/\s+/g,' ');
export const TIERS=['verified','strongly_corroborated','provisional','unresolved'];
export function confidenceFor(p,e,projection,schedule,overrides=[],now=new Date().toISOString()){
 if(p.position==='DST')return {tier:'team_identity',checks:{}};
 if(!p.id)return {tier:'unresolved',checks:{}};
 const c=e?.canonical_evidence,r=e?.crosswalk_evidence?.length===1?e.crosswalk_evidence[0]:null;
 const matching=overrides.filter(o=>o.player_id===p.id&&o.action==='accept_scoped_context_for_strong_corroboration'&&Date.parse(now)>=Date.parse(o.effective_from)&&Date.parse(now)<Date.parse(o.effective_until)&&o.expected_name===p.player_name&&o.expected_team===p.team&&o.expected_position===p.position&&Object.entries(o.external_ids).every(([k,v])=>e?.external_ids?.[k]===v));
 if(matching.length>1)throw Error('Conflicting scoped identity overrides');
 const o=matching[0],scoped=Boolean(o&&r&&o.expected_crosswalk_name===r.name&&o.expected_crosswalk_position===r.position&&o.sources?.length&&o.reviewer&&o.reviewed_on);
 const game=schedule.events?.some(event=>Date.parse(event.date)===Date.parse(p.game_start_time)&&event.competitions?.some(g=>{const t=g.competitors.map(x=>team(x.team.abbreviation));return t.length===2&&t.includes(p.team)&&t.includes(p.opponent)&&p.team!==p.opponent;}));
 const checks={canonical_id:c?.player_id===p.id,name:name(c?.display_name)===name(p.player_name),canonical_team:team(c?.current_team_id)===p.team,position:c?.position===p.position,current_game:!!game,
  crosswalk:r?.gsis_id===p.id&&!!c?.espn_id&&String(r?.espn_id)===String(c?.espn_id)&&team(r?.team)===p.team&&(scoped||(name(r?.name)===name(p.player_name)&&r?.position===p.position)),
  espn_projection:!!projection&&projection.player_id===p.id&&String(projection.source_player_id)===String(c?.espn_id)&&projection.team===p.team&&projection.position===p.position};
 // Verified requires a pre-existing stable/reviewed external-ID assignment; scoped
 // name/position overrides can only authorize the strongly corroborated tier.
 const tier=!p.provisional?'verified':Object.values(checks).every(Boolean)?'strongly_corroborated':'provisional';
 return {tier,checks,override_id:scoped?o.review_id:null,canonical_source:'nflverse-players-v2'};
}
export function tierCounts(players){return Object.fromEntries(TIERS.map(t=>[t,players.filter(p=>p.position!=='DST'&&p.identity_confidence===t).length]));}
