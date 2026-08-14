function findMatchingPlayer(name, team = '', fpId = '') {
  if (fpId) {
    const byFp = state.players.find(p => String(p.fpId || '') === String(fpId));
    if (byFp) return byFp;
  }
  const n = canonicalName(name);
  const t = canonicalTeam(team);
  let matches = state.players.filter(p => canonicalName(p.name) === n);
  if (t) {
    const sameTeam = matches.find(p => canonicalTeam(p.team) === t);
    if (sameTeam) return sameTeam;
  }
  return matches.length === 1 ? matches[0] : null;
}

function rankingsProfile() {
  return Number(state.settings.roster.SFLEX || 0) > 0
    ? { pageType: 'redraft-op', label: 'PPR Superflex ECR' }
    : { pageType: 'redraft-overall', label: 'PPR Overall ECR' };
}

function setFeedLoading(label) {
  feedBusy = true;
  const dot = document.getElementById('feed-status-dot');
  if (dot) dot.className = 'feed-dot loading';
  const title = document.getElementById('feed-status-title');
  const detail = document.getElementById('feed-status-detail');
  if (title) title.textContent = label;
  if (detail) detail.textContent = 'Fetching public data…';
  ['refresh-live-data', 'refresh-rankings-only'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = true; });
}

function clearFeedLoading() {
  feedBusy = false;
  ['refresh-live-data', 'refresh-rankings-only'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = false; });
}

