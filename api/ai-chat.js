module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { messages = [], restaurant_name, context } = req.body || {};

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ reply: 'VistaGusto AI is coming soon — the API key hasn\'t been configured yet.' });
  }

  const system = `You are the VistaGusto AI assistant for "${restaurant_name}". You help restaurant owners understand their digital menu performance. You have access to their current analytics data:

${JSON.stringify(context, null, 2)}

Be concise, friendly, and specific. Answer in 2–4 sentences max unless asked for more detail. If the data shows zeros, acknowledge that and suggest it likely means the tracking just started.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 320,
        system,
        messages,
      }),
    });
    const result = await resp.json();
    const reply = result?.content?.[0]?.text || 'I couldn\'t process that. Please try again.';
    res.json({ reply });
  } catch (err) {
    console.error('ai-chat error:', err);
    res.status(500).json({ error: err.message });
  }
};
