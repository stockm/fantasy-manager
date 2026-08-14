function renderAll() {
  renderDashboard();
  renderPlayers();
  renderDraft();
  renderRoster();
  renderFeedStatus();
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function bindForms() {
  document.getElementById('settings-form').addEventListener('submit', saveSettings);
  document.getElementById('team-count').addEventListener('change', e => { document.getElementById('draft-slot').max = e.target.value; });
  document.getElementById('add-player-form').addEventListener('submit', e => {
    e.preventDefault();
    addPlayer({
      name: document.getElementById('player-name').value,
      team: document.getElementById('player-team').value,
      position: document.getElementById('player-pos').value,
      rank: document.getElementById('player-rank').value,
      adp: document.getElementById('player-adp').value,
      projection: document.getElementById('player-proj').value
    });
    e.target.reset(); renderAll(); toast('Player added');
  });
  document.getElementById('csv-file').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const result = importCSV(await file.text());
      document.getElementById('import-result').textContent = `${result.added} added · ${result.updated} updated`;
      renderAll(); toast(`Imported ${result.added + result.updated} players`);
    } catch (err) { document.getElementById('import-result').textContent = err.message; toast(err.message, 'error'); }
    e.target.value = '';
  });
  document.getElementById('quick-draft-form').addEventListener('submit', e => {
    e.preventDefault();
    const p = addPlayer({ name: document.getElementById('quick-draft-name').value, position: document.getElementById('quick-draft-pos').value });
    e.target.reset(); draftPlayer(p.id);
  });
}

function bindControls() {
  ['player-search', 'player-pos-filter', 'player-status-filter'].forEach(id => document.getElementById(id).addEventListener(id.includes('search') ? 'input' : 'change', renderPlayers));
  ['draft-search', 'draft-pos-filter'].forEach(id => document.getElementById(id).addEventListener(id.includes('search') ? 'input' : 'change', renderDraft));
  document.getElementById('undo-pick').addEventListener('click', undoPick);
  document.getElementById('jump-my-pick').addEventListener('click', () => document.querySelector('.recommendation-surface')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.getElementById('optimize-lineup').addEventListener('click', optimizeLineup);
  document.getElementById('refresh-live-data').addEventListener('click', refreshLiveData);
  document.getElementById('refresh-rankings-only').addEventListener('click', () => refreshRankings());
  document.getElementById('download-template').addEventListener('click', () => download('fantasy-player-template.csv', 'name,team,position,rank,adp,projection,bye,tier,status\n', 'text/csv'));
  document.getElementById('export-backup').addEventListener('click', () => download(`fantasy-manager-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(state, null, 2), 'application/json'));
  document.getElementById('backup-file').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed.settings || !Array.isArray(parsed.players) || !Array.isArray(parsed.picks)) throw new Error('Not a valid Fantasy Manager backup');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); state = loadState(); lineupResult = null; populateSettings(); renderAll(); toast('Backup restored');
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });
  document.getElementById('reset-data').addEventListener('click', () => {
    if (!confirm('Clear all Fantasy Manager data stored in this browser?')) return;
    localStorage.removeItem(STORAGE_KEY); state = defaults(); lineupResult = null; populateSettings(); renderAll(); toast('Local data reset');
    maybeAutoRefresh();
  });

  document.body.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go && go.dataset.go) { switchTab(go.dataset.go); return; }
    const btn = e.target.closest('[data-action]'); if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'draft') draftPlayer(id);
    if (action === 'add-roster') addToRoster(id);
    if (action === 'remove-roster') removeFromRoster(id);
  });

  document.body.addEventListener('change', e => {
    const input = e.target.closest('[data-projection-id]'); if (!input) return;
    const p = getPlayer(input.dataset.projectionId); if (!p) return;
    p.projection = num(input.value); saveState(); lineupResult = null; renderDashboard(); renderDraft();
    toast('Projection updated');
  });
}

function maybeAutoRefresh() {
  if (state.picks.length) return;
  const last = state.feed.rankingsUpdatedAt ? new Date(state.feed.rankingsUpdatedAt).getTime() : 0;
  const should = !state.players.length || !last || Date.now() - last > AUTO_RANKINGS_REFRESH_MS;
  if (!should) return;
  setTimeout(async () => {
    const ok = await refreshRankings({ silent: true });
    if (ok) await refreshSleeperMetadata({ force: false, silent: true });
    renderAll();
  }, 500);
}

function init() {
  bindNavigation();
  bindForms();
  bindControls();
  populateSettings();
  renderAll();
  maybeAutoRefresh();
}

init();
