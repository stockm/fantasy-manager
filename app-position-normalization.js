// Position parsing hardening. Keep D/ST intact instead of splitting it into "D" + "ST".
// This also repairs test-generated team defenses and any imported defense rows that use D/ST.
(function installPositionNormalization(){
  if(typeof normalizePos!=='function')return;

  const defenseTokens=new Set(['DEF','DST','D-ST','D/ST']);
  const splitPositionValue=value=>{
    const text=String(value||'').trim();
    if(!text)return[];
    if(defenseTokens.has(text.toUpperCase()))return['D/ST'];
    return text.split(/[,;|/]+/).map(x=>x.trim()).filter(Boolean).map(normalizePos);
  };

  positionsOf=function(player){
    const source=Array.isArray(player?.positions)
      ? player.positions
      : [player?.position||player?.positions||''];
    const positions=source.flatMap(splitPositionValue).filter(Boolean);
    return [...new Set(positions)];
  };

  primaryPos=function(player){return positionsOf(player)[0]||'—'};
})();
