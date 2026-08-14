const DEFAULT_LEAGUE_TEAMS_14 = [
  'Kimchi Eaters', 'Commissioner…', "G’s Spots", 'I Love Hockey!', 'Touchdown & …',
  'Team Reynolds', 'Muscles By Mel', 'Mayor of OTF', "Jesse’s No…", 'My Guy',
  'Jake Only We…', 'HIIT Happens', 'Ihatefantasy…', 'Chorizos'
];

function ensureLeagueData() {
  const count = Math.max(2, Number(state.settings.teams) || 14);
  if (!Array.isArray(state.leagueTeams)) state.leagueTeams = [];
  const existing = new Map(state.leagueTeams.map(t => [Number(t.slot), t]));
  state.leagueTeams = Array.from({ length: count }, (_, i) => {
    const slot = i + 1;
    const old = existing.get(slot) || {};
    const preset = count === 14 ? DEFAULT_LEAGUE_TEAMS_14[i] : '';
    return { slot, name: old.name || preset || `Team ${slot}` };
  });
  if (!state.matchups || typeof state.matchups !== 'object') state.matchups = {};
}

function leagueTeamName(slot) {
  ensureLeagueData();
  return state.leagueTeams.find(t => t.slot === Number(slot))?.name || `Team ${slot}`;
}

function renderLeagueTeams() {
  ensureLeagueData();
  const grid = document.getElementById('league-teams-grid');
  if (!grid) return;
  grid.innerHTML = state.leagueTeams.map(team => `
    <label class="team-name-card ${team.slot === Number(state.settings.draftSlot) ? 'mine' : ''}">
      <span>Draft slot ${team.slot}${team.slot === Number(state.settings.draftSlot) ? ' · MY TEAM' : ''}</span>
      <input data-team-slot="${team.slot}" value="${esc(team.name)}" aria-label="Team ${team.slot} name" />
    </label>`).join('');

  const week = Math.max(1, Math.min(18, Number(document.getElementById('matchup-week')?.value) || 1));
  const select = document.getElementById('matchup-opponent');
  if (select) {
    const mine = Number(state.settings.draftSlot);
    select.innerHTML = `<option value="">Select opponent</option>` + state.leagueTeams
      .filter(t => t.slot !== mine)
      .map(t => `<option value="${t.slot}">${esc(t.name)} · Slot ${t.slot}</option>`).join('');
    select.value = state.matchups[String(week)] || '';
  }
  renderMatchupSummary();
}

function renderMatchupSummary() {
  const box = document.getElementById('matchup-summary');
  if (!box) return;
  const week = Math.max(1, Math.min(18, Number(document.getElementById('matchup-week')?.value) || 1));
  const opponentSlot = Number(state.matchups?.[String(week)] || 0);
  const mine = leagueTeamName(state.settings.draftSlot);
  box.innerHTML = opponentSlot
    ? `<div class="matchup-card"><span>WEEK ${week}</span><strong>${esc(mine)} <em>vs</em> ${esc(leagueTeamName(opponentSlot))}</strong><p>Opponent selected for weekly lineup, waiver and trade analysis.</p></div>`
    : `<div class="empty-state compact">Choose your Week ${week} opponent to anchor matchup-specific advice.</div>`;
}

function saveLeagueTeams() {
  ensureLeagueData();
  document.querySelectorAll('[data-team-slot]').forEach(input => {
    const team = state.leagueTeams.find(t => t.slot === Number(input.dataset.teamSlot));
    if (team) team.name = input.value.trim() || `Team ${team.slot}`;
  });
  const mine = state.leagueTeams.find(t => t.slot === Number(state.settings.draftSlot));
  if (mine) state.settings.teamName = mine.name;
  saveState();
  populateSettings();
  renderAll();
  renderLeagueTeams();
  toast('League team names saved');
}

function saveWeeklyMatchup() {
  ensureLeagueData();
  const week = Math.max(1, Math.min(18, Number(document.getElementById('matchup-week').value) || 1));
  const opponent = Number(document.getElementById('matchup-opponent').value || 0);
  if (opponent === Number(state.settings.draftSlot)) return toast('Your opponent must be another team', 'error');
  if (opponent) state.matchups[String(week)] = opponent;
  else delete state.matchups[String(week)];
  saveState();
  renderMatchupSummary();
  toast(opponent ? `Week ${week} matchup saved` : `Week ${week} matchup cleared`);
}

function bindLeagueControls() {
  document.getElementById('save-team-names')?.addEventListener('click', saveLeagueTeams);
  document.getElementById('save-matchup')?.addEventListener('click', saveWeeklyMatchup);
  document.getElementById('matchup-week')?.addEventListener('change', renderLeagueTeams);
}
