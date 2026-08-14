function renderPlayers() {
  const search = (document.getElementById('player-search')?.value || '').toLowerCase();
  const pos = document.getElementById('player-pos-filter')?.value || '';
  const filter = document.getElementById('player-status-filter')?.value || 'available';
  let players = [...state.players];
  players = players.filter(p => !search || `${p.name} ${p.team} ${positionsOf(p).join(' ')}`.toLowerCase().includes(search));
  players = players.filter(p => !pos || positionsOf(p).includes(pos));
  players = players.filter(p => {
    const st = statusFor(p.id);
    if (filter === 'all') return true;
    if (filter === 'roster') return isMine(p.id);
    return st === filter;
  });
  players.sort((a, b) => num(a.rank, 99999) - num(b.rank, 99999) || num(a.adp, 99999) - num(b.adp, 99999) || a.name.localeCompare(b.name));
  const body = document.getElementById('players-body');
  if (!body) return;
  body.innerHTML = players.slice(0, 700).map(p => {
    const st = statusFor(p.id);
    const pick = draftedMap().get(p.id);
    const statusText = st === 'mine' ? 'My roster' : st === 'drafted' ? `Team ${pick.teamSlot} · ${pickLabel(pick.overall)}` : 'Available';
    const action = st === 'available' && !state.manualRosterIds.includes(p.id)
      ? `<button class="btn secondary small" data-action="add-roster" data-id="${p.id}">Add roster</button>`
      : st === 'mine' && state.manualRosterIds.includes(p.id) && !pick
        ? `<button class="btn secondary small" data-action="remove-roster" data-id="${p.id}">Remove</button>` : '';
    const src = sourceMeta(p);
    return `<tr><td>${formatRank(p.rank)}${rankMoveMarkup(p)}</td><td><div class="player-name">${esc(p.name)}</div>${p.status ? `<div class="player-meta">${esc(p.status)}</div>` : ''}${src ? `<div class="player-source-line">${esc(src)}</div>` : ''}</td><td><span class="pos-badge">${esc(positionsOf(p).join('/'))}</span></td><td>${esc(p.team || '—')}</td><td>${p.adp ?? '—'}</td><td>${p.projection ?? '—'}</td><td><span class="status-text ${st}">${esc(statusText)}</span></td><td>${action}</td></tr>`;
  }).join('') || `<tr><td colspan="8"><div class="empty-state compact">No players match this filter.</div></td></tr>`;
  document.getElementById('player-count').textContent = `${players.length} player${players.length === 1 ? '' : 's'}`;
  renderFeedStatus();
}

