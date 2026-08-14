const MARKET_DATA_URL = 'data/market-2026.json';
const YAHOO_PRESET_ID = 'yahoo-2026-14team-half-ppr-v1';

const YAHOO_LEAGUE_PRESET = {
  leagueName: 'Yahoo 14-Team Half-PPR',
  teams: 14,
  draftSlot: 12,
  rounds: 14,
  scoring: 'half-ppr',
  roster: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SFLEX: 0, DST: 1, K: 1, BENCH: 5, IR: 2 },
  draft: {
    type: 'Live Standard Draft',
    startsAt: '2026-08-16T21:00:00-04:00',
    displayTime: 'Sun Aug 16 · 9:00 PM EDT / 6:00 PM PDT',
    pickSeconds: 90,
    draftPickTrades: false
  },
  leagueRules: {
    autoRenew: true,
    cashLeague: false,
    scoringType: 'Head-to-Head',
    scoringStartsWeek: 1,
    cantCutProvider: 'Yahoo Sports',
    maxSeasonAcquisitions: null,
    maxWeeklyAcquisitions: null,
    maxSeasonTrades: null,
    tradeDeadline: '2026-11-28',
    tradeReview: 'Commissioner',
    tradeRejectDays: 1,
    waiverDays: 2,
    waiverType: 'FAB w/ Continual rolling list tiebreak',
    weeklyWaivers: 'Game Time - Tuesday',
    injuredDirectToIR: true,
    postDraftPlayers: 'Follow Waiver Rules',
    playoffs: '8 teams · Weeks 15, 16 and 17',
    playoffTiebreaker: 'Higher seed wins',
    playoffReseeding: false,
    divisions: false,
    lockEliminatedTeams: true,
    playAgainstMedian: false,
    secondOpponent: false,
    postponedGamesGetInjuredStatus: true,
    fractionalPoints: true,
    negativePoints: true,
    lockBenchedPlayers: false,
    publiclyViewable: false,
    invitePermissions: 'Commissioner Only'
  },
  scoringRules: {
    passingYardsPerPoint: 25,
    passingTouchdown: 4,
    interception: -1,
    rushingYardsPerPoint: 10,
    rushingTouchdown: 6,
    reception: 0.5,
    receivingYardsPerPoint: 10,
    receivingTouchdown: 6,
    returnTouchdown: 6,
    twoPointConversion: 2,
    fumbleLost: -2,
    offensiveFumbleReturnTD: 6,
    kicker: {
      fg0to19: 3, fg20to29: 3, fg30to39: 3, fg40to49: 4, fg50plus: 5,
      miss0to19: -1, miss20to29: -1, miss30to39: -1, miss40to49: -1, miss50plus: -1,
      extraPointMade: 1, extraPointMissed: -1
    },
    defense: {
      sack: 1, interception: 2, fumbleRecovery: 2, touchdown: 6, safety: 2,
      blockedKick: 2, returnTouchdown: 6,
      pointsAllowed0: 10, pointsAllowed1to6: 7, pointsAllowed7to13: 4,
      pointsAllowed14to20: 1, pointsAllowed21to27: 0,
      pointsAllowed28to34: -1, pointsAllowed35plus: -4,
      extraPointReturned: 2
    }
  }
};

function applyYahooLeaguePreset({ force = false, silent = false } = {}) {
  if (state.picks.length && !force) {
    if (!silent) toast('Preset not applied because this draft already has recorded picks', 'error');
    return false;
  }
  const teamName = state.settings.teamName && state.settings.teamName !== 'My Team' ? state.settings.teamName : 'My Team';
  state.settings = {
    ...state.settings,
    leagueName: state.settings.leagueName && state.settings.leagueName !== 'My Fantasy League' ? state.settings.leagueName : YAHOO_LEAGUE_PRESET.leagueName,
    teamName,
    teams: YAHOO_LEAGUE_PRESET.teams,
    draftSlot: YAHOO_LEAGUE_PRESET.draftSlot,
    rounds: YAHOO_LEAGUE_PRESET.rounds,
    scoring: YAHOO_LEAGUE_PRESET.scoring,
    roster: { ...YAHOO_LEAGUE_PRESET.roster },
    draft: { ...YAHOO_LEAGUE_PRESET.draft },
    leagueRules: { ...YAHOO_LEAGUE_PRESET.leagueRules },
    scoringRules: JSON.parse(JSON.stringify(YAHOO_LEAGUE_PRESET.scoringRules)),
    presetId: YAHOO_PRESET_ID
  };
  state.version = Math.max(Number(state.version || 0), 3);
  saveState();
  if (typeof populateSettings === 'function') populateSettings();
  if (typeof renderAll === 'function') renderAll();
  renderYahooPresetCard();
  if (!silent) toast('Yahoo 14-team half-PPR preset applied');
  return true;
}

