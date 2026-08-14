// Apply the known Yahoo league preset without modifying the shared core runtime.
(function applyYahooLeaguePreset(){
  const s = state.settings || {};
  const untouched = Number(s.teams) === 12 && Number(s.draftSlot) === 1 && (!s.teamName || s.teamName === 'My Team');
  if (untouched) state.settings = { ...s, leagueName: 'Yahoo Fantasy League', teamName: 'HIIT Happens', teams: 14, draftSlot: 12 };
  if (!state.leagueTeams) state.leagueTeams = [];
  if (!state.matchups) state.matchups = {};
  if (!state.teamRosters) state.teamRosters = {};
  if (!state.weeklyProjections) state.weeklyProjections = {};
  saveState();
})();