async function fetchText(url) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Feed request failed (${response.status})`);
  return response.text();
}

async function refreshRankings({ silent = false } = {}) {
  if (feedBusy && !silent) return false;
  if (state.picks.length && !silent) {
    const ok = confirm('Refresh rankings during an active draft? Existing picks will stay intact, but available-player recommendations may reorder.');
    if (!ok) return false;
  }
  if (!silent) setFeedLoading('Refreshing rankings');
  try {
    const csv = await fetchText(RANKINGS_URL);
    const result = mergeFantasyProsRankings(csv);
    state.feed = {
      ...state.feed,
      provider: 'FantasyPros via DynastyProcess/nflverse',
      profile: result.profile,
      scrapeDate: result.scrapeDate,
      rankingsUpdatedAt: new Date().toISOString(),
      rankedCount: result.count,
      warning: result.warning,
      lastError: ''
    };
    saveState();
    renderAll();
    if (!silent) toast(`Loaded ${result.count} current rankings`);
    return true;
  } catch (err) {
    console.error(err);
    state.feed.lastError = err.message;
    saveState();
    renderFeedStatus('error', 'Rankings refresh failed', err.message);
    if (!silent) toast(err.message, 'error');
    return false;
  } finally {
    if (!silent) clearFeedLoading();
  }
}

function mergeFantasyProsRankings(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) throw new Error('Latest rankings feed was empty');
  const h = rows[0];
  const idx = {
    pageType: headerIndex(h, ['page_type']),
    player: headerIndex(h, ['player']),
    id: headerIndex(h, ['id']),
    pos: headerIndex(h, ['pos']),
    team: headerIndex(h, ['team']),
    ecr: headerIndex(h, ['ecr']),
    best: headerIndex(h, ['best']),
    worst: headerIndex(h, ['worst']),
    owned: headerIndex(h, ['player_owned_avg']),
    image: headerIndex(h, ['player_square_image_url', 'player_image_url']),
    rankDelta: headerIndex(h, ['rank_delta']),
    bye: headerIndex(h, ['bye']),
    scrapeDate: headerIndex(h, ['scrape_date'])
  };
  if (idx.pageType < 0 || idx.player < 0 || idx.pos < 0 || idx.ecr < 0) throw new Error('Rankings feed format changed');

  const profile = rankingsProfile();
  const validPositions = new Set(['QB', 'RB', 'WR', 'TE', 'D/ST', 'K']);
  let selected = rows.slice(1).filter(r => String(r[idx.pageType] || '').trim() === profile.pageType);
  let warning = '';
  if (!selected.length && profile.pageType === 'redraft-op') {
    selected = rows.slice(1).filter(r => String(r[idx.pageType] || '').trim() === 'redraft-overall');
    warning = 'Superflex ECR was unavailable, so the app temporarily fell back to PPR overall ECR.';
  }
  if (!selected.length) throw new Error(`No ${profile.label} rows found in the latest feed`);

  const dates = [];
  let merged = 0;
  selected.forEach(r => {
    const name = String(r[idx.player] || '').trim();
    const pos = normalizePos(r[idx.pos]);
    const ecr = num(r[idx.ecr]);
    if (!name || !validPositions.has(pos) || ecr === null) return;
    const team = idx.team >= 0 ? String(r[idx.team] || '').trim() : '';
    const fpId = idx.id >= 0 ? String(r[idx.id] || '').trim() : '';
    const scrapeDate = idx.scrapeDate >= 0 ? String(r[idx.scrapeDate] || '').trim() : '';
    if (scrapeDate) dates.push(scrapeDate);
    const existing = findMatchingPlayer(name, team, fpId);
    const live = {
      name,
      team,
      positions: [pos],
      rank: ecr,
      fpId,
      ecrBest: idx.best >= 0 ? num(r[idx.best]) : null,
      ecrWorst: idx.worst >= 0 ? num(r[idx.worst]) : null,
      rankDelta: idx.rankDelta >= 0 ? num(r[idx.rankDelta]) : null,
      ownership: idx.owned >= 0 ? num(r[idx.owned]) : null,
      bye: idx.bye >= 0 && String(r[idx.bye] || '').toUpperCase() !== 'NA' ? String(r[idx.bye] || '').trim() : '',
      imageUrl: idx.image >= 0 && String(r[idx.image] || '').toUpperCase() !== 'NA' ? String(r[idx.image] || '').trim() : '',
      rankSource: 'live-ecr',
      sourceLabel: 'FantasyPros ECR',
      sourceDate: scrapeDate
    };
    if (existing) {
      const preserved = { adp: existing.adp ?? null, projection: existing.projection ?? null, status: existing.status || '', tier: existing.tier || '' };
      Object.assign(existing, live, preserved);
    } else {
      state.players.push({ id: fpId ? `fp-${fpId}` : playerId(name, team), adp: null, projection: null, status: '', tier: '', ...live });
    }
    merged++;
  });

  if (!merged) throw new Error('No usable players found in the latest rankings feed');
  const latestDate = dates.sort().at(-1) || '';
  if (Number(state.settings.roster.SFLEX || 0) === 0 && state.settings.scoring !== 'ppr') {
    const note = 'The independent consensus source currently supplies PPR overall ECR. Manual CSV ADP/projections remain available for scoring-specific adjustments.';
    warning = warning ? `${warning} ${note}` : note;
  }
  return { count: merged, scrapeDate: latestDate, profile: profile.label, warning };
}

function sleeperStatusText(p) {
  if (p.injury_status) return String(p.injury_status);
  if (p.status && !/^active$/i.test(String(p.status))) return String(p.status);
  if (p.practice_participation && !/^full$/i.test(String(p.practice_participation))) return String(p.practice_participation);
  return '';
}

async function refreshSleeperMetadata({ force = false, silent = false } = {}) {
  const last = state.feed.sleeperUpdatedAt ? new Date(state.feed.sleeperUpdatedAt).getTime() : 0;
  if (!force && last && Date.now() - last < SLEEPER_REFRESH_MS) return { skipped: true, matched: state.feed.statusCount || 0 };
  if (!silent) setFeedLoading('Refreshing player status');
  try {
    const response = await fetch(`${SLEEPER_PLAYERS_URL}&_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Sleeper request failed (${response.status})`);
    const data = await response.json();
    const entries = Object.entries(data || {});
    const byName = new Map();
    entries.forEach(([id, p]) => {
      const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
      const key = canonicalName(name);
      if (!key) return;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push({ id, ...p });
    });

    let matched = 0;
    state.players.forEach(player => {
      const matches = byName.get(canonicalName(player.name)) || [];
      let hit = matches.find(p => canonicalTeam(p.team) === canonicalTeam(player.team));
      if (!hit && matches.length === 1) hit = matches[0];
      if (!hit) return;
      matched++;
      player.sleeperId = hit.player_id || hit.id;
      player.status = sleeperStatusText(hit);
      player.depthChartPosition = hit.depth_chart_position ?? null;
      player.depthChartOrder = hit.depth_chart_order ?? null;
      player.age = hit.age ?? null;
      player.number = hit.number ?? null;
      player.yearsExp = hit.years_exp ?? null;
      if (!player.team && hit.team) player.team = hit.team;
      if (!positionsOf(player).length && Array.isArray(hit.fantasy_positions)) player.positions = hit.fantasy_positions.map(normalizePos);
    });

    if (!state.players.length) {
      entries.forEach(([id, p]) => {
        const positions = (p.fantasy_positions || [p.position]).map(normalizePos).filter(x => ['QB', 'RB', 'WR', 'TE', 'K'].includes(x));
        const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
        if (!name || !positions.length) return;
        state.players.push({
          id: `sl-${id}`, sleeperId: id, name, team: p.team || '', positions,
          rank: null, adp: null, projection: null, bye: '', tier: '', status: sleeperStatusText(p),
          sourceLabel: 'Sleeper player database', rankSource: '', age: p.age ?? null, yearsExp: p.years_exp ?? null
        });
      });
    }

    state.feed.sleeperUpdatedAt = new Date().toISOString();
    state.feed.statusCount = matched;
    state.feed.lastError = '';
    saveState();
    renderAll();
    if (!silent) toast(`Player metadata matched for ${matched} players`);
    return { skipped: false, matched };
  } catch (err) {
    console.error(err);
    state.feed.lastError = err.message;
    saveState();
    if (!silent) toast(err.message, 'error');
    return { skipped: false, matched: 0, error: err };
  } finally {
    if (!silent) clearFeedLoading();
  }
}

async function refreshLiveData() {
  if (feedBusy) return;
  if (state.picks.length) {
    const ok = confirm('Refresh live data during an active draft? Existing picks remain intact, but recommendations can reorder.');
    if (!ok) return;
  }
  setFeedLoading('Refreshing live data');
  try {
    let rankingsOk = false;
    try {
      const csv = await fetchText(RANKINGS_URL);
      const result = mergeFantasyProsRankings(csv);
      state.feed = {
        ...state.feed,
        provider: 'FantasyPros via DynastyProcess/nflverse',
        profile: result.profile,
        scrapeDate: result.scrapeDate,
        rankingsUpdatedAt: new Date().toISOString(),
        rankedCount: result.count,
        warning: result.warning,
        lastError: ''
      };
      rankingsOk = true;
    } catch (err) {
      console.error(err);
      state.feed.lastError = err.message;
    }
    saveState();
    const sleeper = await refreshSleeperMetadata({ force: false, silent: true });
    saveState();
    renderAll();
    if (rankingsOk) {
      toast(sleeper.skipped ? 'Rankings refreshed · player metadata kept from daily cache' : 'Live 2026 data refreshed');
    } else if (!sleeper.error) {
      toast('Player database refreshed, but rankings source was unavailable', 'error');
    } else {
      throw new Error(state.feed.lastError || 'Live data refresh failed');
    }
  } catch (err) {
    renderFeedStatus('error', 'Live refresh failed', err.message);
    toast(err.message, 'error');
  } finally {
    clearFeedLoading();
    renderFeedStatus();
  }
}

function renderFeedStatus(forceState = '', forceTitle = '', forceDetail = '') {
  const f = state.feed;
  const hasRankings = Boolean(f.rankingsUpdatedAt && f.rankedCount);
  const stateName = forceState || (f.lastError && !hasRankings ? 'error' : hasRankings ? 'ok' : 'idle');
  const title = forceTitle || (hasRankings ? `${f.profile || 'Live ECR'} loaded` : 'Not loaded');
  const detail = forceDetail || (hasRankings
    ? `${prettyDate(f.scrapeDate)} · refreshed ${prettyDateTime(f.rankingsUpdatedAt)}`
    : 'Refresh to load the current 2026 player pool.');

  const dot = document.getElementById('feed-status-dot');
  if (dot && !feedBusy) dot.className = `feed-dot ${stateName}`;
  const statusTitle = document.getElementById('feed-status-title');
  const statusDetail = document.getElementById('feed-status-detail');
  if (statusTitle) statusTitle.textContent = title;
  if (statusDetail) statusDetail.textContent = detail;
  const profile = document.getElementById('feed-profile');
  const date = document.getElementById('feed-dataset-date');
  const ranked = document.getElementById('feed-ranked-count');
  const statuses = document.getElementById('feed-status-count');
  if (profile) profile.textContent = f.profile || '—';
  if (date) date.textContent = prettyDate(f.scrapeDate);
  if (ranked) ranked.textContent = f.rankedCount || 0;
  if (statuses) statuses.textContent = f.statusCount || 0;
  const warning = document.getElementById('feed-warning');
  if (warning) {
    warning.hidden = !f.warning;
    warning.textContent = f.warning || '';
  }

  const pill = document.getElementById('live-source-pill');
  if (pill) pill.textContent = hasRankings ? `ECR · ${prettyDate(f.scrapeDate).replace(/, \d{4}/, '')}` : 'Rankings not loaded';
  const dashTitle = document.getElementById('dashboard-feed-title');
  const dashDetail = document.getElementById('dashboard-feed-detail');
  if (dashTitle) dashTitle.textContent = hasRankings ? `${f.profile} · ${prettyDate(f.scrapeDate)}` : 'No rankings loaded';
  if (dashDetail) dashDetail.textContent = hasRankings ? `${f.rankedCount} ranked players · ${f.statusCount || 0} status matches` : 'Go to Players and refresh live data.';
  const banner = document.getElementById('draft-data-banner');
  if (banner) {
    const bdot = banner.querySelector('.feed-dot');
    const text = banner.querySelector('span:nth-child(2)');
    if (bdot) bdot.className = `feed-dot ${hasRankings ? 'ok' : 'idle'}`;
    if (text) text.textContent = hasRankings ? `${f.profile} · ${prettyDate(f.scrapeDate)}` : 'Rankings not loaded';
  }
}

function sourceMeta(player) {
  const bits = [];
  if (player.sourceLabel) bits.push(player.sourceLabel);
  if (player.sourceDate) bits.push(prettyDate(player.sourceDate).replace(/, \d{4}/, ''));
  if (num(player.ecrBest) !== null && num(player.ecrWorst) !== null) bits.push(`${formatRank(player.ecrBest)}–${formatRank(player.ecrWorst)}`);
  return bits.join(' · ');
}

function rankMoveMarkup(player) {
  const d = num(player.rankDelta);
  if (d === null || d === 0) return '';
  const cls = d > 0 ? 'up' : 'down';
  const sign = d > 0 ? '▲' : '▼';
  return `<span class="rank-move ${cls}" title="Ranking movement">${sign}${Math.abs(d)}</span>`;
}