function ensureYahooPreset() {
  const presetAlreadyApplied = state.settings?.presetId === YAHOO_PRESET_ID;
  if (presetAlreadyApplied) return;
  if (!state.picks.length) applyYahooLeaguePreset({ silent: true });
  else {
    state.settings = {
      ...state.settings,
      draft: state.settings.draft || { ...YAHOO_LEAGUE_PRESET.draft },
      leagueRules: state.settings.leagueRules || { ...YAHOO_LEAGUE_PRESET.leagueRules },
      scoringRules: state.settings.scoringRules || JSON.parse(JSON.stringify(YAHOO_LEAGUE_PRESET.scoringRules))
    };
    state.version = Math.max(Number(state.version || 0), 3);
    saveState();
  }
}

ensureYahooPreset();

const basePopulateSettings = populateSettings;
populateSettings = function populateSettingsWithYahooPreset() {
  basePopulateSettings();
  renderYahooPresetCard();
};

const baseSaveSettings = saveSettings;
saveSettings = function saveSettingsWithExtendedRoster(event) {
  const existingMeta = {
    draft: state.settings.draft,
    leagueRules: state.settings.leagueRules,
    scoringRules: state.settings.scoringRules,
    presetId: state.settings.presetId,
    ir: Number(state.settings.roster?.IR ?? 2)
  };
  baseSaveSettings(event);
  const irInput = document.getElementById('slot-ir');
  state.settings.roster.IR = irInput ? clamp(num(irInput.value, existingMeta.ir), 0, 6) : existingMeta.ir;
  state.settings.draft = existingMeta.draft || { ...YAHOO_LEAGUE_PRESET.draft };
  state.settings.leagueRules = existingMeta.leagueRules || { ...YAHOO_LEAGUE_PRESET.leagueRules };
  state.settings.scoringRules = existingMeta.scoringRules || JSON.parse(JSON.stringify(YAHOO_LEAGUE_PRESET.scoringRules));
  state.settings.presetId = existingMeta.presetId;
  saveState();
  renderYahooPresetCard();
};

function renderYahooPresetCard() {
  const form = document.getElementById('settings-form');
  if (!form) return;
  let irLabel = document.getElementById('slot-ir')?.closest('label');
  if (!irLabel) {
    const grid = form.querySelector('.slot-grid');
    if (grid) {
      grid.insertAdjacentHTML('beforeend', '<label>IR<input id="slot-ir" type="number" min="0" max="6" /></label>');
      irLabel = document.getElementById('slot-ir')?.closest('label');
    }
  }
  const ir = document.getElementById('slot-ir');
  if (ir) ir.value = Number(state.settings.roster?.IR ?? 2);

  let card = document.getElementById('yahoo-preset-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'yahoo-preset-card';
    card.className = 'yahoo-preset-card';
    form.querySelector('.form-actions')?.before(card);
  }
  const d = state.settings.draft || YAHOO_LEAGUE_PRESET.draft;
  const rules = state.settings.leagueRules || YAHOO_LEAGUE_PRESET.leagueRules;
  card.innerHTML = `
    <div class="preset-card-head">
      <div><span class="section-label">YOUR YAHOO LEAGUE PRESET</span><h3>14-team · Half PPR · Pick 12</h3></div>
      <button class="btn secondary small" type="button" id="apply-yahoo-preset">Reapply preset</button>
    </div>
    <div class="preset-grid">
      <div><span>Draft</span><strong>${esc(d.displayTime || YAHOO_LEAGUE_PRESET.draft.displayTime)}</strong></div>
      <div><span>Clock</span><strong>${Number(d.pickSeconds || 90)} seconds</strong></div>
      <div><span>Draft rounds</span><strong>14</strong><small>IR slots excluded</small></div>
      <div><span>Waivers</span><strong>${esc(rules.waiverType || '')}</strong></div>
      <div><span>Playoffs</span><strong>${esc(rules.playoffs || '')}</strong></div>
      <div><span>Trade deadline</span><strong>Nov 28, 2026</strong></div>
    </div>
    <details class="preset-details">
      <summary>View stored scoring and league rules</summary>
      <div class="preset-rule-copy">QB, 2 WR, 2 RB, TE, W/R/T, K, DEF, 5 BN, 2 IR · 0.5/reception · 25 pass yds/pt · 4 pass TD · -1 INT · 10 rush/rec yds/pt · 6 rush/rec TD · -2 fumble lost · Yahoo-style kicker and D/ST scoring stored for projection calculations.</div>
    </details>`;
  card.querySelector('#apply-yahoo-preset')?.addEventListener('click', () => {
    if (state.picks.length && !confirm('Reapplying the preset changes the draft to 14 teams / 14 rounds and can invalidate an active draft board. Continue?')) return;
    applyYahooLeaguePreset({ force: true });
  });
}

