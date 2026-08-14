const DEFAULT_LEAGUE_TEAMS_14 = [
  'Kimchi Eaters', 'Commissioner…', "G’s Spots", 'I Love Hockey!', 'Touchdown & …',
  'Team Reynolds', 'Muscles By Mel', 'Mayor of OTF', "Jesse’s No…", 'My Guy',
  'Jake Only We…', 'HIIT Happens', 'Ihatefantasy…', 'Chorizos'
];

function isGenericLeagueName(name, slot) {
  const v = String(name || '').trim();
  return !v || v === `Team ${slot}` || v === `Team ${slot} name` || (slot === Number(state.settings.draftSlot) && v === 'My Team');
}

function ensureLeagueData() {
  const count = Math.max(2, Number(state.settings.teams) || 14);
  if (!Array.isArray(state.leagueTeams)) state.leagueTeams = [];
  const existing = new Map(state.leagueTeams.map(t => [Number(t.slot), t]));
  let migrated = false;
  state.leagueTeams = Array.from({ length: count }, (_, i) => {
    const slot = i + 1;
    const old = existing.get(slot) || {};
    const preset = count === 14 ? DEFAULT_LEAGUE_TEAMS_14[i] : '';
    const name = (preset && isGenericLeagueName(old.name, slot)) ? preset : (old.name || preset || `Team ${slot}`);
    if (name !== old.name) migrated = true;
    return { ...old, slot, name };
  });
  if (!state.matchups || typeof state.matchups !== 'object') state.matchups = {};
  const mine = state.leagueTeams.find(t => t.slot === Number(state.settings.draftSlot));
  if (mine && isGenericLeagueName(state.settings.teamName, state.settings.draftSlot)) {
    state.settings.teamName = mine.name;
    migrated = true;
  }
  if (migrated) saveState();
}

function leagueTeamName(slot) {
  ensureLeagueData();
  return state.leagueTeams.find(t => t.slot === Number(slot))?.name || `Team ${slot}`;
}

