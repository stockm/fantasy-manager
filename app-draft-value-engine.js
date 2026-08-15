// Overall ECR + ADP + value-over-replacement + league scarcity + roster construction.
// Performance note: all expensive player-pool grouping/sorting is built once per UI turn.
(function(){
 const pos=p=>{const x=String(primaryPos(p)||'').toUpperCase();return x==='D/ST'||x==='DEF'?'DST':x};
 let cached=null,clearScheduled=false;
 function demand(x,r){if(x==='QB')return (+r.QB||0)+(+r.SFLEX||0)*.72;if(x==='RB')return (+r.RB||0)+(+r.FLEX||0)*.42+(+r.SFLEX||0)*.1;if(x==='WR')return (+r.WR||0)+(+r.FLEX||0)*.43+(+r.SFLEX||0)*.1;if(x==='TE')return (+r.TE||0)+(+r.FLEX||0)*.15+(+r.SFLEX||0)*.08;return +r[x]||0}
 function build(target){
  const r=state.settings.roster||{},teams=+state.settings.teams||14,my=myRoster(),c={QB:0,RB:0,WR:0,TE:0,K:0,DST:0};
  my.forEach(p=>{const x=pos(p);if(c[x]!=null)c[x]++});
  const d={QB:Math.max(0,+r.QB-c.QB||0),RB:Math.max(0,+r.RB-c.RB||0),WR:Math.max(0,+r.WR-c.WR||0),TE:Math.max(0,+r.TE-c.TE||0),K:Math.max(0,+r.K-c.K||0),DST:Math.max(0,+r.DST-c.DST||0)};
  const skill=Math.max(0,c.RB-(+r.RB||0))+Math.max(0,c.WR-(+r.WR||0))+Math.max(0,c.TE-(+r.TE||0)),flex=Math.max(0,(+r.FLEX||0)-skill),sflex=Math.max(0,(+r.SFLEX||0)-(Math.max(0,c.QB-(+r.QB||0))+skill));
  const open={r,c,d,flex,sflex,core:d.RB+d.WR+d.TE+flex,all:d.QB+d.RB+d.WR+d.TE+d.K+d.DST+flex+sflex};
  const positions=['QB','RB','WR','TE','K','DST'],allByPos={},available=availablePlayers(),availableByPos={},replacement={},scarcityById=new Map(),constructionByPos={};
  for(const x of positions){
   allByPos[x]=(state.players||[]).filter(p=>pos(p)===x).sort((a,b)=>num(b.projection,-1)-num(a.projection,-1)||num(a.rank,9999)-num(b.rank,9999)||num(a.adp,9999)-num(b.adp,9999));
   const pool=allByPos[x],idx=pool.length?Math.min(pool.length-1,Math.max(0,Math.ceil(teams*Math.max(1,demand(x,r))))):0;
   replacement[x]=pool.length?pool[idx]:null;
   availableByPos[x]=available.filter(p=>pos(p)===x).sort((a,b)=>num(a.rank,9999)-num(b.rank,9999)||num(a.adp,9999)-num(b.adp,9999));
   const arr=availableByPos[x];
   for(let i=0;i<arr.length;i++){
    const p=arr[i],n=arr[Math.min(arr.length-1,i+3)];let gap=0;
    if(num(p.rank)!==null&&num(n?.rank)!==null)gap=Math.max(gap,num(n.rank)-num(p.rank));
    if(num(p.adp)!==null&&num(n?.adp)!==null)gap=Math.max(gap,(num(n.adp)-num(p.adp))*.8);
    let m={RB:1.25,WR:1.15,TE:.82,QB:(+r.SFLEX||0)>0?1.45:.55,K:.05,DST:.05}[x]||.6;
    if(x==='RB'||x==='WR')m+=clamp((teams-10)/4,0,1.5)*.18;
    scarcityById.set(p.id,clamp(gap*m,0,75));
   }
   const left=Math.max(0,(+state.settings.rounds||0)-myDraftPicks().length);let v=0,n='';
   if(x==='QB'){if(c.QB>=(+r.QB||0)&&!(+r.SFLEX||0)){v-=open.core?235:125;n='QB already filled'}else if(d.QB){v+=22;n='fills starting QB'}else if(sflex){v+=55;n='fills Superflex need'}}
   else if(x==='TE'){if(c.TE>=(+r.TE||0)){v-=open.core?175:90;n='TE already filled'}else if(d.TE){v+=34;n='fills starting TE'}}
   else if(x==='RB'||x==='WR'){if(d[x]){v+=70;n=`fills starting ${x}`}else if(flex){v+=48;n='fills FLEX/depth need'}else{v+=22;n='adds high-value depth'}}
   else if(x==='K'||x==='DST'){if(d[x]&&left<=Math.max(3,open.all+2)){v+=95;n=`must fill ${x}`}else if(d[x]){v-=285;n=`wait on ${x}`}else{v-=360;n=`${x} already filled`}}
   constructionByPos[x]={v,n};
  }
  return{target,r,available,replacement,scarcityById,constructionByPos,memo:new Map()};
 }
 function ctx(target){
  target=Number(target||nextMyOverall()||currentOverallPick());
  if(!cached||cached.target!==target)cached=build(target);
  if(!clearScheduled){clearScheduled=true;setTimeout(()=>{cached=null;clearScheduled=false},0)}
  return cached;
 }
 function vor(p,x,cx){const rp=cx.replacement[x],pp=num(p.projection),rv=num(rp?.projection);if(pp!==null&&rv!==null)return clamp(pp-rv,-60,180);const pr=num(p.rank),rr=num(rp?.rank);return pr!==null&&rr!==null?clamp((rr-pr)*.55,-45,120):0}
 function breakdown(p,target=nextMyOverall()||currentOverallPick()){
  const cx=ctx(target),memoKey=p.id||`${p.name}|${p.team}`;if(cx.memo.has(memoKey))return cx.memo.get(memoKey);
  const rank=num(p.rank),adp=num(p.adp),x=pos(p),v=vor(p,x,cx),sc=cx.scarcityById.get(p.id)||0,rc=cx.constructionByPos[x]||{v:0,n:''};
  let proj=v*1.35;if(x==='QB'&&!(+cx.r.SFLEX||0))proj*=.72;if(x==='K'||x==='DST')proj*=.15;
  const ecr=rank===null?0:Math.max(-120,720-rank*5.2),market=adp===null?0:Math.max(-100,420-adp*2.5),timing=adp===null?0:clamp(cx.target-adp,-28,28)*3.1,inj=p.status&&/out|ir|susp|pup|nfi/i.test(p.status)?-80:0;
  const out={score:ecr+market+timing+proj+sc+rc.v+inj,ecr,market,timing,vor:v,scarcity:sc,construction:rc.v,note:rc.n,position:x,replacement:cx.replacement[x]?.name||'',injury:inj};cx.memo.set(memoKey,out);return out
 }
 window.invalidateDraftValueCache=()=>{cached=null};
 window.draftValueBreakdown=breakdown;
 window.draftValueContext=(p,t)=>{const b=breakdown(p,t);return{score:+b.score.toFixed(1),overallEcr:num(p.rank),adp:num(p.adp),projection:num(p.projection),valueOverReplacement:+b.vor.toFixed(1),positionalScarcity:+b.scarcity.toFixed(1),rosterConstruction:+b.construction.toFixed(1),rosterConstructionNote:b.note,replacementPlayer:b.replacement}};
 rosterNeedBonus=p=>{const b=breakdown(p,nextMyOverall()||currentOverallPick());return b.construction};
 recommendationScore=(p,t)=>breakdown(p,t).score;
 recommendationReason=(p,t)=>{const b=breakdown(p,t),a=[];if(num(p.rank)!==null)a.push(`overall ECR #${formatRank(p.rank)}`);if(num(p.adp)!==null){const d=Math.round(t-num(p.adp));a.push(d>=4?`${d} picks past ADP`:d<=-4?`${Math.abs(d)} picks before ADP`:`ADP ${p.adp}`)}if(Math.abs(b.vor)>=3)a.push(`VOR ${b.vor>=0?'+':''}${Math.round(b.vor)}`);if(b.scarcity>=5)a.push(`${b.position} scarcity +${Math.round(b.scarcity)}`);if(b.note)a.push(b.note);if(p.status)a.push(p.status);return a.join(' · ')||'Overall value, market and roster fit are neutral'};
 recommendedPlayers=(limit=8,target=nextMyOverall()||currentOverallPick())=>{let a=ctx(target).available;if(typeof guardedDraftCandidates==='function'){const g=guardedDraftCandidates(a);if(g?.length)a=g}return a.map(p=>{const b=breakdown(p,target);return{player:p,score:b.score,breakdown:b}}).sort((x,y)=>y.score-x.score||num(x.player.rank,9999)-num(y.player.rank,9999)||num(x.player.adp,9999)-num(y.player.adp,9999)).slice(0,limit)};
})();