function effectiveAdp(player) {
  return num(player.yahooAdp) ?? num(player.marketAdp) ?? num(player.adp);
}

function replacementDemand(position) {
  const r = state.settings.roster || {};
  const teams = Number(state.settings.teams || 14);
  const bench = Number(r.BENCH || 0);
  const shares = { QB: 0.08, RB: 0.35, WR: 0.40, TE: 0.12, 'D/ST': 0.025, K: 0.025 };
  const starters = {
    QB: Number(r.QB || 0) + Number(r.SFLEX || 0) * 0.55,
    RB: Number(r.RB || 0) + Number(r.FLEX || 0) * 0.45 + Number(r.SFLEX || 0) * 0.10,
    WR: Number(r.WR || 0) + Number(r.FLEX || 0) * 0.45 + Number(r.SFLEX || 0) * 0.10,
    TE: Number(r.TE || 0) + Number(r.FLEX || 0) * 0.10 + Number(r.SFLEX || 0) * 0.05,
    'D/ST': Number(r.DST || 0),
    K: Number(r.K || 0)
  };
  return Math.max(1, Math.ceil(teams * ((starters[position] || 0) + bench * (shares[position] || 0))));
}

function positionalMarketMetrics(player) {
  const pos = primaryPos(player);
  const projection = num(player.projection);
  if (projection === null) return { vorp: 0, cliff: 0, replacement: null, positionIndex: null, replacementIndex: replacementDemand(pos) };
  const list = state.players
    .filter(p => primaryPos(p) === pos && num(p.projection) !== null)
    .sort((a, b) => num(b.projection, 0) - num(a.projection, 0));
  const idx = list.findIndex(p => p.id === player.id);
  const replacementIndex = replacementDemand(pos);
  const repPlayer = list[Math.min(Math.max(replacementIndex - 1, 0), Math.max(list.length - 1, 0))];
  const replacement = repPlayer ? num(repPlayer.projection, 0) : 0;
  const lookAhead = Math.max(3, Math.ceil(Number(state.settings.teams || 14) / 2));
  const later = idx >= 0 ? list[Math.min(idx + lookAhead, Math.max(list.length - 1, 0))] : null;
  const cliff = later ? Math.max(0, projection - num(later.projection, projection)) : 0;
  return {
    vorp: projection - replacement,
    cliff,
    replacement,
    positionIndex: idx >= 0 ? idx + 1 : null,
    replacementIndex
  };
}

const baseRecommendationScore = recommendationScore;
recommendationScore = function marketAwareRecommendationScore(player, targetPick) {
  const rank = num(player.rank);
  const adp = effectiveAdp(player);
  const metrics = positionalMarketMetrics(player);
  const need = rosterNeedBonus(player);
  const target = Number(targetPick || currentOverallPick());
  let score = 0;

  if (rank !== null) score += 1020 - rank * 3.15;
  else score += baseRecommendationScore(player, target) * 0.45;

  if (adp !== null) {
    score += 620 - adp * 1.75;
    score += clamp(target - adp, -28, 45) * 5.2; // reward players who have slipped past market ADP
    const followingPick = nextMyOverall(target + 1);
    if (followingPick && adp < followingPick) score += clamp(followingPick - adp, 0, 35) * 2.0;
  }

  score += clamp(metrics.vorp, -60, 140) * 1.35;
  score += clamp(metrics.cliff, 0, 55) * 2.1;
  score += need * 2.15;

  const pos = primaryPos(player);
  const round = teamForOverall(target).round;
  if (['K', 'D/ST'].includes(pos) && round < Math.max(10, Number(state.settings.rounds || 14) - 2)) score -= 300;
  if (pos === 'QB' && Number(state.settings.roster.SFLEX || 0) === 0 && myRoster().some(p => primaryPos(p) === 'QB') && round < 9) score -= 95;
  if (player.status && /out|ir|susp|pup|nfi/i.test(player.status)) score -= 85;
  return score;
};

