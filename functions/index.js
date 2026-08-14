const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

const SYSTEM = `You are an expert fantasy football analyst for a 14-team half-PPR league.
Use only the supplied league/player data. Treat projections, ECR and ADP as evidence, not certainty.
Be decisive and actionable. Never invent injuries, news, projections, players, roster moves, or facts not present in the supplied data.
For draft analysis: recommend one best pick, two alternatives, explain roster construction, positional scarcity, value versus ADP/ECR, and what is likely to survive until the next pick.
For weekly analysis: give matchup outlook, start/sit and roster priorities supported by supplied data, then realistic trade ideas. Clearly separate one-week tactics from rest-of-season value.`;

function taskPrompt(task) {
  return task === 'draft'
    ? 'Analyze the current draft state and recommend the best selection now.'
    : 'Analyze the selected weekly matchup and give lineup, roster, waiver-profile and trade guidance using only the supplied data.';
}

function extractText(data) {
  if (typeof data.output_text === 'string') return data.output_text.trim();
  return (data.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text || '')
    .join('\n')
    .trim();
}

exports.aiAdvice = onRequest(
  { secrets: [OPENAI_API_KEY], timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { task, context } = req.body || {};
    if (!['draft', 'weekly'].includes(task) || !context || typeof context !== 'object') {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const serialized = JSON.stringify(context);
    if (serialized.length > 180000) return res.status(413).json({ error: 'Analysis context too large' });

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY.value()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-5.6',
          instructions: SYSTEM,
          input: `${taskPrompt(task)}\n\nLEAGUE DATA:\n${serialized}`,
          max_output_tokens: 1200
        })
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('OpenAI error', response.status, data?.error?.message || 'unknown');
        return res.status(response.status >= 500 ? 502 : response.status).json({ error: data?.error?.message || 'AI request failed' });
      }

      const advice = extractText(data);
      if (!advice) return res.status(502).json({ error: 'AI returned no advice' });
      return res.status(200).json({ advice });
    } catch (error) {
      console.error('aiAdvice failure', error);
      return res.status(500).json({ error: 'AI analysis temporarily unavailable' });
    }
  }
);
