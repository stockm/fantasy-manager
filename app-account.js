// Account, token balance and checkout entry point.
(function installAccountProfile() {
  const ACCOUNT_ENDPOINT = '/api/account-profile';
  const CHECKOUT_ENDPOINT = '/api/billing-checkout';
  let profile = null;
  let loading = false;
  let accountError = '';

  const fmtTokens = value => `${Number(value || 0).toLocaleString()} token${Number(value || 0) === 1 ? '' : 's'}`;
  const fmtMoney = pack => {
    if (pack?.displayPrice) return pack.displayPrice;
    const amount = Number(pack?.unitAmount || 0) / 100;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(pack?.currency || 'usd').toUpperCase() }).format(amount);
  };
  const dateText = value => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toLocaleString();
    return '';
  };

  function installStyles() {
    if (document.getElementById('account-style')) return;
    const s = document.createElement('style');
    s.id = 'account-style';
    s.textContent = `
      .account-view{--account-accent:#a8ff45}
      .account-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:16px;align-items:start}
      .account-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .account-kpi{min-height:116px;border:1px solid #293329;border-radius:8px;background:linear-gradient(145deg,#0d120e,#090c0a);padding:18px}
      .account-kpi span,.account-mini-label{display:block;color:#9da69c;font-size:11px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}
      .account-kpi strong{display:block;margin-top:9px;color:#f7f8f4;font-size:30px;line-height:1;letter-spacing:-.03em}
      .account-kpi small{display:block;margin-top:9px;color:#9da69c;font-size:12px;line-height:1.4}
      .account-plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}
      .account-pack{display:grid;gap:12px;min-height:230px;border:1px solid #2d382f;border-radius:8px;background:#0b100c;padding:18px}
      .account-pack.featured{border-color:#547b43;background:linear-gradient(145deg,rgba(168,255,69,.08),#0b100c)}
      .account-pack-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .account-pack h3{margin:0;color:#f7f8f4;font-size:18px;letter-spacing:-.02em}
      .account-pack b{font-size:34px;letter-spacing:-.04em}
      .account-pack p{margin:0;color:#aeb7ad;font-size:13px;line-height:1.45}
      .account-badge{border:1px solid #3b4c35;border-radius:999px;padding:5px 8px;color:#b8ff63;font-size:10px;font-weight:850;white-space:nowrap}
      .account-pack .btn{width:100%;margin-top:auto}
      .account-usage{display:grid;gap:10px}
      .account-usage-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #263027;border-radius:8px;padding:12px 14px;background:#0a0e0b}
      .account-usage-row strong{display:block;color:#f7f8f4}
      .account-usage-row span{color:#9da69c;font-size:12px}
      .account-note{border:1px dashed #344036;border-radius:8px;background:#0a0e0b;color:#9da69c;padding:16px;line-height:1.55}
      .account-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .account-actions .btn[disabled],.account-pack .btn[disabled]{opacity:.55;cursor:progress;transform:none}
      @media(max-width:1100px){.account-grid,.account-plan-grid{grid-template-columns:1fr}.account-kpis{grid-template-columns:1fr 1fr}}
      @media(max-width:640px){.account-kpis{grid-template-columns:1fr}.account-actions{align-items:stretch;flex-direction:column}.account-actions .btn{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function installShell() {
    const backupNav = document.querySelector('.nav-item[data-tab="backup"]');
    if (backupNav && !document.querySelector('.nav-item[data-tab="account"]')) {
      backupNav.insertAdjacentHTML('beforebegin', '<button class="nav-item" data-tab="account">Account</button>');
      document.querySelector('.nav-item[data-tab="account"]')?.addEventListener('click', () => {
        switchTab('account');
        loadProfile({ silent: true }).catch(() => {});
      });
    }
    const backupView = document.getElementById('view-backup');
    if (backupView && !document.getElementById('view-account')) {
      backupView.insertAdjacentHTML('beforebegin', `
        <section class="view account-view" id="view-account">
          <div class="page-head compact-head">
            <div>
              <div class="eyebrow">ACCOUNT</div>
              <h1>Profile & AI tokens</h1>
              <p class="page-copy">Manage your signed-in account, free daily AI allowance and paid token balance.</p>
            </div>
            <div class="account-actions">
              <button class="btn secondary" id="account-refresh">Refresh</button>
            </div>
          </div>
          <div id="account-status"></div>
        </section>
      `);
    }
    installStyles();
  }

  function loadingMarkup() {
    return window.aiLoadingMarkup
      ? window.aiLoadingMarkup('Loading account', 'Checking your AI token balance and recent purchases.')
      : '<div class="account-note">Loading account...</div>';
  }

  function signedOutMarkup() {
    return `<article class="surface"><div class="account-note"><strong>Sign in required.</strong><br>Use your account session to view token balance and start checkout.</div></article>`;
  }

  function profileMarkup(data) {
    const packs = Array.isArray(data?.packs) ? data.packs : [];
    const recent = Array.isArray(data?.recentPurchases) ? data.recentPurchases : [];
    const freeUsed = Number(data?.freeUsedToday || 0);
    const freeAllowance = Number(data?.freeDailyAllowance || 0);
    const freeRemaining = Number(data?.freeRemainingToday || 0);
    return `
      <div class="account-kpis">
        <article class="account-kpi"><span>Signed in as</span><strong style="font-size:20px;line-height:1.2;overflow-wrap:anywhere">${esc(data?.email || 'Account')}</strong><small>${esc(data?.plan || 'Free + token packs')}</small></article>
        <article class="account-kpi"><span>AI token balance</span><strong>${Number(data?.tokenBalance || 0).toLocaleString()}</strong><small>${fmtTokens(data?.lifetimePurchased)} purchased lifetime</small></article>
        <article class="account-kpi"><span>Free today</span><strong>${freeRemaining}</strong><small>${freeUsed} of ${freeAllowance} free tokens used on ${esc(data?.usageDay || 'today')}</small></article>
      </div>
      <div class="account-grid">
        <article class="surface">
          <div class="surface-head no-pad"><div><span class="section-label">TOKEN PACKS</span><h2>Buy AI analysis tokens</h2></div></div>
          <div class="account-plan-grid">
            ${packs.map(pack => `
              <div class="account-pack ${pack.id === 'weekly' ? 'featured' : ''}">
                <div class="account-pack-head"><h3>${esc(pack.name)}</h3>${pack.badge ? `<span class="account-badge">${esc(pack.badge)}</span>` : ''}</div>
                <b>${fmtMoney(pack)}</b>
                <p>${fmtTokens(pack.tokens)} for lineup reviews, trade analysis, screenshot parsing and weekly AI plans after your free daily allowance is used.</p>
                <button class="btn primary" data-buy-pack="${esc(pack.id)}">Buy ${fmtTokens(pack.tokens)}</button>
              </div>
            `).join('') || '<div class="account-note">Token packs are not available yet.</div>'}
          </div>
        </article>
        <article class="surface">
          <div class="surface-head no-pad"><div><span class="section-label">USAGE</span><h2>Today & recent purchases</h2></div></div>
          <div class="account-usage">
            <div class="account-usage-row"><div><strong>Free AI calls today</strong><span>Daily allowance resets at midnight UTC.</span></div><b>${freeUsed}/${freeAllowance}</b></div>
            <div class="account-usage-row"><div><strong>Paid tokens used today</strong><span>Only starts after the free allowance is exhausted.</span></div><b>${Number(data?.paidUsedToday || 0)}</b></div>
            <div class="account-usage-row"><div><strong>Lifetime paid tokens spent</strong><span>Total paid AI usage across this account.</span></div><b>${Number(data?.lifetimeSpent || 0).toLocaleString()}</b></div>
            ${recent.length ? recent.map(item => `
              <div class="account-usage-row">
                <div><strong>${esc(item.packName || item.packId || 'Token purchase')}</strong><span>${dateText(item.createdAt) || 'Recent purchase'}</span></div>
                <b>+${Number(item.tokens || 0).toLocaleString()}</b>
              </div>
            `).join('') : '<div class="account-note">No token purchases yet.</div>'}
          </div>
        </article>
      </div>
    `;
  }

  function render(data = profile) {
    const root = document.getElementById('account-status');
    if (!root) return;
    if (loading && !data) {
      root.innerHTML = loadingMarkup();
      return;
    }
    if (data) root.innerHTML = profileMarkup(data);
    else if (accountError) root.innerHTML = `<article class="surface"><div class="account-note"><strong>Account unavailable.</strong><br>${esc(accountError)}</div></article>`;
    else root.innerHTML = signedOutMarkup();
    root.querySelectorAll('[data-buy-pack]').forEach(btn => {
      btn.addEventListener('click', () => startCheckout(btn.dataset.buyPack, btn));
    });
  }

  async function loadProfile(options = {}) {
    const root = document.getElementById('account-status');
    if (!root) return null;
    loading = true;
    if (!options.silent) render();
    try {
      const headers = typeof authorizedJsonHeaders === 'function' ? await authorizedJsonHeaders() : { 'Content-Type': 'application/json' };
      const res = await fetch(ACCOUNT_ENDPOINT, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Account returned ${res.status}`);
      profile = data;
      accountError = '';
      return data;
    } catch (error) {
      profile = null;
      accountError = error.message;
      throw error;
    } finally {
      loading = false;
      render(profile);
    }
  }

  async function startCheckout(packId, button) {
    if (!packId || !button) return;
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Starting checkout...';
    try {
      const headers = typeof authorizedJsonHeaders === 'function' ? await authorizedJsonHeaders() : { 'Content-Type': 'application/json' };
      const res = await fetch(CHECKOUT_ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ packId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Checkout returned ${res.status}`);
      if (!data.url) throw new Error('Checkout did not return a payment link');
      window.location.href = data.url;
    } catch (error) {
      toast?.(error.message, 'error');
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function handleBillingReturn() {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get('billing');
    if (!billing) return;
    switchTab('account');
    if (billing === 'success') toast?.('Payment received. Token balance will update after Stripe confirms it.');
    if (billing === 'cancelled') toast?.('Checkout cancelled.');
    params.delete('billing');
    params.delete('pack');
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', next);
    setTimeout(() => loadProfile().catch(() => {}), 250);
  }

  function bind() {
    document.getElementById('account-refresh')?.addEventListener('click', () => loadProfile().catch(() => {}));
    window.addEventListener('fm:state-ready', () => loadProfile({ silent: true }).catch(() => {}));
  }

  installShell();
  bind();
  handleBillingReturn();
  window.renderAccountProfile = () => loadProfile();
})();
