// Premium unauthenticated landing enhancements layered over Firebase Auth.
(function(){
  const css=document.createElement('link');css.rel='stylesheet';css.href='auth-premium.css';document.head.appendChild(css);
  function enhance(){
    const overlay=document.getElementById('auth-overlay');
    if(!overlay||overlay.dataset.premium==='1')return false;
    overlay.dataset.premium='1';
    const copy=overlay.querySelector('.hero-copy');
    if(copy){
      const p=copy.querySelector('p');
      if(p)p.textContent='Your AI fantasy GM from draft night to championship week. Combine market ADP, projections, roster construction, real NFL matchups and league-wide intelligence in one command center.';
      const h=copy.querySelector('h1');if(h)h.innerHTML='Dominate your <span>league.</span>';
      copy.insertAdjacentHTML('beforeend','<div class="premium-proof"><span class="premium-live">LIVE LEAGUE INTELLIGENCE</span><span>10,000× MATCHUP SIMS</span><span>14-TEAM ROSTER AWARE</span></div>');
    }
    const card=overlay.querySelector('.auth-card');
    const title=document.getElementById('auth-title');
    if(card&&title){
      title.insertAdjacentHTML('beforebegin','<div class="auth-mode-tabs"><button class="auth-mode-tab active" id="premium-signin-tab">SIGN IN</button><button class="auth-mode-tab" id="premium-register-tab">REGISTER</button></div>');
      document.getElementById('premium-signin-tab').onclick=()=>setMode('signin');
      document.getElementById('premium-register-tab').onclick=()=>setMode('create');
    }
    return true;
  }
  function setMode(want){
    if(typeof authMode!=='undefined'&&authMode!==want&&typeof toggleAuthMode==='function')toggleAuthMode();
    syncTabs();
  }
  function syncTabs(){
    const signin=document.getElementById('premium-signin-tab'),register=document.getElementById('premium-register-tab');
    if(!signin||!register)return;
    const create=typeof authMode!=='undefined'&&authMode==='create';
    signin.classList.toggle('active',!create);register.classList.toggle('active',create);
  }
  const timer=setInterval(()=>{if(enhance()){clearInterval(timer);const sw=document.getElementById('auth-switch');sw?.addEventListener('click',()=>setTimeout(syncTabs));syncTabs()}},25);
  setTimeout(()=>clearInterval(timer),10000);
})();