recommendationReason = function marketAwareRecommendationReason(player, targetPick) {
  const parts = [];
  const target = Number(targetPick || currentOverallPick());
  const adp = effectiveAdp(player);
  const market = num(player.marketAdp);
  const projection = num(player.projection);
  const metrics = positionalMarketMetrics(player);
  if (num(player.rank) !== null) parts.push(`ECR #${formatRank(player.rank)}`);
  if (adp !== null) {
    parts.push(`Yahoo ADP ${adp.toFixed(1)}`);
    const delta = target - adp;
    if (delta >= 3) parts.push(`${Math.round(delta)} picks past market`);
    else if (delta <= -5) parts.push(`${Math.abs(Math.round(delta))} picks ahead of market`);
    const following = nextMyOverall(target + 1);
    if (following && adp < following && target === nextMyOverall()) parts.push(`unlikely back at ${pickLabel(following)}`);
  } else if (market !== null) parts.push(`market ADP ${market.toFixed(1)}`);
  if (projection !== null) parts.push(`${projection.toFixed(1)} season pts`);
  if (metrics.vorp >= 8) parts.push(`+${metrics.vorp.toFixed(0)} vs replacement`);
  if (metrics.cliff >= 8) parts.push(`${primaryPos(player)} tier drop +${metrics.cliff.toFixed(0)}`);
  const need = rosterNeedBonus(player);
  if (need >= 40) parts.push(`fills ${primaryPos(player)} need`);
  else if (need > 0) parts.push('adds starting depth');
  if (player.status) parts.push(player.status);
  return parts.join(' · ') || 'ECR + market ADP + projection + roster scarcity';
};

function findMarketPlayer(name, team) {
  const n = canonicalName(name);
  const t = canonicalTeam(team);
  let matches = state.players.filter(p => canonicalName(p.name) === n);
  if (t) {
    const same = matches.find(p => canonicalTeam(p.team) === t);
    if (same) return same;
  }
  return matches.length === 1 ? matches[0] : null;
}

function mergeMarketData(data) {
  if (!data || !Array.isArray(data.players) || data.players.length < 100) throw new Error('2026 ADP/projection dataset is not ready yet');
  let matched = 0;
  let created = 0;
  let projected = 0;
  let adpCount = 0;
  data.players.forEach(m => {
    const pos = normalizePos(m.position);
    if (!['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'].includes(pos)) return;
    let player = findMarketPlayer(m.name, m.team);
    if (!player) {
      player = {
        id: playerId(m.name, m.team), name: m.name, team: m.team || '', positions: [pos],
        rank: null, adp: null, projection: null, bye: m.bye || '', tier: '', status: '', sourceLabel: '2026 market feed'
      };
      state.players.push(player);
      created++;
    } else matched++;
    if (!player.team && m.team) player.team = m.team;
    if (!positionsOf(player).length) player.positions = [pos];
    if (!player.bye && m.bye) player.bye = String(m.bye);
    player.marketAdp = num(m.adp);
    player.yahooAdp = num(m.yahooAdp);
    player.sleeperAdp = num(m.sleeperAdp);
    const liveAdp = num(m.yahooAdp) ?? num(m.adp);
    if (liveAdp !== null) {
      player.adp = liveAdp;
      player.adpSource = num(m.yahooAdp) !== null ? 'Yahoo ADP via FantasyPros' : 'FantasyPros Half-PPR composite ADP';
      adpCount++;
    }
    if (num(m.projection) !== null && !player.projectionOverride) {
      player.projection = num(m.projection);
      player.projectionSource = 'FantasyPros consensus · Yahoo custom scoring';
      player.projectionQuality = m.projectionQuality || '';
      player.sourceProjection = num(m.sourceProjection);
      projected++;
    }
    player.marketSourceDate = data.projectionDate || '';
  });
  state.feed = {
    ...state.feed,
    marketGeneratedAt: data.generatedAt || '',
    marketProjectionDate: data.projectionDate || '',
    marketLoadedAt: new Date().toISOString(),
    marketPlayerCount: data.players.length,
    marketAdpCount: adpCount,
    marketProjectionCount: projected,
    marketProvider: 'FantasyPros Half-PPR ADP + consensus projections',
    marketNotes: data.notes || {},
    marketError: ''
  };
  saveState();
  return { matched, created, projected, adpCount };
}

