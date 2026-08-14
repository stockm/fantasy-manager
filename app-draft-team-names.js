// Keep the Draft Room synchronized with the saved league draft-order names.
(function installDraftTeamNames(){
  function applyDraftTeamNames(){
    if (typeof ensureLeagueData !== 'function' || typeof leagueTeamName !== 'function') return;
    ensureLeagueData();
    const info = teamForOverall(currentOverallPick());
    const title = document.getElementById('draft-team-title');
    if (title && info.round <= state.settings.rounds) title.textContent = `${leagueTeamName(info.teamSlot)} is on the clock`;
    document.querySelectorAll('#draft-board .board-cell.header:not(.round-label)').forEach((el, i) => {
      el.textContent = leagueTeamName(i + 1);
    });
  }

  const priorRenderDraft = renderDraft;
  renderDraft = function(){
    priorRenderDraft();
    applyDraftTeamNames();
  };

  // app-ui-c performs its initial render before app-league is loaded, so refresh
  // the already-rendered draft board once all league-name helpers are available.
  applyDraftTeamNames();
})();
