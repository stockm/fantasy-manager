const STORAGE_KEY = 'fantasyManagerStateV1';

const defaults = () => ({
  version: 1,
  settings: {
    leagueName: 'My Fantasy League',
    teamName: 'My Team',
    teams: 12,
    draftSlot: 1,
    rounds: 16,
    scoring: 'half-ppr',
    roster: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SFLEX: 0, DST: 1, K: 1, BENCH: 6 }
  },
  players: [],
  picks: [],
  manualRosterIds: []
});

let state = loadState();
let lineupResult = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    const d = defaults();
    return {
      ...d,
      ...parsed,
      settings: {
        ...d.settings,
        ...(parsed.settings || {}),
        roster: { ...d.settings.roster, ...((parsed.settings || {}).roster || {}) }
      },
      players: Array.isArray(parsed.players) ? parsed.players : [],
      picks: Array.isArray(parsed.picks) ? parsed.picks : [],
      manualRosterIds: Array.isArray(parsed.manualRosterIds) ? parsed.manualRosterIds : []
    };
  } catch (e) {
    console.error(e);
    return defaults();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function num(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function toast(message, type = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 2400);
}

function playerId(name, team = '') {
  const base = `${name}-${team}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'player'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizePos(pos) {
  let p = String(pos || '').trim().toUpperCase();
  if (['DEF', 'DST', 'D-ST', 'D/ST'].includes(p)) return 'D/ST';
  if (p === 'PK') return 'K';
  return p;
}

function positionsOf(player) {
  const raw = Array.isArray(player.positions) ? player.positions.join(',') : (player.position || player.positions || '');
  return String(raw).split(/[\/,;|]+/).map(normalizePos).filter(Boolean);
}

function primaryPos(player) { return positionsOf(player)[0] || '—'; }

function draftedMap() {
  const m = new Map();
  state.picks.forEach(p => m.set(p.playerId, p));
  return m;
}

function getPlayer(id) { return state.players.find(p => p.id === id); }

function myDraftPicks() { return state.picks.filter(p => p.teamSlot === state.settings.draftSlot); }

function myRosterIds() {
  const ids = new Set(myDraftPicks().map(p => p.playerId));
  state.manualRosterIds.forEach(id => ids.add(id));
  return [...ids];
}

function myRoster() { return myRosterIds().map(getPlayer).filter(Boolean); }

function isMine(id) { return myRosterIds().includes(id); }

function statusFor(id) {
  const pick = draftedMap().get(id);
  if (pick) return pick.teamSlot === state.settings.draftSlot ? 'mine' : 'drafted';
  if (state.manualRosterIds.includes(id)) return 'mine';
  return 'available';
}

function currentOverallPick() { return state.picks.length + 1; }

function teamForOverall(overall) {
  const teams = Math.max(2, Number(state.settings.teams) || 12);
  const round = Math.floor((overall - 1) / teams) + 1;
  const within = ((overall - 1) % teams) + 1;
  const teamSlot = round % 2 === 1 ? within : teams - within + 1;
  return { overall, round, within, teamSlot };
}

function overallForRoundTeam(round, teamSlot) {
  const teams = state.settings.teams;
  const within = round % 2 === 1 ? teamSlot : teams - teamSlot + 1;
  return (round - 1) * teams + within;
}

function nextMyOverall(from = currentOverallPick()) {
  const max = Math.max(from + state.settings.teams * 3, state.settings.rounds * state.settings.teams);
  for (let i = from; i <= max; i++) {
    if (teamForOverall(i).teamSlot === state.settings.draftSlot) return i;
  }
  return null;
}

function pickLabel(overall) {
  const i = teamForOverall(overall);
  return `${i.round}.${String(i.within).padStart(2, '0')}`;
}

function rosterNeedBonus(player) {
  const roster = myRoster();
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, K: 0 };
  roster.forEach(p => {
    const pos = primaryPos(p);
    const key = pos === 'D/ST' ? 'DST' : pos;
    if (counts[key] !== undefined) counts[key]++;
  });
  const r = state.settings.roster;
  const playerPositions = positionsOf(player);
  let bonus = 0;
  for (const pos of playerPositions) {
    const key = pos === 'D/ST' ? 'DST' : pos;
    if (['QB', 'RB', 'WR', 'TE', 'DST', 'K'].includes(key)) {
      const target = Number(r[key] || 0);
      if (counts[key] < target) bonus = Math.max(bonus, key === 'DST' || key === 'K' ? 22 : 48);
    }
  }
  if (playerPositions.some(p => ['RB', 'WR', 'TE'].includes(p))) {
    const skillHave = counts.RB + counts.WR + counts.TE;
    const skillTarget = Number(r.RB || 0) + Number(r.WR || 0) + Number(r.TE || 0) + Number(r.FLEX || 0);
    if (skillHave < skillTarget) bonus = Math.max(bonus, 24);
  }
  if (playerPositions.includes('QB') && Number(r.SFLEX || 0) > 0 && counts.QB < Number(r.QB || 0) + Number(r.SFLEX || 0)) {
    bonus = Math.max(bonus, 35);
  }
  return bonus;
}

function recommendationScore(player, targetPick) {
  const rank = num(player.rank);
  const adp = num(player.adp);
  const projection = num(player.projection, 0);
  let score = 0;
  if (rank !== null) score += 1200 - rank * 4;
  else if (adp !== null) score += 1100 - adp * 3.6;
  else score += projection * 3;
  if (adp !== null) score += clamp(adp - targetPick, -35, 35) * 1.4;
  score += rosterNeedBonus(player);
  if (player.status && /out|ir|susp/i.test(player.status)) score -= 55;
  return score;
}

function recommendationReason(player, targetPick) {
  const parts = [];
  if (num(player.rank) !== null) parts.push(`Rank #${player.rank}`);
  if (num(player.adp) !== null) {
    const delta = Math.round(player.adp - targetPick);
    if (delta >= 4) parts.push(`could last ${delta} picks`);
    else if (delta <= -4) parts.push(`${Math.abs(delta)} picks past ADP`);
    else parts.push(`ADP ${player.adp}`);
  }
  const need = rosterNeedBonus(player);
  if (need >= 40) parts.push(`fills ${primaryPos(player)} need`);
  else if (need > 0) parts.push('helps starting depth');
  if (num(player.projection) !== null) parts.push(`${player.projection} proj`);
  return parts.join(' · ') || 'Manual player — add ranking or ADP for stronger guidance';
}

function availablePlayers() {
  const dm = draftedMap();
  return state.players.filter(p => !dm.has(p.id));
}

function recommendedPlayers(limit = 8, targetPick = nextMyOverall() || currentOverallPick()) {
  return availablePlayers()
    .map(p => ({ player: p, score: recommendationScore(p, targetPick) }))
    .sort((a, b) => b.score - a.score || (num(a.player.rank, 9999) - num(b.player.rank, 9999)))
    .slice(0, limit);
}

function switchTab(tab) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${tab}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-tab="${tab}"]`)?.classList.add('active');
  if (tab === 'draft') renderDraft();
  if (tab === 'players') renderPlayers();
  if (tab === 'roster') renderRoster();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.go)));
}

function populateSettings() {
  const s = state.settings;
  document.getElementById('league-name').value = s.leagueName;
  document.getElementById('team-name').value = s.teamName;
  document.getElementById('team-count').value = s.teams;
  document.getElementById('draft-slot').value = s.draftSlot;
  document.getElementById('draft-rounds').value = s.rounds;
  document.getElementById('scoring-type').value = s.scoring;
  const r = s.roster;
  document.getElementById('slot-qb').value = r.QB;
  document.getElementById('slot-rb').value = r.RB;
  document.getElementById('slot-wr').value = r.WR;
  document.getElementById('slot-te').value = r.TE;
  document.getElementById('slot-flex').value = r.FLEX;
  document.getElementById('slot-sflex').value = r.SFLEX;
  document.getElementById('slot-dst').value = r.DST;
  document.getElementById('slot-k').value = r.K;
  document.getElementById('slot-bench').value = r.BENCH;
}

function saveSettings(e) {
  e.preventDefault();
  const teams = clamp(num(document.getElementById('team-count').value, 12), 2, 20);
  state.settings = {
    ...state.settings,
    leagueName: document.getElementById('league-name').value.trim() || 'My Fantasy League',
    teamName: document.getElementById('team-name').value.trim() || 'My Team',
    teams,
    draftSlot: clamp(num(document.getElementById('draft-slot').value, 1), 1, teams),
    rounds: clamp(num(document.getElementById('draft-rounds').value, 16), 1, 30),
    scoring: document.getElementById('scoring-type').value,
    roster: {
      QB: num(document.getElementById('slot-qb').value, 0),
      RB: num(document.getElementById('slot-rb').value, 0),
      WR: num(document.getElementById('slot-wr').value, 0),
      TE: num(document.getElementById('slot-te').value, 0),
      FLEX: num(document.getElementById('slot-flex').value, 0),
      SFLEX: num(document.getElementById('slot-sflex').value, 0),
      DST: num(document.getElementById('slot-dst').value, 0),
      K: num(document.getElementById('slot-k').value, 0),
      BENCH: num(document.getElementById('slot-bench').value, 0)
    }
  };
  saveState();
  document.getElementById('settings-save-note').textContent = 'Saved locally';
  setTimeout(() => document.getElementById('settings-save-note').textContent = '', 1800);
  renderAll();
  toast('League settings saved');
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

function headerIndex(headers, aliases) {
  const normalized = headers.map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const a of aliases) {
    const idx = normalized.indexOf(a.replace(/[^a-z0-9]/g, ''));
    if (idx >= 0) return idx;
  }
  return -1;
}

function importCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV has no player rows');
  const h = rows[0];
  const idx = {
    name: headerIndex(h, ['name', 'player', 'playername']),
    team: headerIndex(h, ['team', 'nflteam', 'tm']),
    pos: headerIndex(h, ['position', 'positions', 'pos']),
    rank: headerIndex(h, ['rank', 'ecr', 'overallrank', 'rk']),
    adp: headerIndex(h, ['adp', 'avgdraftposition', 'averagedraftposition']),
    projection: headerIndex(h, ['projection', 'projectedpoints', 'points', 'proj', 'fpts']),
    bye: headerIndex(h, ['bye', 'byeweek']),
    tier: headerIndex(h, ['tier']),
    status: headerIndex(h, ['status', 'injury'])
  };
  if (idx.name < 0 || idx.pos < 0) throw new Error('CSV must include player name and position columns');
  let added = 0, updated = 0;
  rows.slice(1).forEach(r => {
    const name = String(r[idx.name] || '').trim();
    const position = String(r[idx.pos] || '').trim();
    if (!name || !position) return;
    const team = idx.team >= 0 ? String(r[idx.team] || '').trim() : '';
    const existing = state.players.find(p => p.name.toLowerCase() === name.toLowerCase() && String(p.team || '').toLowerCase() === team.toLowerCase());
    const data = {
      name,
      team,
      positions: position.split(/[\/,;|]+/).map(normalizePos).filter(Boolean),
      rank: idx.rank >= 0 ? num(r[idx.rank]) : null,
      adp: idx.adp >= 0 ? num(r[idx.adp]) : null,
      projection: idx.projection >= 0 ? num(r[idx.projection]) : null,
      bye: idx.bye >= 0 ? String(r[idx.bye] || '').trim() : '',
      tier: idx.tier >= 0 ? String(r[idx.tier] || '').trim() : '',
      status: idx.status >= 0 ? String(r[idx.status] || '').trim() : ''
    };
    if (existing) { Object.assign(existing, data); updated++; }
    else { state.players.push({ id: playerId(name, team), ...data }); added++; }
  });
  saveState();
  return { added, updated };
}

function addPlayer(data) {
  const p = {
    id: playerId(data.name, data.team),
    name: data.name.trim(),
    team: (data.team || '').trim(),
    positions: String(data.position || '').split(/[\/,;|]+/).map(normalizePos).filter(Boolean),
    rank: num(data.rank), adp: num(data.adp), projection: num(data.projection),
    bye: '', tier: '', status: ''
  };
  state.players.push(p);
  saveState();
  return p;
}

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
  body.innerHTML = players.slice(0, 600).map(p => {
    const st = statusFor(p.id);
    const pick = draftedMap().get(p.id);
    const statusText = st === 'mine' ? 'My roster' : st === 'drafted' ? `Team ${pick.teamSlot} · ${pickLabel(pick.overall)}` : 'Available';
    const action = st === 'available' && !state.manualRosterIds.includes(p.id)
      ? `<button class="btn secondary small" data-action="add-roster" data-id="${p.id}">Add roster</button>`
      : st === 'mine' && state.manualRosterIds.includes(p.id) && !pick
        ? `<button class="btn secondary small" data-action="remove-roster" data-id="${p.id}">Remove</button>` : '';
    return `<tr><td>${p.rank ?? '—'}</td><td><div class="player-name">${esc(p.name)}</div>${p.status ? `<div class="player-meta">${esc(p.status)}</div>` : ''}</td><td><span class="pos-badge">${esc(positionsOf(p).join('/'))}</span></td><td>${esc(p.team || '—')}</td><td>${p.adp ?? '—'}</td><td>${p.projection ?? '—'}</td><td><span class="status-text ${st}">${esc(statusText)}</span></td><td>${action}</td></tr>`;
  }).join('') || `<tr><td colspan="8"><div class="empty-state compact">No players match this filter.</div></td></tr>`;
  document.getElementById('player-count').textContent = `${players.length} player${players.length === 1 ? '' : 's'}`;
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
    summary.textContent = 'Import a rankings CSV or add players manually to activate recommendations.';
  } else if (mineNow) {
    summary.className = 'rec-row';
    summary.innerHTML = `<div><div class="player-name">Your team is on the clock</div><div class="player-meta">Overall ${now.overall} · Round ${now.round} · Slot ${state.settings.draftSlot}</div></div><button class="btn primary small" data-go="draft">Draft now</button>`;
    summary.querySelector('[data-go]')?.addEventListener('click', () => switchTab('draft'));
  } else {
    const until = next ? Math.max(0, next - now.overall) : 0;
    summary.className = 'rec-row';
    summary.innerHTML = `<div><div class="player-name">Team ${now.teamSlot} is on the clock</div><div class="player-meta">${next ? `${until} selection${until === 1 ? '' : 's'} until your pick ${pickLabel(next)}` : 'No remaining pick found'}</div></div><span class="mini-pill">Pick ${now.overall}</span>`;
  }
  const recs = recommendedPlayers(5, next || now.overall);
  const recBox = document.getElementById('dashboard-recommendations');
  recBox.innerHTML = recs.map((r, i) => `<div class="rec-row"><div class="player-main"><div class="player-name">${i + 1}. ${esc(r.player.name)}</div><div class="player-meta">${esc(primaryPos(r.player))} · ${esc(recommendationReason(r.player, next || now.overall))}</div></div><span class="rec-score">${r.player.rank ? `#${r.player.rank}` : r.player.adp ? `ADP ${r.player.adp}` : '—'}</span></div>`).join('') || `<div class="empty-state compact">No available players loaded.</div>`;
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
  document.getElementById('draft-recommendations').innerHTML = recs.map((r, i) => `<article class="draft-rec ${i === 0 ? 'top' : ''}"><div class="rank-line"><span>${i === 0 ? 'TOP FIT' : `OPTION ${i + 1}`}</span><span>${r.player.rank ? `#${r.player.rank}` : r.player.adp ? `ADP ${r.player.adp}` : ''}</span></div><h3>${esc(r.player.name)} <span class="pos-badge">${esc(primaryPos(r.player))}</span></h3><p>${esc(recommendationReason(r.player, next || info.overall))}</p><button class="btn ${mine ? 'primary' : 'secondary'} small" data-action="draft" data-id="${r.player.id}">Record current pick</button></article>`).join('') || `<div class="empty-state compact">Load available players to see draft recommendations.</div>`;

  const search = (document.getElementById('draft-search')?.value || '').toLowerCase();
  const pos = document.getElementById('draft-pos-filter')?.value || '';
  let avail = availablePlayers().filter(p => !search || `${p.name} ${p.team}`.toLowerCase().includes(search));
  avail = avail.filter(p => !pos || positionsOf(p).includes(pos));
  avail.sort((a, b) => recommendationScore(b, info.overall) - recommendationScore(a, info.overall));
  document.getElementById('available-count').textContent = `${avail.length} available`;
  document.getElementById('draft-players-body').innerHTML = avail.slice(0, 400).map(p => {
    const adp = num(p.adp);
    const value = adp === null ? '—' : Math.round(adp - info.overall);
    const valueText = value === '—' ? '—' : value > 0 ? `+${value}` : String(value);
    return `<tr><td>${p.rank ?? '—'}</td><td><div class="player-name">${esc(p.name)}</div><div class="player-meta">${esc(p.team || '')}${p.bye ? ` · Bye ${esc(p.bye)}` : ''}</div></td><td><span class="pos-badge">${esc(positionsOf(p).join('/'))}</span></td><td>${p.adp ?? '—'}</td><td>${p.projection ?? '—'}</td><td>${valueText}</td><td><button class="btn primary small" data-action="draft" data-id="${p.id}">Draft</button></td></tr>`;
  }).join('') || `<tr><td colspan="7"><div class="empty-state compact">No available players match.</div></td></tr>`;

  const draftRoster = myDraftPicks().map(p => ({ pick: p, player: getPlayer(p.playerId) })).filter(x => x.player);
  const manual = state.manualRosterIds.filter(id => !draftRoster.some(x => x.player.id === id)).map(id => ({ player: getPlayer(id) })).filter(x => x.player);
  document.getElementById('draft-roster').innerHTML = [...draftRoster, ...manual].map(x => `<div class="mini-roster-row"><span class="pick-num">${x.pick ? pickLabel(x.pick.overall) : 'MAN'}</span><div><div class="player-name">${esc(x.player.name)}</div><div class="player-meta">${esc(x.player.team || '')}</div></div><span class="pos-badge">${esc(primaryPos(x.player))}</span></div>`).join('') || `<div class="empty-state compact">Your selections will appear here.</div>`;
  renderDraftBoard();
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
  document.getElementById('roster-title').textContent = state.settings.teamName;
  const roster = myRoster();
  document.getElementById('roster-body').innerHTML = roster.map(p => {
    const pick = myDraftPicks().find(x => x.playerId === p.id);
    const manualOnly = state.manualRosterIds.includes(p.id) && !pick;
    return `<tr><td><div class="player-name">${esc(p.name)}</div>${p.status ? `<div class="player-meta">${esc(p.status)}</div>` : ''}</td><td><span class="pos-badge">${esc(positionsOf(p).join('/'))}</span></td><td>${esc(p.team || '—')}</td><td><input class="roster-projection" type="number" step="0.1" value="${p.projection ?? ''}" data-projection-id="${p.id}" placeholder="0.0" /></td><td><span class="status-text ${pick ? 'mine' : ''}">${pick ? `Draft ${pickLabel(pick.overall)}` : 'Manual'}</span></td><td>${manualOnly ? `<button class="btn secondary small" data-action="remove-roster" data-id="${p.id}">Remove</button>` : ''}</td></tr>`;
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

function renderAll() {
  renderDashboard();
  renderPlayers();
  renderDraft();
  renderRoster();
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
  document.getElementById('team-count').addEventListener('change', e => {
    document.getElementById('draft-slot').max = e.target.value;
  });
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
  });

  document.body.addEventListener('click', e => {
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

function init() {
  bindNavigation();
  bindForms();
  bindControls();
  populateSettings();
  renderAll();
}

init();