async function refreshMarketData({ force = false, silent = false } = {}) {
  try {
    const response = await fetch(`${MARKET_DATA_URL}?_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Market data request failed (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data.players) || data.players.length < 100) throw new Error('Market updater is still preparing the first dataset');
    const oldGenerated = state.feed.marketGeneratedAt || '';
    if (state.picks.length && oldGenerated && data.generatedAt && data.generatedAt !== oldGenerated && !force) return { skipped: true };
    const result = mergeMarketData(data);
    if (typeof renderAll === 'function') renderAll();
    renderMarketFeedMeta();
    if (!silent) toast(`Yahoo ADP + season projections loaded for ${result.adpCount} players`);
    return { ...result, skipped: false };
  } catch (err) {
    console.error(err);
    state.feed.marketError = err.message;
    saveState();
    renderMarketFeedMeta();
    if (!silent) toast(err.message, 'error');
    return { error: err };
  }
}

const baseRefreshLiveData = refreshLiveData;
refreshLiveData = async function refreshEverything() {
  await baseRefreshLiveData();
  if (!state.picks.length) await refreshMarketData({ silent: true, force: true });
  renderMarketFeedMeta();
};

const baseRenderFeedStatus = renderFeedStatus;
renderFeedStatus = function renderFeedStatusWithMarket(...args) {
  baseRenderFeedStatus(...args);
  renderMarketFeedMeta();
};

function renderMarketFeedMeta() {
  const f = state.feed || {};
  const hasMarket = Boolean(f.marketGeneratedAt && Number(f.marketAdpCount || 0));
  const metrics = document.querySelector('.feed-metrics');
  if (metrics && !document.getElementById('feed-market-adp')) {
    metrics.insertAdjacentHTML('beforeend', '<div><span>Yahoo ADP</span><strong id="feed-market-adp">0</strong></div><div><span>Season projections</span><strong id="feed-market-proj">0</strong></div>');
  }
  const adp = document.getElementById('feed-market-adp');
  const proj = document.getElementById('feed-market-proj');
  if (adp) adp.textContent = f.marketAdpCount || 0;
  if (proj) proj.textContent = f.marketProjectionCount || 0;
  const pill = document.getElementById('live-source-pill');
  if (pill && hasMarket) pill.textContent = 'ECR + Yahoo ADP + projections';
  const dashDetail = document.getElementById('dashboard-feed-detail');
  if (dashDetail && hasMarket) {
    const date = f.marketProjectionDate || f.scrapeDate || '';
    dashDetail.textContent = `${f.marketAdpCount || 0} Yahoo ADP values · ${f.marketProjectionCount || 0} season projections${date ? ` · ${date}` : ''}`;
  }
  const banner = document.getElementById('draft-data-banner');
  if (banner && hasMarket) {
    const text = banner.querySelector('span:nth-child(2)');
    if (text) text.textContent = `ECR + Yahoo ADP + ${f.marketProjectionCount || 0} projections`;
  }
  const warning = document.getElementById('feed-warning');
  if (warning && f.marketError && !hasMarket) {
    warning.hidden = false;
    warning.textContent = [state.feed.warning, `Market feed: ${f.marketError}`].filter(Boolean).join(' ');
  }
}

// Mark explicit weekly projection edits as overrides so future market refreshes do not replace them.
document.body.addEventListener('change', event => {
  const input = event.target.closest?.('[data-projection-id]');
  if (!input) return;
  const player = getPlayer(input.dataset.projectionId);
  if (player) {
    player.projectionOverride = true;
    player.projectionSource = 'Manual override';
    saveState();
  }
}, true);

document.getElementById('refresh-live-data')?.insertAdjacentHTML('afterend', '<button class="btn secondary small" type="button" id="refresh-market-data">Reload ADP + projections</button>');
document.getElementById('refresh-market-data')?.addEventListener('click', async () => {
  if (state.picks.length && !confirm('Reload market ADP/projections during an active draft? Existing picks stay intact, but recommendations may reorder.')) return;
  await refreshMarketData({ force: true });
});

document.getElementById('reset-data')?.addEventListener('click', () => {
  setTimeout(() => {
    if (Number(state.version || 0) < 3 && !state.picks.length) applyYahooLeaguePreset({ silent: true });
    renderYahooPresetCard();
    refreshMarketData({ silent: true });
  }, 80);
});

renderYahooPresetCard();
setTimeout(() => refreshMarketData({ silent: true }), 250);
