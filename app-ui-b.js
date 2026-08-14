function addToRoster(id) {
  if (!getPlayer(id)) return;
  if (!state.manualRosterIds.includes(id) && !myDraftPicks().some(p => p.playerId === id)) state.manualRosterIds.push(id);
  saveState(); lineupResult = null; renderAll(); toast('Player added to your roster');
}

function removeFromRoster(id) {
  state.manualRosterIds = state.manualRosterIds.filter(x => x !== id);
  saveState(); lineupResult = null; renderAll(); toast('Player removed from manual roster');
}

function slotDefinitions() {
  const r = state.settings.roster;
  const slots = [];
  const add = (type, count) => { for (let i = 1; i <= Number(count || 0); i++) slots.push({ type, label: Number(count) > 1 ? `${type} ${i}` : type, displayOrder: slots.length }); };
  add('QB', r.QB); add('RB', r.RB); add('WR', r.WR); add('TE', r.TE); add('FLEX', r.FLEX); add('SFLEX', r.SFLEX); add('D/ST', r.DST); add('K', r.K);
  return slots;
}

function eligible(player, slotType) {
  const p = positionsOf(player);
  if (slotType === 'FLEX') return p.some(x => ['RB', 'WR', 'TE'].includes(x));
  if (slotType === 'SFLEX') return p.some(x => ['QB', 'RB', 'WR', 'TE'].includes(x));
  return p.includes(slotType);
}

function optimizeLineup() {
  const roster = myRoster();
  const slots = slotDefinitions();
  if (!roster.length || !slots.length) { lineupResult = { total: 0, assignments: [] }; renderRoster(); return; }
  const ordered = [...slots].sort((a, b) => {
    const ca = roster.filter(p => eligible(p, a.type)).length;
    const cb = roster.filter(p => eligible(p, b.type)).length;
    return ca - cb;
  });
  const memo = new Map();
  function solve(idx, mask) {
    if (idx >= ordered.length) return { score: 0, assignments: [] };
    const key = `${idx}|${mask.toString()}`;
    if (memo.has(key)) return memo.get(key);
    const slot = ordered[idx];
    let tail = solve(idx + 1, mask);
    let best = { score: tail.score, assignments: [{ slot, player: null }, ...tail.assignments] };
    for (let i = 0; i < roster.length; i++) {
      const bit = 1n << BigInt(i);
      if ((mask & bit) !== 0n || !eligible(roster[i], slot.type)) continue;
      const next = solve(idx + 1, mask | bit);
      const points = num(roster[i].projection, 0);
      const score = points + 0.0001 + next.score;
      if (score > best.score) best = { score, assignments: [{ slot, player: roster[i] }, ...next.assignments] };
    }
    memo.set(key, best);
    return best;
  }
  const result = solve(0, 0n);
  result.assignments.sort((a, b) => a.slot.displayOrder - b.slot.displayOrder);
  lineupResult = { total: result.assignments.reduce((s, x) => s + (x.player ? num(x.player.projection, 0) : 0), 0), assignments: result.assignments };
  renderRoster();
  toast('Optimal legal lineup calculated');
}

function renderRoster() {
  const myTeamName = typeof leagueTeamName === 'function' ? leagueTeamName(Number(state.settings.draftSlot)) : (state.settings.teamName || 'My Team');
  document.getElementById('roster-title').textContent = myTeamName;
  const roster = myRoster();
  document.getElementById('roster-body').innerHTML = roster.map(p => {
    const pick = myDraftPicks().find(x => x.playerId === p.id);
    const manualOnly = state.manualRosterIds.includes(p.id) && !pick;
    const source = pick ? `Draft ${pickLabel(pick.overall)}` : 'Manual';
    return `<tr><td><div class="player-name">${esc(p.name)}</div>${p.status ? `<div class="player-meta">${esc(p.status)}</div>` : ''}</td><td><span class="pos-badge">${esc(positionsOf(p).join('/'))}</span></td><td>${esc(p.team || '—')}</td><td><input class="roster-projection" type="number" step="0.1" value="${p.projection ?? ''}" data-projection-id="${p.id}" placeholder="0.0" /></td><td><span class="status-text ${pick ? 'mine' : ''}">${source}</span></td><td>${manualOnly ? `<button class="btn secondary small" data-action="remove-roster" data-id="${p.id}">Remove</button>` : ''}</td></tr>`;
  }).join('') || `<tr><td colspan="6"><div class="empty-state compact">Draft players or add them manually from the Players screen.</div></td></tr>`;

  const out = document.getElementById('lineup-output');
  if (!lineupResult) {
    out.innerHTML = `<div class="empty-state compact">Enter weekly projections, then click Optimize lineup.</div>`;
    document.getElementById('lineup-total').textContent = '';
  } else {
    document.getElementById('lineup-total').textContent = `${lineupResult.total.toFixed(1)} pts`;
    out.innerHTML = lineupResult.assignments.map(x => `<div class="lineup-row"><span class="lineup-slot">${esc(x.slot.label)}</span><div>${x.player ? `<div class="player-name">${esc(x.player.name)}</div><div class="player-meta">${esc(primaryPos(x.player))} · ${esc(x.player.team || '')}</div>` : `<span class="muted">Empty</span>`}</div><span class="lineup-points">${x.player ? num(x.player.projection, 0).toFixed(1) : '—'}</span></div>`).join('');
  }
}