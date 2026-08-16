const STYLE_ASSETS = [
  'market.css',
  'app-screenshot-import-polish.css',
  'post-draft.css',
  'season-dashboard.css'
];

const SCRIPT_ASSETS = [
  'app-yahoo-config.js',
  'app-market.js',
  'app-market-labels.js',
  'app-position-normalization.js',
  'app-defense-score.js',
  'app-draft-value-engine.js',
  'app-defense-draft-integration.js',
  'app-ui-a.js',
  'app-ui-b.js',
  'app-ui-c.js',
  'app-league.js',
  'app-draft-team-names.js',
  'app-advice.js',
  'app-draft-state-integrity.js',
  'app-auto.js',
  'app-nfl-intelligence.js',
  'app-draft-guard.js',
  'app-ai.js',
  'app-weekly-lineup.js',
  'app-weekly-projections.js',
  'app-trades.js',
  'app-trade-roster-limit.js',
  'app-screenshot-import.js',
  'app-matchup-center.js',
  'app-weekly-projection-autoload.js',
  'app-matchup-analysis-progress.js',
  'app-draft-live.js',
  'app-draft-roster-flow.js',
  'app-player-card-enhance.js',
  'app-test-autodraft.js',
  'app-firebase-data.js',
  'app-performance.js',
  'app-season-dashboard.js',
  'app-theme.js',
  'app-auth-premium.js'
];

function appendStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

async function bootUiModules() {
  STYLE_ASSETS.forEach(appendStylesheet);
  for (const src of SCRIPT_ASSETS) {
    await loadScript(src);
  }
}

bootUiModules().catch(error => {
  console.error(error);
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = error.message;
    el.className = 'toast show error';
  }
});
