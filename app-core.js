const STORAGE_KEY = 'fantasyManagerStateV1';
const RANKINGS_URL = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv';
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl?active=true';
const SLEEPER_REFRESH_MS = 20 * 60 * 60 * 1000;
const AUTO_RANKINGS_REFRESH_MS = 24 * 60 * 60 * 1000;

const defaults = () => ({
  version: 3,
  settings: {
    leagueName: 'Yahoo Fantasy League',
    teamName: 'HIIT Happens',
    teams: 14,
    draftSlot: 12,
    rounds: 16,
    scoring: 'half-ppr',
    roster: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SFLEX: 0, DST: 1, K: 1, BENCH: 6 }
  },
  players: [],
  picks: [],
  manualRosterIds: [],
  leagueTeams: [],
  matchups: {},
  teamRosters: {},
  weeklyProjections: {},
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
    const oldVersion = Number(parsed.version || 1);
    const settings = {
      ...d.settings,
      ...(parsed.settings || {}),
      roster: { ...d.settings.roster, ...((parsed.settings || {}).roster || {}) }
    };
    // Migrate the original generic 12-team defaults to this league's known Yahoo setup.
    // Explicit user-customized settings remain untouched.
    if (oldVersion < 3 && Number(settings.teams) === 12 && Number(settings.draftSlot) === 1 && (!settings.teamName || settings.teamName === 'My Team')) {
      settings.leagueName = 'Yahoo Fantasy League';
      settings.teamName = 'HIIT Happens';
      settings.teams = 14;
      settings.draftSlot = 12;
    }
    return {
      ...d,
      ...parsed,
      version: 3,
      settings,
      players: Array.isArray(parsed.players) ? parsed.players : [],
      picks: Array.isArray(parsed.picks) ? parsed.picks : [],
      manualRosterIds: Array.isArray(parsed.manualRosterIds) ? parsed.manualRosterIds : [],
      leagueTeams: Array.isArray(parsed.leagueTeams) ? parsed.leagueTeams : [],
      matchups: parsed.matchups && typeof parsed.matchups === 'object' ? parsed.matchups : {},
      teamRosters: parsed.teamRosters && typeof parsed.teamRosters === 'object' ? parsed.teamRosters : {},
      weeklyProjections: parsed.weeklyProjections && typeof parsed.weeklyProjections === 'object' ? parsed.weeklyProjections : {},
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
