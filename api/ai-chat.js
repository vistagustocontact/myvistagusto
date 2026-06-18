module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { messages = [], restaurant_name, context } = req.body || {};

  if (!process.env.GEMINI_API_KEY) {
    return res.json({ reply: 'VistaGusto AI is coming soon — the API key hasn\'t been configured yet.' });
  }

  const systemPrompt = `You are the VistaGusto AI assistant for "${restaurant_name}". You help restaurant owners understand their digital menu performance. You have access to their current analytics data:

${JSON.stringify(context, null, 2)}

Be concise, friendly, and specific. Answer in 2–4 sentences max unless asked for more detail. If the data shows zeros, acknowledge that and suggest it likely means the tracking just started.`;

  // Convert messages to Gemini format, prepend system prompt as first user turn
  const geminiContents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood! I\'m ready to help.' }] },
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  ];

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: geminiContents }),
      }
    );
    const result = await resp.json();
    if (result.error) {
      console.error('Gemini error:', result.error);
      return res.json({ reply: `AI error: ${result.error.message}` });
    }
    const reply = result?.candidates?.[0]?.content?.parts?.[0]?.text || 'I couldn\'t process that. Please try again.';
    res.json({ reply });
  } catch (err) {
    console.error('ai-chat error:', err);
    res.status(500).json({ error: err.message });
  }
};
