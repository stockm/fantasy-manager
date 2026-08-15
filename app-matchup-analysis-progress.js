// Visible progress state for Weekly Matchups AI analysis.
(function installWeeklyAnalysisProgress(){
  let busy=false;
  let observer=null;

  function button(){return document.getElementById('mc-analyze')}
  function aiOutput(){return document.getElementById('mc-ai-output')}
  function currentWeek(){return Math.max(1,Math.min(18,Number(document.getElementById('matchup-center-week')?.value)||Number(state.currentWeek)||1))}

  function ensureStyle(){
    if(document.getElementById('mc-analysis-progress-style'))return;
    const s=document.createElement('style');
    s.id='mc-analysis-progress-style';
    s.textContent=`
      #mc-analyze.mc-analyzing{min-width:170px;cursor:wait;box-shadow:0 0 0 1px rgba(168,255,69,.08),0 0 28px rgba(168,255,69,.14)!important}
      #mc-analyze.mc-analyzing .mc-spinner{width:14px;height:14px;border:2px solid rgba(8,16,8,.28);border-top-color:#081008;border-radius:50%;display:inline-block;vertical-align:-2px;margin-right:8px;animation:mcSpin .72s linear infinite}
      .mc-analysis-running{margin-top:12px;border:1px solid #314235;background:linear-gradient(135deg,#0e160f,#0a0f0b);border-radius:12px;padding:13px 15px;display:flex;align-items:center;gap:12px;color:#cbd5c9}
      .mc-analysis-running .pulse{width:9px;height:9px;border-radius:50%;background:#a8ff45;box-shadow:0 0 0 0 rgba(168,255,69,.45);animation:mcPulse 1.35s infinite}
      .mc-analysis-running strong{display:block;color:#f7f8f4;font-size:13px}.mc-analysis-running span{display:block;color:#89958a;font-size:11px;margin-top:2px}
      @keyframes mcSpin{to{transform:rotate(360deg)}}@keyframes mcPulse{70%{box-shadow:0 0 0 9px rgba(168,255,69,0)}100%{box-shadow:0 0 0 0 rgba(168,255,69,0)}}
    `;
    document.head.appendChild(s);
  }

  function setBusy(on){
    const b=button();if(!b)return;
    busy=on;
    if(on){
      b.dataset.originalLabel=b.textContent||'Analyze my Week';
      b.disabled=true;b.classList.add('mc-analyzing');
      b.innerHTML=`<span class="mc-spinner" aria-hidden="true"></span>Analyzing Week ${currentWeek()}…`;
      const out=aiOutput();
      if(out)out.innerHTML=`<div class="mc-analysis-running"><i class="pulse"></i><div><strong>Analyzing Week ${currentWeek()}</strong><span>Checking your lineup, opponent, available players, trades and NFL matchup context…</span></div></div>`;
    }else{
      b.disabled=false;b.classList.remove('mc-analyzing');
      b.textContent=b.dataset.originalLabel||'Analyze my Week';
    }
  }

  function watchForCompletion(){
    observer?.disconnect();
    const out=aiOutput();if(!out){setTimeout(()=>busy&&setBusy(false),15000);return}
    observer=new MutationObserver(()=>{
      if(!busy)return;
      const text=(out.textContent||'').trim();
      if(!text)return;
      const stillWorking=/analyzing|checking your lineup/i.test(text);
      if(!stillWorking){setBusy(false);observer?.disconnect()}
    });
    observer.observe(out,{childList:true,subtree:true,characterData:true});
    setTimeout(()=>{if(busy)setBusy(false);observer?.disconnect()},45000);
  }

  function bind(){
    ensureStyle();
    const b=button();if(!b||b.dataset.progressBound==='1')return;
    b.dataset.progressBound='1';
    b.addEventListener('click',()=>{
      if(busy)return;
      // Run after the existing click handler has started the analysis request.
      setTimeout(()=>{setBusy(true);watchForCompletion()},0);
    });
  }

  bind();
  const domObserver=new MutationObserver(()=>bind());
  domObserver.observe(document.body,{childList:true,subtree:true});
})();
