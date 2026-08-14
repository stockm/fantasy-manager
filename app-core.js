const STORAGE_KEY = 'fantasyManagerStateV1';
const RANKINGS_URL = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv';
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl?active=true';
const SLEEPER_REFRESH_MS = 20 * 60 * 60 * 1000;
const AUTO_RANKINGS_REFRESH_MS = 24 * 60 * 60 * 1000;

const defaults = () => ({
  version: 2,
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
  manualRosterIds: [],
  feed: {
    provider: '',
    profile: '',
    scrapeDate: '',
    rankingsUpdatedAt: '',
    sleeperUpdatedAt: '',
    rankedCount: 0,
    statusCount: 0,
    warning: '',
    lastError: ''
  }
});

let state = loadState();
let lineupResult = null;
let feedBusy = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    const d = defaults();
    return {
      ...d,
      ...parsed,
      version: 2,
      settings: {
        ...d.settings,
        ...(parsed.settings || {}),
        roster: { ...d.settings.roster, ...((parsed.settings || {}).roster || {}) }
      },
      players: Array.isArray(parsed.players) ? parsed.players : [],
      picks: Array.isArray(parsed.picks) ? parsed.picks : [],
      manualRosterIds: Array.isArray(parsed.manualRosterIds) ? parsed.manualRosterIds : [],
      feed: { ...d.feed, ...(parsed.feed || {}) }
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
  if (value === '' || value === null || value === undefined || String(value).toUpperCase() === 'NA') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function formatRank(value) {
  const n = num(value);
  if (n === null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

function prettyDate(value) {
  if (!value) return '—';
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function prettyDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function toast(message, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

function playerId(name, team = '') {
  const base = `${name}-${team}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'player'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function canonicalName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function canonicalTeam(value = '') {
  const raw = String(value || '').trim().toUpperCase();
  const aliases = {
    JAX: 'JAC', JAC: 'JAC',
    KCC: 'KC', KC: 'KC',
    GBP: 'GB', GB: 'GB',
    NEP: 'NE', NE: 'NE',
    NOS: 'NO', NO: 'NO',
    SFO: 'SF', SF: 'SF',
    TBB: 'TB', TB: 'TB',
    LVR: 'LV', LV: 'LV'
  };
  return aliases[raw] || raw;
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
  if (player.status && /out|ir|susp|pup|nfi/i.test(player.status)) score -= 55;
  return score;
}

function recommendationReason(player, targetPick) {
  const parts = [];
  if (num(player.rank) !== null) parts.push(`ECR #${formatRank(player.rank)}`);
  if (num(player.ecrBest) !== null && num(player.ecrWorst) !== null) parts.push(`range ${formatRank(player.ecrBest)}–${formatRank(player.ecrWorst)}`);
  if (num(player.adp) !== null) {
    const delta = Math.round(player.adp - targetPick);
    if (delta >= 4) parts.push(`could last ${delta} picks`);
    else if (delta <= -4) parts.push(`${Math.abs(delta)} picks past ADP`);
    else parts.push(`ADP ${player.adp}`);
  }
  const need = rosterNeedBonus(player);
  if (need >= 40) parts.push(`fills ${primaryPos(player)} need`);
  else if (need > 0) parts.push('helps starting depth');
  if (player.status) parts.push(player.status);
  if (num(player.projection) !== null) parts.push(`${player.projection} proj`);
  return parts.join(' · ') || 'Add ranking, ADP or projection for stronger guidance';
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
}

function populateSettings() {
  const s = state.settings;
  document.getElementById('league-name').value = s.leagueName;
  document.getElementById('team-name').value = s.teamName;
  document.getElementById('team-count').value = s.teams;
  document.getElementById('draft-slot').value = s.draftSlot;
  document.getElementById('draft-slot').max = s.teams;
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
  const previousSuperflex = Number(state.settings.roster.SFLEX || 0) > 0;
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
  const nowSuperflex = Number(state.settings.roster.SFLEX || 0) > 0;
  saveState();
  document.getElementById('settings-save-note').textContent = 'Saved locally';
  setTimeout(() => document.getElementById('settings-save-note').textContent = '', 1800);
  renderAll();
  if (previousSuperflex !== nowSuperflex && state.feed.rankingsUpdatedAt) {
    toast('Settings saved — refresh rankings to switch ECR profile');
  } else toast('League settings saved');
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
    const existing = findMatchingPlayer(name, team);
    const data = {
      name,
      team,
      positions: position.split(/[\/,;|]+/).map(normalizePos).filter(Boolean),
      rank: idx.rank >= 0 ? num(r[idx.rank]) : null,
      adp: idx.adp >= 0 ? num(r[idx.adp]) : null,
      projection: idx.projection >= 0 ? num(r[idx.projection]) : null,
      bye: idx.bye >= 0 ? String(r[idx.bye] || '').trim() : '',
      tier: idx.tier >= 0 ? String(r[idx.tier] || '').trim() : '',
      status: idx.status >= 0 ? String(r[idx.status] || '').trim() : '',
      rankSource: 'csv',
      sourceLabel: 'CSV import'
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
    bye: '', tier: '', status: '', rankSource: 'manual', sourceLabel: 'Manual'
  };
  state.players.push(p);
  saveState();
  return p;
}
