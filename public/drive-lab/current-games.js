export function currentGames(snapshot,profile,now=Date.now()){
 if(!Array.isArray(snapshot?.games)||!profile?.teamInputs)throw Error('Current game inputs unavailable');
 return snapshot.games.filter(g=>Date.parse(g.start_time)>now&&profile.teamInputs[g.home]&&profile.teamInputs[g.away]).map(g=>({gameId:g.game_id,homeTeam:g.home,awayTeam:g.away,homeTeamInputs:profile.teamInputs[g.home],awayTeamInputs:profile.teamInputs[g.away],inputsTimestamp:snapshot.data_as_of,market:g}));
}
