const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '8000', 10);
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || '10000', 10);
const OLLAMA_MAX_FAILS = parseInt(process.env.OLLAMA_MAX_FAILS || '3', 10);
const OLLAMA_COOLDOWN_MS = parseInt(process.env.OLLAMA_COOLDOWN_MS || '60000', 10);

let ollamaFailures = 0;
let ollamaDisabledUntil = 0;

function normalizeHistory(messages) {
  return messages
    .slice(-20)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 1000).trim(),
    }))
    .filter((m) => m.content);
}

function withTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

function markOllamaSuccess() {
  ollamaFailures = 0;
  ollamaDisabledUntil = 0;
}

function markOllamaFailure() {
  ollamaFailures += 1;
  if (ollamaFailures >= OLLAMA_MAX_FAILS) {
    ollamaDisabledUntil = Date.now() + OLLAMA_COOLDOWN_MS;
  }
}

function isOllamaOpen() {
  if (!ollamaDisabledUntil) return true;
  if (Date.now() >= ollamaDisabledUntil) {
    ollamaDisabledUntil = 0;
    ollamaFailures = 0;
    return true;
  }
  return false;
}

async function callOllama({ systemPrompt, history }) {
  if (!isOllamaOpen()) {
    throw new Error('Ollama temporalmente en cooldown por fallos recientes.');
  }

  const timeout = withTimeoutSignal(OLLAMA_TIMEOUT_MS);
  try {
    const response = await fetch(`${DEFAULT_OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeout.signal,
      body: JSON.stringify({
        model: DEFAULT_OLLAMA_MODEL,
        stream: false,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const msg = data?.error || `Ollama error ${response.status}`;
      throw new Error(msg);
    }

    const reply = data?.message?.content?.trim();
    if (!reply) throw new Error('Ollama devolvio una respuesta vacia.');

    markOllamaSuccess();
    return { provider: 'ollama', reply };
  } catch (err) {
    markOllamaFailure();
    throw err;
  } finally {
    timeout.clear();
  }
}

async function callGroq({ systemPrompt, history, apiKey }) {
  if (!apiKey) throw new Error('GROQ_API_KEY no configurada.');

  const timeout = withTimeoutSignal(GROQ_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: timeout.signal,
      body: JSON.stringify({
        model: DEFAULT_GROQ_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const msg = data?.error?.message || `Groq error ${response.status}`;
      throw new Error(msg);
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('Groq devolvio una respuesta vacia.');

    return { provider: 'groq', reply };
  } finally {
    timeout.clear();
  }
}

function safeReply({ waUrl, properties = [] }) {
  const top = properties.slice(0, 3);
  const summary = top.length
    ? top.map((p, idx) => `${idx + 1}. ${p.title} - ${p.price} - ${p.city || p.address || 'Ubicacion por confirmar'}\n${p.url}`).join('\n\n')
    : 'Ahora mismo no tengo el listado en vivo disponible.';

  return [
    'Estoy en modo seguro por alta demanda o mantenimiento del motor de IA.',
    '',
    'Estas son algunas opciones disponibles:',
    summary,
    '',
    `Si prefieres, te conecto directo con un asesor: ${waUrl}`,
    '¿Buscas compra o alquiler y en que distrito?',
  ].join('\n');
}

async function generateChatReply({ messages, systemPrompt, properties, waUrl }) {
  const history = normalizeHistory(messages || []);
  if (!history.length) {
    throw new Error('Mensaje vacio.');
  }

  const primary = (process.env.LLM_PRIMARY || 'ollama').toLowerCase();
  const allowGroqFallback = String(process.env.LLM_ENABLE_GROQ_FALLBACK || 'false').toLowerCase() === 'true';
  const groqKey = process.env.GROQ_API_KEY;

  const providers = primary === 'groq'
    ? ['groq', 'ollama']
    : ['ollama', 'groq'];

  const attempts = [];

  for (const provider of providers) {
    if (provider === 'groq' && !allowGroqFallback && primary !== 'groq') {
      continue;
    }

    try {
      if (provider === 'ollama') {
        return await callOllama({ systemPrompt, history });
      }
      return await callGroq({ systemPrompt, history, apiKey: groqKey });
    } catch (err) {
      attempts.push({ provider, error: err.message });
      console.warn(`[Habby] ${provider} fallo:`, err.message);
    }
  }

  return {
    provider: 'safe-mode',
    reply: safeReply({ waUrl, properties }),
    attempts,
  };
}

function getLlmStatus() {
  return {
    primary: (process.env.LLM_PRIMARY || 'ollama').toLowerCase(),
    ollama: {
      baseUrl: DEFAULT_OLLAMA_URL,
      model: DEFAULT_OLLAMA_MODEL,
      timeoutMs: OLLAMA_TIMEOUT_MS,
      consecutiveFailures: ollamaFailures,
      open: isOllamaOpen(),
      cooldownUntil: ollamaDisabledUntil ? new Date(ollamaDisabledUntil).toISOString() : null,
    },
    groq: {
      enabledAsFallback: String(process.env.LLM_ENABLE_GROQ_FALLBACK || 'false').toLowerCase() === 'true',
      configured: Boolean(process.env.GROQ_API_KEY),
      model: DEFAULT_GROQ_MODEL,
      timeoutMs: GROQ_TIMEOUT_MS,
    },
  };
}

module.exports = {
  generateChatReply,
  getLlmStatus,
};
