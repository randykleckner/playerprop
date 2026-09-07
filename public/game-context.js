// Public ESPN schedule context. No account data or weather influence on model scores.
export function normalizeGames(payload, fetchedAt) {
  return (payload.events || []).flatMap(event => {
    const competition = event.competitions?.[0];
    const away = competition?.competitors?.find(c => c.homeAway === 'away')?.team;
    const home = competition?.competitors?.find(c => c.homeAway === 'home')?.team;
    if (!away || !home || !Number.isFinite(Date.parse(event.date))) return [];
    return [{ id:event.id, start:event.date, away:away.abbreviation, home:home.abbreviation,
      matchup:`${away.displayName} at ${home.displayName}`, venue:competition.venue?.fullName || '',
      roofed:competition.venue?.indoor === true, fetchedAt,
      weather:event.weather && typeof event.weather.temperature === 'number' && Number.isFinite(event.weather.temperature)
        ? { temperature:event.weather.temperature, description:event.weather.displayValue || 'Forecast' } : null }];
  });
}
const alias = team => ({LAR:'LA',WSH:'WAS',JAC:'JAX'}[team] || team);
export function matchGame(signal, games) {
  const matches = games.filter(game => {
    const teams = signal.awayTeam && signal.homeTeam
      ? alias(game.away) === alias(signal.awayTeam) && alias(game.home) === alias(signal.homeTeam)
      : game.matchup === signal.matchup;
    return teams && (!signal.commenceAt || Date.parse(signal.commenceAt) === Date.parse(game.start));
  });
  return matches.length === 1 ? matches[0] : null;
}
export function showLock(confidence) { return typeof confidence === 'number' && Number.isFinite(confidence) && confidence > 80 && confidence <= 100; }
export function weatherText(game, now = Date.now()) {
  if (!game) return 'Weather unavailable';
  const roof = game.roofed ? ' · Roofed venue; roof status unverified' : '';
  if (Date.parse(game.start) <= now) return 'Game started · forecast archived' + roof;
  if (!Number.isFinite(Date.parse(game.fetchedAt)) || now - Date.parse(game.fetchedAt) > 6 * 3600000) return 'Forecast stale · refresh needed' + roof;
  if (!game.weather) return 'Forecast not available yet' + roof;
  return `${Math.round(game.weather.temperature)}°F · ${game.weather.description}${game.roofed ? ' · Outside roofed venue; roof status unverified' : ''}`;
}
