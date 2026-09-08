const PROVIDERS = {
  GROQ: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: import.meta.env.VITE_GROQ_API_KEY,
    model: 'openai/gpt-oss-120b'
  },
  GEMINI: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent',
    key: import.meta.env.VITE_GEMINI_API_KEY,
    model: 'gemini-3.7-flash'
  },
  CEREBRAS: {
    url: 'https://api.cerebras.ai/v1/chat/completions',
    key: import.meta.env.VITE_CEREBRAS_API_KEY,
    model: 'llama-3.3-70b'
  },
  OPENROUTER: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: import.meta.env.VITE_OPENROUTER_API_KEY,
    model: 'google/gemini-2.5-flash'
  }
};

function hasKey(provider) {
  return !!(provider.key && provider.key.trim() && provider.key.trim() !== '');
}

async function callOpenAICompat(url, key, model, prompt) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096
    })
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errBody.substring(0, 100)}`);
  }

  const data = await res.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('Empty response from provider');
  }
  return data.choices[0].message.content;
}

async function callGroq(prompt) {
  if (!hasKey(PROVIDERS.GROQ)) throw new Error('No Groq API key');
  return callOpenAICompat(PROVIDERS.GROQ.url, PROVIDERS.GROQ.key, PROVIDERS.GROQ.model, prompt);
}

async function callGemini(prompt) {
  if (!hasKey(PROVIDERS.GEMINI)) throw new Error('No Gemini API key');
  const res = await fetch(`${PROVIDERS.GEMINI.url}?key=${PROVIDERS.GEMINI.key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
    })
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errBody.substring(0, 100)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

async function callCerebras(prompt) {
  if (!hasKey(PROVIDERS.CEREBRAS)) throw new Error('No Cerebras API key');
  return callOpenAICompat(PROVIDERS.CEREBRAS.url, PROVIDERS.CEREBRAS.key, PROVIDERS.CEREBRAS.model, prompt);
}

async function callOpenRouter(prompt) {
  if (!hasKey(PROVIDERS.OPENROUTER)) throw new Error('No OpenRouter API key');
  return callOpenAICompat(PROVIDERS.OPENROUTER.url, PROVIDERS.OPENROUTER.key, PROVIDERS.OPENROUTER.model, prompt);
}

const CHAIN = [
  { name: 'Groq', fn: callGroq },
  { name: 'Gemini', fn: callGemini },
  { name: 'Cerebras', fn: callCerebras },
  { name: 'OpenRouter', fn: callOpenRouter },
];

export const aiService = {
  async generateResponse(prompt) {
    for (const provider of CHAIN) {
      try {
        console.log(`[AI] Trying ${provider.name}...`);
        const result = await provider.fn(prompt);
        console.log(`[AI] ${provider.name} succeeded`);
        return result;
      } catch (e) {
        console.warn(`[AI] ${provider.name} failed: ${e.message}`);
      }
    }
    throw new Error('AI generation is currently unavailable. Please try again later.');
  },

  getAvailableProviders() {
    return CHAIN.filter(p => {
      try { return hasKey(p.name === 'Groq' ? PROVIDERS.GROQ : p.name === 'Gemini' ? PROVIDERS.GEMINI : p.name === 'Cerebras' ? PROVIDERS.CEREBRAS : PROVIDERS.OPENROUTER); }
      catch { return false; }
    }).map(p => p.name);
  }
};