function renderDashboard() {
  document.getElementById('dashboard-title').textContent = state.settings.teamName || 'My Fantasy Team';
  document.getElementById('kpi-players').textContent = state.players.length;
  document.getElementById('kpi-picks').textContent = state.picks.length;
  document.getElementById('kpi-roster').textContent = myRoster().length;
  const now = teamForOverall(currentOverallPick());
  document.getElementById('kpi-current-pick').textContent = pickLabel(now.overall);
  const next = nextMyOverall();
  const mineNow = now.teamSlot === state.settings.draftSlot;
  document.getElementById('turn-pill').textContent = mineNow ? 'YOU ARE ON THE CLOCK' : next ? `Your next pick: ${pickLabel(next)}` : 'Draft complete';
  const summary = document.getElementById('next-pick-summary');
  if (!state.players.length) {
    summary.className = 'empty-state compact';
    summary.textContent = 'Refresh live rankings, import a CSV or add players manually to activate recommendations.';
  } else if (mineNow) {
    summary.className = 'rec-row';
    summary.innerHTML = `<div><div class="player-name">Your team is on the clock</div><div class="player-meta">Overall ${now.overall} · Round ${now.round} · Slot ${state.settings.draftSlot}</div></div><button class="btn primary small" id="dashboard-draft-now">Draft now</button>`;
    document.getElementById('dashboard-draft-now')?.addEventListener('click', () => switchTab('draft'));
  } else {
    const until = next ? Math.max(0, next - now.overall) : 0;
    summary.className = 'rec-row';
    summary.innerHTML = `<div><div class="player-name">Team ${now.teamSlot} is on the clock</div><div class="player-meta">${next ? `${until} selection${until === 1 ? '' : 's'} until your pick ${pickLabel(next)}` : 'No remaining pick found'}</div></div><span class="mini-pill">Pick ${now.overall}</span>`;
  }
  const recs = recommendedPlayers(5, next || now.overall);
  const recBox = document.getElementById('dashboard-recommendations');
  recBox.innerHTML = recs.map((r, i) => `<div class="rec-row"><div class="player-main"><div class="player-name">${i + 1}. ${esc(r.player.name)}</div><div class="player-meta">${esc(primaryPos(r.player))} · ${esc(recommendationReason(r.player, next || now.overall))}</div></div><span class="rec-score">${num(r.player.rank) !== null ? `#${formatRank(r.player.rank)}` : r.player.adp ? `ADP ${r.player.adp}` : '—'}</span></div>`).join('') || `<div class="empty-state compact">No available players loaded.</div>`;
  renderFeedStatus();
}

function draftPlayer(id) {
  const player = getPlayer(id);
  if (!player || draftedMap().has(id)) return;
  const info = teamForOverall(currentOverallPick());
  if (info.round > state.settings.rounds) { toast('Draft is already complete', 'error'); return; }
  state.picks.push({ playerId: id, overall: info.overall, round: info.round, teamSlot: info.teamSlot, createdAt: new Date().toISOString() });
  saveState();
  lineupResult = null;
  renderAll();
  toast(`${player.name} recorded at ${pickLabel(info.overall)}${info.teamSlot === state.settings.draftSlot ? ' — added to your roster' : ''}`);
}

function undoPick() {
  const pick = state.picks.pop();
  if (!pick) { toast('No pick to undo', 'error'); return; }
  const player = getPlayer(pick.playerId);
  saveState();
  lineupResult = null;
  renderAll();
  toast(`Undid ${player?.name || 'last pick'}`);
}

function renderDraft() {
  const info = teamForOverall(currentOverallPick());
  const complete = info.round > state.settings.rounds;
  const mine = info.teamSlot === state.settings.draftSlot;
  document.getElementById('draft-pick-title').textContent = complete ? 'Draft complete' : `Pick ${info.overall} · ${pickLabel(info.overall)}`;
  document.getElementById('draft-team-title').textContent = complete ? `${state.picks.length} picks recorded` : mine ? `${state.settings.teamName} is on the clock` : `Team ${info.teamSlot} is on the clock`;
  document.getElementById('draft-roster-name').textContent = state.settings.teamName;
  const next = nextMyOverall();
  document.getElementById('my-next-pick').textContent = mine ? 'YOUR PICK NOW' : next ? `Next: ${pickLabel(next)}` : 'No picks left';
  document.getElementById('recommendation-title').textContent = mine ? 'Who should you take?' : 'Best options for your next pick';

  const recs = recommendedPlayers(6, next || info.overall);
  document.getElementById('draft-recommendations').innerHTML = recs.map((r, i) => `<article class="draft-rec ${i === 0 ? 'top' : ''}"><div class="rank-line"><span>${i === 0 ? 'TOP FIT' : `OPTION ${i + 1}`}</span><span>${num(r.player.rank) !== null ? `#${formatRank(r.player.rank)}` : r.player.adp ? `ADP ${r.player.adp}` : ''}</span></div><h3>${esc(r.player.name)} <span class="pos-badge">${esc(primaryPos(r.player))}</span></h3><p>${esc(recommendationReason(r.player, next || info.overall))}</p><button class="btn ${mine ? 'primary' : 'secondary'} small" data-action="draft" data-id="${r.player.id}">Record current pick</button></article>`).join('') || `<div class="empty-state compact">Refresh rankings or load players to see draft recommendations.</div>`;

  const search = (document.getElementById('draft-search')?.value || '').toLowerCase();
  const pos = document.getElementById('draft-pos-filter')?.value || '';
  let avail = availablePlayers().filter(p => !search || `${p.name} ${p.team}`.toLowerCase().includes(search));
  avail = avail.filter(p => !pos || positionsOf(p).includes(pos));
  avail.sort((a, b) => recommendationScore(b, info.overall) - recommendationScore(a, info.overall));
  document.getElementById('available-count').textContent = `${avail.length} available`;
  document.getElementById('draft-players-body').innerHTML = avail.slice(0, 500).map(p => {
    const adp = num(p.adp);
    const value = adp === null ? '—' : Math.round(adp - info.overall);
    const valueText = value === '—' ? '—' : value > 0 ? `+${value}` : String(value);
    const src = sourceMeta(p);
    return `<tr><td>${formatRank(p.rank)}${rankMoveMarkup(p)}</td><td><div class="player-name">${esc(p.name)}</div><div class="player-meta">${esc(p.team || '')}${p.bye ? ` · Bye ${esc(p.bye)}` : ''}${p.status ? ` · ${esc(p.status)}` : ''}</div>${src ? `<div class="player-source-line">${esc(src)}</div>` : ''}</td><td><span class="pos-badge">${esc(positionsOf(p).join('/'))}</span></td><td>${p.adp ?? '—'}</td><td>${p.projection ?? '—'}</td><td>${valueText}</td><td><button class="btn primary small" data-action="draft" data-id="${p.id}">Draft</button></td></tr>`;
  }).join('') || `<tr><td colspan="7"><div class="empty-state compact">No available players match.</div></td></tr>`;

  const draftRoster = myDraftPicks().map(p => ({ pick: p, player: getPlayer(p.playerId) })).filter(x => x.player);
  const manual = state.manualRosterIds.filter(id => !draftRoster.some(x => x.player.id === id)).map(id => ({ player: getPlayer(id) })).filter(x => x.player);
  document.getElementById('draft-roster').innerHTML = [...draftRoster, ...manual].map(x => `<div class="mini-roster-row"><span class="pick-num">${x.pick ? pickLabel(x.pick.overall) : 'MAN'}</span><div><div class="player-name">${esc(x.player.name)}</div><div class="player-meta">${esc(x.player.team || '')}</div></div><span class="pos-badge">${esc(primaryPos(x.player))}</span></div>`).join('') || `<div class="empty-state compact">Your selections will appear here.</div>`;
  renderDraftBoard();
  renderFeedStatus();
}

function renderDraftBoard() {
  const teams = state.settings.teams;
  const rounds = state.settings.rounds;
  const byKey = new Map(state.picks.map(p => [`${p.round}-${p.teamSlot}`, p]));
  let html = `<div class="board-grid" style="grid-template-columns:64px repeat(${teams},145px)"><div class="board-cell header round-label">Round</div>`;
  for (let t = 1; t <= teams; t++) html += `<div class="board-cell header ${t === state.settings.draftSlot ? 'mine' : ''}">${t === state.settings.draftSlot ? esc(state.settings.teamName) : `Team ${t}`}</div>`;
  for (let r = 1; r <= rounds; r++) {
    html += `<div class="board-cell round-label">R${r}</div>`;
    for (let t = 1; t <= teams; t++) {
      const pick = byKey.get(`${r}-${t}`);
      const p = pick ? getPlayer(pick.playerId) : null;
      const overall = overallForRoundTeam(r, t);
      html += `<div class="board-cell ${t === state.settings.draftSlot ? 'mine' : ''}"><div class="board-pick-num">${overall} · ${pickLabel(overall)}</div>${p ? `<div class="board-player">${esc(p.name)}</div><div class="board-player-pos">${esc(primaryPos(p))}</div>` : ''}</div>`;
    }
  }
  html += '</div>';
  document.getElementById('draft-board').innerHTML = html;
}