function installLeagueUI() {
  ensureLeagueData();
  const backupNav = document.querySelector('.nav-item[data-tab="backup"]');
  if (backupNav && !document.querySelector('[data-tab="league"]')) {
    backupNav.insertAdjacentHTML('beforebegin', '<button class="nav-item" data-tab="league">Teams & Matchups</button>');
  }

  const backupView = document.getElementById('view-backup');
  if (backupView && !document.getElementById('view-league')) {
    backupView.insertAdjacentHTML('beforebegin', `
      <section class="view league-view" id="view-league">
        <div class="page-head compact-head league-page-head">
          <div>
            <div class="eyebrow">LEAGUE</div>
            <h1>Teams & weekly matchups</h1>
            <p class="page-copy">Keep every league team named correctly, then select your weekly opponent for lineup, waiver and trade advice.</p>
          </div>
        </div>

        <article class="surface league-team-surface">
          <div class="league-surface-head">
            <div>
              <span class="section-label">LEAGUE TEAMS</span>
              <h2>Draft order & team names</h2>
              <p>Edit any shortened Yahoo names once and they will be used throughout Draft, Players, My Team and matchup screens.</p>
            </div>
            <button class="btn primary league-save-btn" id="save-team-names">Save team names</button>
          </div>
          <div class="league-teams-grid" id="league-teams-grid"></div>
        </article>

        <article class="surface matchup-surface league-matchup-surface">
          <div class="league-surface-head">
            <div>
              <span class="section-label">WEEKLY OPPONENT</span>
              <h2>Select matchup</h2>
              <p>Choose the team you face so weekly AI advice can evaluate both rosters.</p>
            </div>
          </div>
          <div class="matchup-controls">
            <label><span>Week</span><input id="matchup-week" type="number" min="1" max="18" value="1"></label>
            <label><span>Opponent</span><select id="matchup-opponent"></select></label>
            <button class="btn primary matchup-save-btn" id="save-matchup">Save matchup</button>
          </div>
          <div id="matchup-summary"></div>
        </article>
      </section>`);
  }

  if (!document.getElementById('league-pro-style')) {
    const style = document.createElement('style');
    style.id = 'league-pro-style';
    style.textContent = `
      .league-view{max-width:1500px}
      .league-page-head{margin-bottom:18px}
      .league-page-head h1{letter-spacing:-.035em}
      .league-team-surface,.league-matchup-surface{padding:26px!important;overflow:hidden}
      .league-team-surface{background:linear-gradient(145deg,#101520,#0b1018)!important;border-color:#2b3548!important}
      .league-matchup-surface{margin-top:18px;background:linear-gradient(145deg,#10141d,#0c1119)!important;border-color:#2a3447!important}
      .league-surface-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:20px}
      .league-surface-head h2{margin:5px 0 6px;font-size:24px;letter-spacing:-.025em}
      .league-surface-head p{margin:0;color:#8f9bb0;font-size:13px;line-height:1.55;max-width:760px}
      .league-save-btn{flex:0 0 auto;min-width:150px}
      .league-teams-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;width:100%;min-width:0}
      .team-name-card{min-width:0;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:15px 16px 16px;border:1px solid #2d374a;border-radius:14px;background:linear-gradient(145deg,#151a25,#10151e);transition:border-color .18s ease,transform .18s ease,box-shadow .18s ease;overflow:hidden}
      .team-name-card:hover{border-color:#4b5870;transform:translateY(-1px);box-shadow:0 12px 28px rgba(0,0,0,.15)}
      .team-name-card.mine{border-color:#754fe2;box-shadow:inset 0 0 0 1px rgba(142,93,255,.26),0 12px 28px rgba(64,36,126,.16)}
      .team-name-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
      .team-slot-label{font-size:10px!important;font-weight:900!important;letter-spacing:.09em;color:#8793a9;text-transform:uppercase;white-space:nowrap}
      .team-mine-pill{font-size:9px!important;font-weight:950!important;letter-spacing:.07em;color:#cdbbff;background:#241a41;border:1px solid #5c408e;border-radius:999px;padding:4px 7px;white-space:nowrap}
      .team-name-card input{display:block;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;margin:0!important;border:1px solid #343f54!important;background:#0b1018!important;color:#f3f5fa!important;border-radius:10px!important;padding:11px 12px!important;font-size:14px!important;line-height:1.3!important;outline:none}
      .team-name-card input:focus{border-color:#805cf0!important;box-shadow:0 0 0 3px rgba(128,92,240,.12)}
      .matchup-controls{display:grid;grid-template-columns:120px minmax(240px,1fr) auto;gap:14px;align-items:end;margin:4px 0 18px;min-width:0}
      .matchup-controls label{display:flex;flex-direction:column;gap:7px;min-width:0}
      .matchup-controls label>span{font-size:10px;font-weight:900;letter-spacing:.08em;color:#8e99ad;text-transform:uppercase}
      .matchup-controls input,.matchup-controls select{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;margin:0!important}
      .matchup-save-btn{min-height:44px;white-space:nowrap}
      .matchup-card{padding:18px 20px;border:1px solid #2f3a4e;border-radius:14px;background:#0c1119}
      .matchup-card span{display:block;font-size:10px;font-weight:900;letter-spacing:.09em;color:#8d99ad}
      .matchup-card strong{display:block;font-size:21px;margin:7px 0}
      .matchup-card em{font-style:normal;font-weight:500;opacity:.5;margin:0 8px}
      .matchup-card p{margin:0;color:#8c97aa;font-size:12px}
      @media(max-width:1250px){.league-teams-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:980px){.league-teams-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.league-surface-head{align-items:stretch}.league-save-btn{min-width:130px}}
      @media(max-width:700px){.league-team-surface,.league-matchup-surface{padding:18px!important}.league-surface-head{flex-direction:column;gap:14px}.league-save-btn{width:100%}.league-teams-grid{grid-template-columns:1fr}.matchup-controls{grid-template-columns:1fr}.matchup-save-btn{width:100%}}
    `;
    document.head.appendChild(style);
  }
}

function refreshWeeklyEngine() {
  if (typeof renderOpponentRosterEditor === 'function') renderOpponentRosterEditor();
  if (typeof renderAdvice === 'function') renderAdvice();
}

function renderLeagueTeams() {
  ensureLeagueData();
  const grid = document.getElementById('league-teams-grid');
  if (!grid) return;
  grid.innerHTML = state.leagueTeams.map(team => `
    <label class="team-name-card ${team.slot === Number(state.settings.draftSlot) ? 'mine' : ''}">
      <div class="team-name-meta">
        <span class="team-slot-label">Draft slot ${team.slot}</span>
        ${team.slot === Number(state.settings.draftSlot) ? '<span class="team-mine-pill">MY TEAM</span>' : ''}
      </div>
      <input data-team-slot="${team.slot}" value="${esc(team.name)}" aria-label="Draft slot ${team.slot} team name">
    </label>`).join('');

  const week = Math.max(1, Math.min(18, Number(document.getElementById('matchup-week')?.value) || 1));
  const select = document.getElementById('matchup-opponent');
  if (select) {
    select.innerHTML = '<option value="">Select opponent</option>' + state.leagueTeams
      .filter(t => t.slot !== Number(state.settings.draftSlot))
      .map(t => `<option value="${t.slot}">${esc(t.name)} · Slot ${t.slot}</option>`).join('');
    select.value = state.matchups[String(week)] || '';
  }
  renderMatchupSummary();
}

