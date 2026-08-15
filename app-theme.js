// Logged-in visual theme + safe lightweight Markdown formatter for AI responses.
(function installAppTheme(){
  const css=document.createElement('link');css.rel='stylesheet';css.href='app-theme.css';document.head.appendChild(css);

  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function inline(text){
    let s=escapeHtml(text);
    s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
    s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    s=s.replace(/__([^_]+)__/g,'<strong>$1</strong>');
    s=s.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    return s;
  }
  function isDivider(line){return /^\s*\|?\s*:?-{3,}/.test(line)&&line.includes('-')}
  function tableCells(line){return line.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim()).filter((x,i,a)=>x||i<a.length-1)}
  function normalizeMarkdown(raw){
    return String(raw||'')
      .replace(/\r/g,'')
      .replace(/([^\n])(?=#{2,4}\s)/g,'$1\n\n')
      .replace(/([^\n])(?=---(?:\n|$))/g,'$1\n')
      .replace(/\n{3,}/g,'\n\n')
      .trim();
  }
  function formatAiMarkdown(raw){
    const lines=normalizeMarkdown(raw).split('\n');
    const out=[];let i=0;
    while(i<lines.length){
      const line=lines[i].trim();
      if(!line){i++;continue}
      if(line.startsWith('|')&&i+1<lines.length&&isDivider(lines[i+1])){
        const head=tableCells(lines[i]),rows=[];i+=2;
        while(i<lines.length&&lines[i].trim().startsWith('|')){rows.push(tableCells(lines[i]));i++}
        out.push(`<div class="ai-table-wrap"><table><thead><tr>${head.map(c=>`<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue;
      }
      const heading=line.match(/^(#{2,4})\s+(.+)$/);
      if(heading){const level=Math.min(4,heading[1].length);out.push(`<h${level}>${inline(heading[2])}</h${level}>`);i++;continue}
      if(/^[-*_]{3,}$/.test(line)){out.push('<hr>');i++;continue}
      if(/^[-*]\s+/.test(line)){
        const items=[];while(i<lines.length&&/^\s*[-*]\s+/.test(lines[i])){items.push(lines[i].replace(/^\s*[-*]\s+/,''));i++}
        out.push(`<ul>${items.map(x=>`<li>${inline(x)}</li>`).join('')}</ul>`);continue;
      }
      if(/^\d+[.)]\s+/.test(line)){
        const items=[];while(i<lines.length&&/^\s*\d+[.)]\s+/.test(lines[i])){items.push(lines[i].replace(/^\s*\d+[.)]\s+/,''));i++}
        out.push(`<ol>${items.map(x=>`<li>${inline(x)}</li>`).join('')}</ol>`);continue;
      }
      const action=/^(recommendation|highest-impact|priority|best move|action|bottom line|trade|pickup|start|sit|important)\b/i.test(line.replace(/[*#:]/g,'').trim());
      const paragraph=[];
      while(i<lines.length){
        const x=lines[i].trim();
        if(!x){i++;break}
        if(paragraph.length&&(x.startsWith('#')||/^[-*]\s+/.test(x)||/^\d+[.)]\s+/.test(x)||(x.startsWith('|')&&i+1<lines.length&&isDivider(lines[i+1]))||/^[-*_]{3,}$/.test(x)))break;
        paragraph.push(x);i++;
      }
      const html=paragraph.map(inline).join(' ');out.push(action?`<div class="ai-action">${html}</div>`:`<p>${html}</p>`);
    }
    return out.join('');
  }
  window.formatAiMarkdown=formatAiMarkdown;

  function sourceText(el){
    if(el.dataset.aiRaw)return el.dataset.aiRaw;
    const clone=el.cloneNode(true);
    clone.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));
    clone.querySelectorAll('p,div,h1,h2,h3,h4,li,tr').forEach(node=>{
      if(node!==clone)node.appendChild(document.createTextNode('\n'));
    });
    return clone.textContent||'';
  }
  function formatNode(el){
    if(!(el instanceof HTMLElement)||el.dataset.aiFormatted==='1')return;
    const raw=sourceText(el);
    if(!raw.trim())return;
    el.dataset.aiRaw=raw;
    el.innerHTML=formatAiMarkdown(raw);el.classList.add('ai-formatted');el.dataset.aiFormatted='1';
  }
  function scan(root=document){root.querySelectorAll?.('.ai-response').forEach(formatNode)}
  scan();
  const observer=new MutationObserver(mutations=>{
    for(const m of mutations)m.addedNodes.forEach(node=>{
      if(!(node instanceof HTMLElement))return;
      if(node.matches('.ai-response'))formatNode(node);
      scan(node);
    });
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();
