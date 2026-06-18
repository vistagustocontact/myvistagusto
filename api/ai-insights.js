module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { restaurant_name, data } = req.body || {};

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ insight: 'AI insights will appear here once your VistaGusto AI is activated.' });
  }

  const prompt = `You are an AI assistant for VistaGusto, a restaurant digital menu platform with 3D and AR dish views.

Analyse this week's data for "${restaurant_name}" and write exactly 2–3 sentences of warm, specific, actionable insight for the restaurant owner. Focus on the most interesting finding. Do not use headers or bullet points — plain sentences only.

Data:
${JSON.stringify(data, null, 2)}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const result = await resp.json();
    if (result.error) {
      console.error('Claude error:', result.error);
      return res.json({ insight: `AI error: ${result.error.message}` });
    }
    const insight = result?.content?.[0]?.text || 'No insights available right now.';
    res.json({ insight });
  } catch (err) {
    console.error('ai-insights error:', err);
    res.status(500).json({ error: err.message });
  }
};
