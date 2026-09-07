const finite = value => typeof value === 'number' && Number.isFinite(value);
const n = value => finite(value) ? value.toLocaleString('en-US',{maximumFractionDigits:1}) : '—';
export const chartKey = signal => `${signal.eventId}|${signal.playerId}|${signal.marketKey}`;
export function reviewedNote(signal, notebook, now = Date.now()) {
  const note = notebook?.entries?.[chartKey(signal)];
  if (!note || note.reviewed !== true || note.line !== signal.line || note.direction !== signal.direction || note.sportsbook !== signal.sportsbook || note.oddsCapturedAt !== signal.oddsCapturedAt) return null;
  if (!Number.isFinite(Date.parse(note.reviewedAt)) || Date.parse(note.reviewedAt) > now || !Number.isFinite(Date.parse(note.expiresAt)) || Date.parse(note.expiresAt) <= now || (signal.commenceAt && Date.parse(signal.commenceAt) <= now)) return null;
  if (!Array.isArray(note.sources) || !note.sources.length || note.sources.some(s => !s.title || !/^https:\/\//.test(s.url || ''))) return null;
  return note;
}
export function doctorBrief(signal, notebook = {}, now = Date.now()) {
  const name = signal.playerName || 'Player', market = signal.marketLabel || 'production';
  const direction = signal.direction === 'over' ? 'above' : 'below';
  const count = signal.direction === 'over' ? signal.recentOverCount : signal.recentUnderCount;
  const window = `${signal.historySeason || 'recorded'} sample`;
  const sections = [];
  if (finite(signal.recentAverage)) {
    let text = `${name} averaged ${n(signal.recentAverage)} ${market} across his last ${n(signal.recentGames)} recorded games, against a ${n(signal.line)} line.`;
    if (Number.isInteger(count)) text = `${count} of ${n(signal.recentGames)} games finished ${direction} this line${signal.recentPushCount ? `; ${signal.recentPushCount} landed on it` : ''}. ${name} averaged ${n(signal.recentAverage)} ${market}.`;
    sections.push({ label:'Game time', text });
  }
  if (finite(signal.defenseRecentAverageAllowed) && signal.defenseRecentGames) {
    sections.push({label:'Defense',text:`${signal.opponentTeam} allowed ${n(signal.defenseRecentAverageAllowed)} ${market} per game to opposing ${signal.position}s over its last ${n(signal.defenseRecentGames)} games in the ${window}. Its season average was ${n(signal.defenseAverageAllowed)}, versus ${n(signal.leagueDefenseAverageAllowed)} league-wide.`});
  } else if (finite(signal.defenseAverageAllowed)) {
    sections.push({label:'Defense',text:`Opposing ${signal.position}s averaged ${n(signal.defenseAverageAllowed)} ${market} per game against ${signal.opponentTeam} in the ${window}, versus ${n(signal.leagueDefenseAverageAllowed)} across the league.`});
  }
  if (signal.historicalPlayCaller) sections.push({label:'Play callers',text:`${signal.historicalPlayCaller} called the offense in ${n(signal.historicalCoachingGames)} of the sampled games (${window}).`});
  else if (finite(signal.recentSnapShare)) sections.push({label:'Role',text:`${name} played ${n(signal.recentSnapShare)}% of his team's offensive snaps across the sampled games${signal.limitedGames ? `; ${signal.limitedGames} carried a limited designation` : ''}.`});
  const note = reviewedNote(signal,notebook,now);
  if (note) for (const [key,label] of [['gameTime','Game time'],['defense','Defense'],['playCallers','Play callers'],['watch','Watch']]) {
    if (typeof note[key] !== 'string' || !note[key].trim() || note[key].length > 700) continue;
    const index = sections.findIndex(s=>s.label===label);
    const item = {label,text:note[key].trim()}; if(index>=0)sections[index]=item;else sections.push(item);
  }
  return {sections,source:note ? `Reviewed ${note.reviewedAt.slice(0,10)} · ${note.sources.map(s=>s.title).join('; ')}` : `NFLverse game logs · ${window}`};
}
