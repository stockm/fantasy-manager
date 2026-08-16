// Trade Center roster-limit guard.
// Prevent manual roster maintenance from exceeding the configured active roster size.
(function installTradeRosterLimitGuard(){
  function leagueSize(){return Math.max(2,Number(state.settings?.teams||14))}
  function mySlot(){return Number(state.settings?.draftSlot||1)}
  function rosterLimit(){
    const r=state.settings?.roster||{};
    return ['QB','RB','WR','TE','FLEX','SFLEX','DST','K','BENCH']
      .reduce((sum,key)=>sum+Math.max(0,Number(r[key]||0)),0);
  }
  function rosterIds(slot){
    const key=String(slot);
    const maintained=Array.isArray(state.teamRosters?.[key])?state.teamRosters[key]:[];
    if(maintained.length||state.seasonRosterMode)return [...new Set(maintained)];
    return [...new Set((state.picks||[]).filter(p=>Number(p.teamSlot)===Number(slot)&&!p.rosterRemoved).map(p=>p.playerId))];
  }
  function ensureSeasonMode(){
    const total=Math.max(1,Number(state.settings?.teams||14))*Math.max(1,Number(state.settings?.rounds||1));
    const draftComplete=(state.picks||[]).length>=total;
    if(draftComplete||state.seasonRosterMode)return true;
    const ok=confirm('Your recorded draft pick log is not complete. Enable Season roster mode so roster moves are not overwritten by the draft-state repair logic?');
    if(!ok)return false;
    state.seasonRosterMode=true;
    saveState();
    return true;
  }
  function movePlayer(playerId,targetSlot){
    if(!state.teamRosters||typeof state.teamRosters!=='object')state.teamRosters={};
    for(let slot=1;slot<=leagueSize();slot++){
      const key=String(slot);
      state.teamRosters[key]=(state.teamRosters[key]||[]).filter(id=>id!==playerId);
    }
    const pick=(state.picks||[]).find(p=>p.playerId===playerId);
    if(pick)pick.rosterRemoved=!(targetSlot&&Number(pick.teamSlot)===Number(targetSlot));
    state.manualRosterIds=(state.manualRosterIds||[]).filter(id=>id!==playerId);
    if(targetSlot){
      const key=String(targetSlot);
      state.teamRosters[key]=[...(state.teamRosters[key]||[]),playerId];
      if(Number(targetSlot)===mySlot()&&(!pick||Number(pick.teamSlot)!==mySlot()))state.manualRosterIds.push(playerId);
    }
  }
  function refreshAfterMove(message){
    if(typeof window.refreshTradeRecommendations==='function')window.refreshTradeRecommendations({persist:false});
    saveState();
    lineupResult=null;
    if(typeof renderRoster==='function')renderRoster();
    if(typeof renderOpponentRosterEditor==='function')renderOpponentRosterEditor();
    if(typeof renderAdvice==='function')renderAdvice();
    if(typeof window.renderTradeCenter==='function')window.renderTradeCenter();
    if(typeof window.renderMatchupCenter==='function')window.renderMatchupCenter();
    toast(message);
  }
  function closeModal(){document.getElementById('trade-roster-limit-modal')?.remove();document.getElementById('trade-recommendation-modal')?.remove()}
  function showRecommendationConfirm({addPlayer,dropPlayer=null,teamName,onConfirm}){
    closeModal();
    const overlay=document.createElement('div');
    overlay.id='trade-recommendation-modal';
    overlay.className='trade-limit-overlay';
    overlay.innerHTML=`<div class="trade-limit-modal trade-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="trade-confirm-title">
      <div class="trade-limit-head"><div><span>CONFIRM MOVE</span><h3 id="trade-confirm-title">Apply recommendation?</h3></div><button class="trade-limit-close" type="button" aria-label="Close">×</button></div>
      <div class="trade-confirm-summary">
        <div><span>Add</span><strong>${esc(addPlayer.name)}</strong><small>${esc(primaryPos(addPlayer))} · ${esc(addPlayer.team||'')} → ${esc(teamName)}</small></div>
        ${dropPlayer?`<div><span>Drop</span><strong>${esc(dropPlayer.name)}</strong><small>${esc(primaryPos(dropPlayer))} · ${esc(dropPlayer.team||'')} from ${esc(teamName)}</small></div>`:''}
      </div>
      <p>This updates Fantasy Manager's maintained roster. Make the matching transaction in Yahoo if you want your live league roster to match.</p>
      <div class="trade-limit-foot"><span>Roster move preview</span><div><button class="btn secondary" type="button" data-limit-cancel>Cancel</button><button class="btn primary" type="button" data-limit-confirm>${dropPlayer?'Apply add/drop':'Add player'}</button></div></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.trade-limit-close').onclick=closeModal;
    overlay.querySelector('[data-limit-cancel]').onclick=closeModal;
    overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal()});
    overlay.querySelector('[data-limit-confirm]').onclick=()=>{closeModal();onConfirm?.()};
  }
  function showReplacementPicker(slot,newPlayer,requiredRemovals){
    closeModal();
    const current=rosterIds(slot).map(getPlayer).filter(Boolean);
    const teamName=typeof leagueTeamName==='function'?leagueTeamName(slot):`Team ${slot}`;
    const overlay=document.createElement('div');
    overlay.id='trade-roster-limit-modal';
    overlay.className='trade-limit-overlay';
    overlay.innerHTML=`<div class="trade-limit-modal" role="dialog" aria-modal="true" aria-labelledby="trade-limit-title">
      <div class="trade-limit-head"><div><span>ROSTER FULL</span><h3 id="trade-limit-title">Choose who to remove</h3></div><button class="trade-limit-close" type="button" aria-label="Close">×</button></div>
      <p>${esc(teamName)} already has ${current.length} of ${rosterLimit()} active roster spots filled. To add <strong>${esc(newPlayer.name)}</strong>, select ${requiredRemovals===1?'one player':`${requiredRemovals} players`} to remove.</p>
      <div class="trade-limit-list">${current.map(p=>`<label><input type="checkbox" value="${esc(p.id)}"><span><strong>${esc(p.name)}</strong><small>${esc(primaryPos(p))} · ${esc(p.team||'')}</small></span></label>`).join('')}</div>
      <div class="trade-limit-foot"><span id="trade-limit-count">0 of ${requiredRemovals} selected</span><div><button class="btn secondary" type="button" data-limit-cancel>Cancel</button><button class="btn primary" type="button" data-limit-confirm disabled>Remove & add ${esc(newPlayer.name)}</button></div></div>
    </div>`;
    document.body.appendChild(overlay);
    const boxes=[...overlay.querySelectorAll('input[type="checkbox"]')];
    const confirmBtn=overlay.querySelector('[data-limit-confirm]');
    const count=overlay.querySelector('#trade-limit-count');
    const update=()=>{const n=boxes.filter(x=>x.checked).length;count.textContent=`${n} of ${requiredRemovals} selected`;confirmBtn.disabled=n!==requiredRemovals};
    boxes.forEach(box=>box.addEventListener('change',()=>{
      if(box.checked&&boxes.filter(x=>x.checked).length>requiredRemovals)box.checked=false;
      update();
    }));
    overlay.querySelector('.trade-limit-close').onclick=closeModal;
    overlay.querySelector('[data-limit-cancel]').onclick=closeModal;
    overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal()});
    confirmBtn.onclick=()=>{
      const removeIds=boxes.filter(x=>x.checked).map(x=>x.value);
      if(removeIds.length!==requiredRemovals)return;
      removeIds.forEach(id=>movePlayer(id,null));
      movePlayer(newPlayer.id,slot);
      closeModal();
      refreshAfterMove(`${newPlayer.name} added to ${teamName}; ${removeIds.map(id=>getPlayer(id)?.name).filter(Boolean).join(', ')} removed`);
    };
  }
  function installStyles(){
    if(document.getElementById('trade-roster-limit-style'))return;
    const s=document.createElement('style');s.id='trade-roster-limit-style';s.textContent=`
      .trade-limit-overlay{position:fixed;inset:0;z-index:12000;background:rgba(2,6,4,.76);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px)}
      .trade-limit-modal{width:min(620px,100%);max-height:min(760px,88vh);display:flex;flex-direction:column;background:linear-gradient(145deg,#0d120e,#090c0a);border:1px solid #304134;border-radius:18px;box-shadow:0 28px 80px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.025);padding:22px;color:#f7f8f4}
      .trade-confirm-modal{width:min(540px,100%)}.trade-limit-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:1px solid #243027}.trade-limit-head span{font-size:10px;font-weight:950;letter-spacing:.12em;color:#a8ff45}.trade-limit-head h3{font-size:24px;margin:4px 0 0;letter-spacing:0}.trade-limit-close{display:grid;place-items:center;width:36px;height:36px;border:1px solid #2a362d;border-radius:999px;background:#101511;color:#9aa59a;font-size:24px;line-height:1;cursor:pointer}.trade-limit-close:hover{border-color:#58734b;color:#a8ff45}
      .trade-limit-modal>p{color:#9ea89e;line-height:1.55;font-size:13px}.trade-limit-list{overflow:auto;border:1px solid #27342b;border-radius:12px;background:#080b09;margin:6px 0 16px}.trade-limit-list label{display:grid;grid-template-columns:auto 1fr;gap:11px;align-items:center;padding:11px 12px;border-bottom:1px solid #1e2921;cursor:pointer}.trade-limit-list label:hover{background:#101811}.trade-limit-list label:last-child{border-bottom:0}.trade-limit-list input{margin:0;accent-color:#a8ff45}.trade-limit-list strong{display:block;font-size:13px}.trade-limit-list small{display:block;color:#7f8a7f;margin-top:2px}.trade-confirm-summary{display:grid;gap:10px;margin:16px 0}.trade-confirm-summary>div{border:1px solid #27342b;border-radius:13px;background:#080b09;padding:13px 14px}.trade-confirm-summary span{display:block;margin-bottom:5px;font-size:9px;font-weight:950;letter-spacing:.11em;text-transform:uppercase;color:#a8ff45}.trade-confirm-summary strong{display:block;font-size:17px}.trade-confirm-summary small{display:block;margin-top:4px;color:#899489}.trade-limit-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px}.trade-limit-foot>span{font-size:11px;color:#8d998d}.trade-limit-foot>div{display:flex;gap:8px}
      @media(max-width:620px){.trade-limit-foot{align-items:stretch;flex-direction:column}.trade-limit-foot>div{display:grid;grid-template-columns:1fr 1fr}.trade-limit-modal{padding:16px}}
    `;document.head.appendChild(s);
  }
  function handleAddClick(e){
    const btn=e.target.closest('#trade-add-player-btn');
    if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(!ensureSeasonMode())return;
    const slot=Number(document.getElementById('trade-roster-team')?.value||0);
    const id=document.getElementById('trade-add-player')?.value||'';
    if(!slot||!id)return toast('Choose a player to add','error');
    const player=getPlayer(id);if(!player)return toast('Player not found','error');
    const current=rosterIds(slot);
    if(current.includes(id))return toast(`${player.name} is already on this roster`,'error');
    const limit=rosterLimit();
    if(limit<=0)return toast('This league has no configured active roster spots','error');
    const requiredRemovals=Math.max(0,current.length+1-limit);
    if(requiredRemovals>0){showReplacementPicker(slot,player,requiredRemovals);return}
    movePlayer(id,slot);
    const name=typeof leagueTeamName==='function'?leagueTeamName(slot):`Team ${slot}`;
    refreshAfterMove(`${player.name} added to ${name} (${current.length+1}/${limit})`);
  }
  function applyRecommendedRosterMove({addId,dropId='',slot=mySlot(),onConfirmed=null}={}){
    if(!ensureSeasonMode())return false;
    const addPlayer=getPlayer(addId);if(!addPlayer)return toast('Recommended player not found','error'),false;
    const targetSlot=Number(slot)||mySlot(),current=rosterIds(targetSlot),teamName=typeof leagueTeamName==='function'?leagueTeamName(targetSlot):`Team ${targetSlot}`;
    if(current.includes(addId))return toast(`${addPlayer.name} is already on ${teamName}`,'error'),false;
    const owner=typeof window.ownerSlotOf==='function'?window.ownerSlotOf(addId):null;
    if(owner&&Number(owner)!==targetSlot){toast(`${addPlayer.name} is rostered by ${leagueTeamName(owner)}. Open Trade Center to build an offer.`,'error');switchTab?.('trades');window.renderTradeCenter?.();return false}
    const dropPlayer=dropId?getPlayer(dropId):null;
    if(dropId&&!dropPlayer)return toast('Drop candidate not found','error'),false;
    if(dropPlayer&&!current.includes(dropPlayer.id))return toast(`${dropPlayer.name} is not on ${teamName}`,'error'),false;
    const limit=rosterLimit();
    if(limit<=0)return toast('This league has no configured active roster spots','error'),false;
    if(dropPlayer){
      showRecommendationConfirm({addPlayer,dropPlayer,teamName,onConfirm:()=>{
        movePlayer(dropPlayer.id,null);
        movePlayer(addPlayer.id,targetSlot);
        refreshAfterMove(`${addPlayer.name} added; ${dropPlayer.name} removed`);
        onConfirmed?.();
      }});
      return false;
    }
    const requiredRemovals=Math.max(0,current.length+1-limit);
    if(requiredRemovals>0){showReplacementPicker(targetSlot,addPlayer,requiredRemovals);return false}
    showRecommendationConfirm({addPlayer,teamName,onConfirm:()=>{
      movePlayer(addPlayer.id,targetSlot);
      refreshAfterMove(`${addPlayer.name} added to ${teamName} (${current.length+1}/${limit})`);
      onConfirmed?.();
    }});
    return false;
  }
  installStyles();
  document.addEventListener('click',handleAddClick,true);
  window.applyRecommendedRosterMove=applyRecommendedRosterMove;
})();