function renderMatchupSummary() {
  const box = document.getElementById('matchup-summary');
  if (!box) return;
  const week = Math.max(1, Math.min(18, Number(document.getElementById('matchup-week')?.value) || 1));
  const opponent = Number(state.matchups[String(week)] || 0);
  box.innerHTML = opponent
    ? `<div class="matchup-card"><span>WEEK ${week}</span><strong>${esc(leagueTeamName(state.settings.draftSlot))} <em>vs</em> ${esc(leagueTeamName(opponent))}</strong><p>This matchup drives lineup, waiver and trade advice for the selected week.</p></div>`
    : `<div class="empty-state compact">Choose your Week ${week} opponent to anchor matchup-specific advice.</div>`;
}

function saveLeagueTeams() {
  ensureLeagueData();
  document.querySelectorAll('[data-team-slot]').forEach(input => {
    const t = state.leagueTeams.find(x => x.slot === Number(input.dataset.teamSlot));
    if (t) t.name = input.value.trim() || `Team ${t.slot}`;
  });
  const mine = state.leagueTeams.find(t => t.slot === Number(state.settings.draftSlot));
  if (mine) state.settings.teamName = mine.name;
  saveState();
  populateSettings();
  renderAll();
  renderLeagueTeams();
  refreshWeeklyEngine();
  toast('League team names saved');
}

function saveWeeklyMatchup() {
  ensureLeagueData();
  const week = Math.max(1, Math.min(18, Number(document.getElementById('matchup-week').value) || 1));
  const opponent = Number(document.getElementById('matchup-opponent').value || 0);
  if (opponent) state.matchups[String(week)] = opponent;
  else delete state.matchups[String(week)];
  saveState();
  renderMatchupSummary();
  refreshWeeklyEngine();
  toast(opponent ? `Week ${week} matchup saved` : `Week ${week} matchup cleared`);
}

function bindLeagueControls() {
  document.querySelector('.nav-item[data-tab="league"]')?.addEventListener('click', () => {
    switchTab('league');
    renderLeagueTeams();
    refreshWeeklyEngine();
  });
  document.getElementById('save-team-names')?.addEventListener('click', saveLeagueTeams);
  document.getElementById('save-matchup')?.addEventListener('click', saveWeeklyMatchup);
  document.getElementById('matchup-week')?.addEventListener('change', () => {
    renderLeagueTeams();
    refreshWeeklyEngine();
  });
}

function applyLeagueNamesEverywhere() {
  ensureLeagueData();
  const myName = leagueTeamName(Number(state.settings.draftSlot));
  const dashboardTitle = document.getElementById('dashboard-title');
  if (dashboardTitle) dashboardTitle.textContent = myName;
  const rosterTitle = document.getElementById('roster-title');
  if (rosterTitle) rosterTitle.textContent = myName;
  const draftRosterName = document.getElementById('draft-roster-name');
  if (draftRosterName) draftRosterName.textContent = myName;

  const now = teamForOverall(currentOverallPick());
  const draftTitle = document.getElementById('draft-team-title');
  if (draftTitle && now.round <= state.settings.rounds) draftTitle.textContent = `${leagueTeamName(now.teamSlot)} is on the clock`;

  document.querySelectorAll('#draft-board .board-cell.header:not(.round-label)').forEach((el, i) => {
    el.textContent = leagueTeamName(i + 1);
  });

  document.querySelectorAll('#players-body .status-text.drafted').forEach(el => {
    const pickText = el.textContent.match(/^(?:Team )?(\d+) ·/);
    if (pickText) el.textContent = el.textContent.replace(/^(?:Team )?\d+/, leagueTeamName(Number(pickText[1])));
  });

  const summary = document.getElementById('next-pick-summary');
  if (summary && now.round <= state.settings.rounds && now.teamSlot !== Number(state.settings.draftSlot)) {
    const nameEl = summary.querySelector('.player-name');
    if (nameEl) nameEl.textContent = `${leagueTeamName(now.teamSlot)} is on the clock`;
  }
}

installLeagueUI();
bindLeagueControls();
renderLeagueTeams();
applyLeagueNamesEverywhere();

const baseRenderDraft = renderDraft;
renderDraft = function() {
  baseRenderDraft();
  applyLeagueNamesEverywhere();
};

const baseRenderPlayers = renderPlayers;
renderPlayers = function() {
  baseRenderPlayers();
  applyLeagueNamesEverywhere();
};

const baseRenderDashboard = renderDashboard;
renderDashboard = function() {
  baseRenderDashboard();
  applyLeagueNamesEverywhere();
};

const baseRenderRoster = renderRoster;
renderRoster = function() {
  baseRenderRoster();
  applyLeagueNamesEverywhere();
};

const baseRenderAll = renderAll;
renderAll = function() {
  baseRenderAll();
  renderLeagueTeams();
  applyLeagueNamesEverywhere();
};
