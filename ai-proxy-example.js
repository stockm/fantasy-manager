// SERVER-SIDE EXAMPLE ONLY — do not load this file in GitHub Pages.
// Deploy this logic to a serverless function/worker and set OPENAI_API_KEY there.
// The browser's AI endpoint setting should point to that deployed HTTPS URL.
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const {task,context}=req.body||{};
  if(!['draft','weekly'].includes(task)||!context)return res.status(400).json({error:'Invalid request'});
  const instructions='You are an expert 14-team half-PPR fantasy football analyst. Use only the supplied league data. Treat projections/ECR/ADP as evidence, not certainty. Give concise actionable advice, explicitly identify the best action and 2 alternatives, explain roster construction/scarcity, and never invent injuries, news, projections or players not supplied.';
  const prompt=task==='draft'?'Analyze the current draft and recommend the best pick now. Account for all team rosters, likely positional scarcity, roster needs, available-player rank/ADP/projection, and the picks before this team selects again.':'Analyze this weekly matchup. Recommend lineup/roster priorities and realistic trades based on the supplied two rosters, projections and deterministic trade candidates. Clearly distinguish matchup tactics from rest-of-season roster value.';
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.6',instructions,input:`${prompt}\n\nDATA:\n${JSON.stringify(context)}`,max_output_tokens:900})});
  const data=await r.json();if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'OpenAI request failed'});
  const advice=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n').trim();
  return res.status(200).json({advice});
}
