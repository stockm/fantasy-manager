// Modern unauthenticated landing + Firebase email auth onboarding.
(function(){
  const css=document.createElement('link');css.rel='stylesheet';css.href='auth-premium.css';document.head.appendChild(css);

  function setMode(want){
    if(typeof authMode!=='undefined'&&authMode!==want&&typeof toggleAuthMode==='function')toggleAuthMode();
    syncMode();focusAuth();
  }
  function focusAuth(){document.getElementById('auth-panel')?.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>document.getElementById('auth-email')?.focus(),250)}
  function syncMode(){
    const create=typeof authMode!=='undefined'&&authMode==='create';
    document.getElementById('premium-signin-tab')?.classList.toggle('active',!create);
    document.getElementById('premium-register-tab')?.classList.toggle('active',create);
    const eyebrow=document.getElementById('auth-panel-eyebrow');if(eyebrow)eyebrow.textContent=create?'CREATE YOUR ACCOUNT':'WELCOME BACK';
    const title=document.getElementById('auth-title');if(title)title.textContent=create?'Build your fantasy command center.':'Return to your war room.';
    const sub=document.getElementById('auth-panel-sub');if(sub)sub.textContent=create?'Create an account, then configure your Yahoo league and start building your board.':'Sign in to restore your league, rosters, trades and weekly intelligence.';
    const submit=document.getElementById('auth-submit');if(submit)submit.innerHTML=create?'Create free account <span>→</span>':'Enter war room <span>→</span>';
    const copy=document.getElementById('auth-switch-copy');if(copy)copy.textContent=create?'Already have an account?':'New here?';
    const sw=document.getElementById('auth-switch');if(sw)sw.textContent=create?'Sign in':'Create account';
  }

  function enhance(){
    const overlay=document.getElementById('auth-overlay');
    if(!overlay||overlay.dataset.premium==='2')return false;
    overlay.dataset.premium='2';
    overlay.innerHTML=`
      <div class="landing-shell">
        <header class="landing-nav">
          <button class="landing-brand" id="landing-home" aria-label="Fantasy GM home"><span class="brand-mark">FG</span><span>FANTASY <b>GM</b></span></button>
          <nav class="landing-links"><a href="#landing-features">Features</a><a href="#landing-weekly">Weekly edge</a><a href="#landing-sync">League sync</a></nav>
          <div class="landing-nav-actions"><button class="ghost-action" id="nav-signin">Sign in</button><button class="lime-action small" id="nav-register">Get started</button></div>
        </header>

        <main>
          <section class="landing-hero" id="landing-top">
            <div class="hero-copy modern-copy">
              <div class="hero-kicker"><span></span> AI FANTASY FOOTBALL COMMAND CENTER</div>
              <h1>SEE THE BOARD.<br><em>OWN THE WEEK.</em></h1>
              <p>Your league-specific fantasy GM combines draft market value, projections, roster construction, real NFL matchups and league-wide trade intelligence in one place.</p>
              <div class="hero-actions"><button class="lime-action" id="hero-register">Build my war room <span>→</span></button><button class="outline-action" id="hero-signin">I already have an account</button></div>
              <div class="hero-trust"><span>14-team aware</span><span>Yahoo-ready</span><span>10,000× matchup sims</span><span>AI trade analysis</span></div>
            </div>
            <div class="hero-visual" aria-label="Fantasy GM war room preview">
              <div class="visual-glow"></div><img src="assets/fantasy-war-room.svg" alt="Fantasy football draft and lineup command center preview">
              <div class="floating-card floating-pick"><span>YOUR PICK</span><strong>1.12</strong><small>AI board updating</small></div>
              <div class="floating-card floating-week"><span>WEEK 1</span><strong>62%</strong><small>Projected win chance</small></div>
            </div>
          </section>

          <section class="metric-band"><div><strong>Draft smarter</strong><span>ECR + ADP + VOR + scarcity</span></div><div><strong>Start smarter</strong><span>Opponent + home/away + weather + status</span></div><div><strong>Trade smarter</strong><span>League-wide roster and upgrade analysis</span></div><div><strong>Stay current</strong><span>Yahoo screenshot sync + Firestore</span></div></section>

          <section class="landing-section feature-section" id="landing-features">
            <div class="section-heading"><span>BUILT AROUND YOUR LEAGUE</span><h2>One engine from draft night to championship week.</h2><p>No generic cheat sheet. Every recommendation is shaped by your league size, scoring, roster, opponents and the players actually available.</p></div>
            <div class="feature-grid">
              <article class="feature-card featured"><div class="feature-num">01</div><h3>Live Draft War Room</h3><p>Value-based recommendations that blend consensus rank, real market ADP, projected points, positional scarcity and your exact roster construction.</p><div class="mini-board"><span>Best value now</span><strong>RB · +14.8 edge</strong><i></i></div></article>
              <article class="feature-card"><div class="feature-num">02</div><h3>Weekly Lineup Intelligence</h3><p>Optimize Week X with the actual opponent, home/away context, bye status, game environment, injury flags and matchup-adjusted projections.</p><div class="feature-chip-row"><span>vs KC</span><span>HOME</span><span>+6.2 PROJ</span></div></article>
              <article class="feature-card"><div class="feature-num">03</div><h3>Trade Center</h3><p>Maintain every team roster, record completed trades, surface acquisition targets and ask the AI what your roster should do next.</p><div class="trade-line"><b>Target #1</b><span>Clear WR upgrade</span></div></article>
              <article class="feature-card"><div class="feature-num">04</div><h3>Screenshot Import</h3><p>Upload Yahoo matchup or roster screenshots, review the detected changes, then update your league without repetitive manual entry.</p><div class="scan-frame"><span>YAHOO SCREENSHOT</span><i></i><b>7 matchups detected</b></div></article>
            </div>
          </section>

          <section class="landing-section weekly-section" id="landing-weekly">
            <div class="weekly-copy"><span class="section-kicker">EVERY WEEK TELLS A DIFFERENT STORY</span><h2>Your lineup should know who is actually playing whom.</h2><p>The optimizer uses the week you choose—not season-long averages alone. It can separate one-week matchup value from rest-of-season player value and explain the close calls.</p><ul><li>Actual NFL opponent and venue context</li><li>Home vs away, bye weeks and player status</li><li>Weather, wind and game environment when available</li><li>Simulation-driven floor vs ceiling recommendations</li></ul></div>
            <div class="weekly-demo"><div class="demo-top"><span>WEEK 1 · LINEUP EDGE</span><b>HIIT Happens</b></div><div class="demo-match"><div><small>START</small><strong>WR1</strong><span>vs LAC · Home</span></div><b>81%</b></div><div class="demo-match muted"><div><small>BENCH</small><strong>WR3</strong><span>@ BUF · Away</span></div><b>54%</b></div><div class="demo-ai">AI: Prefer the home receiver's stronger supplied projection and matchup evidence this week.</div></div>
          </section>

          <section class="landing-section sync-section" id="landing-sync">
            <div class="section-heading compact"><span>YOUR LEAGUE STAYS YOUR LEAGUE</span><h2>Built for Yahoo, without locking you into one data source.</h2><p>Keep Yahoo as the league of record while Fantasy GM combines your maintained league state with public rankings, player metadata and NFL schedule intelligence.</p></div>
            <div class="platform-row"><div class="platform-card active"><span class="platform-logo yahoo">Y!</span><div><b>Yahoo</b><small>Your league of record</small></div><i>PRIMARY</i></div><div class="platform-card"><span class="platform-logo data">FP</span><div><b>Consensus market data</b><small>ECR and ranking context</small></div></div><div class="platform-card"><span class="platform-logo data">NFL</span><div><b>NFL game context</b><small>Weekly schedules and environments</small></div></div></div>
          </section>

          <section class="landing-section auth-stage" id="auth-panel">
            <div class="auth-story"><div class="auth-step-label">SETUP · 1 / 2</div><div class="auth-progress"><i class="done"></i><i></i></div><span class="section-kicker">YOUR COMMAND CENTER STARTS HERE</span><h2>Build the league model once. Use it all season.</h2><p>Create your account or sign back in. Your authenticated league state stays in Firestore and follows you between sessions.</p><div class="auth-proof-grid"><div><strong>01</strong><span>Account</span></div><div><strong>02</strong><span>League setup</span></div><div><strong>03</strong><span>Draft + season</span></div></div></div>
            <form class="auth-card modern-auth-card" id="auth-form">
              <div class="auth-card-top"><span id="auth-panel-eyebrow">WELCOME BACK</span><div class="auth-secure">SECURE</div></div>
              <h2 id="auth-title">Return to your war room.</h2><p class="auth-sub" id="auth-panel-sub">Sign in to restore your league, rosters, trades and weekly intelligence.</p>
              <div class="auth-mode-tabs"><button class="auth-mode-tab active" id="premium-signin-tab" type="button">SIGN IN</button><button class="auth-mode-tab" id="premium-register-tab" type="button">REGISTER</button></div>
              <label>Email address<input id="auth-email" type="email" autocomplete="email" placeholder="you@example.com"></label>
              <label>Password<input id="auth-password" type="password" autocomplete="current-password" placeholder="••••••••"></label>
              <div class="auth-reset-row"><button class="auth-link" id="auth-reset" type="button">Forgot password?</button></div>
              <button class="auth-primary" id="auth-submit" type="submit">Enter war room <span>→</span></button>
              <div id="auth-message"></div>
              <div class="auth-divider"><span>FANTASY GM</span></div>
              <p class="auth-switch-row"><span id="auth-switch-copy">New here?</span> <button class="auth-link" id="auth-switch" type="button">Create account</button></p>
            </form>
          </section>

          <section class="landing-final"><span>READY FOR DRAFT NIGHT?</span><h2>Stop managing from a generic player list.</h2><button class="lime-action" id="final-register">Create my Fantasy GM <span>→</span></button></section>
        </main>
        <footer class="landing-footer"><div class="landing-brand static"><span class="brand-mark">FG</span><span>FANTASY <b>GM</b></span></div><p>League-specific fantasy football intelligence from draft night through the playoffs.</p></footer>
      </div>`;

    document.getElementById('auth-form')?.addEventListener('submit',event=>{event.preventDefault();authAction(authMode)});
    document.getElementById('auth-switch').onclick=()=>{toggleAuthMode();syncMode()};
    document.getElementById('auth-reset').onclick=()=>authAction('reset');
    document.getElementById('premium-signin-tab').onclick=()=>setMode('signin');
    document.getElementById('premium-register-tab').onclick=()=>setMode('create');
    ['nav-register','hero-register','final-register'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>setMode('create')));
    ['nav-signin','hero-signin'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>setMode('signin')));
    document.getElementById('landing-home')?.addEventListener('click',()=>document.getElementById('landing-top')?.scrollIntoView({behavior:'smooth'}));
    syncMode();
    return true;
  }

  const timer=setInterval(()=>{if(enhance())clearInterval(timer)},25);
  setTimeout(()=>clearInterval(timer),10000);
})();
