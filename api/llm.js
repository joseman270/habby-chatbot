const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';
const DEFAULT_OLLAMA_FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || '';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '8000', 10);
const GEMINI_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS || '10000', 10);
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || '10000', 10);
const OLLAMA_MAX_FAILS = parseInt(process.env.OLLAMA_MAX_FAILS || '3', 10);
const OLLAMA_COOLDOWN_MS = parseInt(process.env.OLLAMA_COOLDOWN_MS || '60000', 10);
const OLLAMA_ENABLE_LOCAL_MODEL_FALLBACK = String(process.env.OLLAMA_ENABLE_LOCAL_MODEL_FALLBACK || 'false').toLowerCase() === 'true';
const LLM_ENABLE_OLLAMA_FALLBACK = String(process.env.LLM_ENABLE_OLLAMA_FALLBACK || 'true').toLowerCase() === 'true';
const LLM_ENABLE_GEMINI_FALLBACK = String(process.env.LLM_ENABLE_GEMINI_FALLBACK || 'false').toLowerCase() === 'true';
const LLM_BUDGET_GUARD_ENABLED = String(process.env.LLM_BUDGET_GUARD_ENABLED || 'false').toLowerCase() === 'true';
const LLM_BUDGET_SWITCH_THRESHOLD = Number.parseFloat(process.env.LLM_BUDGET_SWITCH_THRESHOLD || '0.85');
const LLM_QUOTA_COOLDOWN_MS = parseInt(process.env.LLM_QUOTA_COOLDOWN_MS || '3600000', 10);
const GEMINI_DAILY_SOFT_LIMIT_RPD = parseInt(process.env.GEMINI_DAILY_SOFT_LIMIT_RPD || '0', 10);
const GROQ_DAILY_SOFT_LIMIT_RPD = parseInt(process.env.GROQ_DAILY_SOFT_LIMIT_RPD || '0', 10);
const OLLAMA_DAILY_SOFT_LIMIT_RPD = parseInt(process.env.OLLAMA_DAILY_SOFT_LIMIT_RPD || '0', 10);

let ollamaFailures = 0;
let ollamaDisabledUntil = 0;

const providerCooldownUntil = {
  ollama: 0,
  gemini: 0,
  groq: 0,
};

const providerDailyUsage = {
  ollama: { dayKey: '', requests: 0 },
  gemini: { dayKey: '', requests: 0 },
  groq: { dayKey: '', requests: 0 },
};

function getDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function resetDailyUsageIfNeeded(provider) {
  const key = getDayKey();
  if (providerDailyUsage[provider].dayKey !== key) {
    providerDailyUsage[provider].dayKey = key;
    providerDailyUsage[provider].requests = 0;
  }
}

function incrementDailyUsage(provider) {
  if (!providerDailyUsage[provider]) return;
  resetDailyUsageIfNeeded(provider);
  providerDailyUsage[provider].requests += 1;
}

function getProviderSoftLimit(provider) {
  if (provider === 'gemini') return Number.isFinite(GEMINI_DAILY_SOFT_LIMIT_RPD) ? GEMINI_DAILY_SOFT_LIMIT_RPD : 0;
  if (provider === 'groq') return Number.isFinite(GROQ_DAILY_SOFT_LIMIT_RPD) ? GROQ_DAILY_SOFT_LIMIT_RPD : 0;
  if (provider === 'ollama') return Number.isFinite(OLLAMA_DAILY_SOFT_LIMIT_RPD) ? OLLAMA_DAILY_SOFT_LIMIT_RPD : 0;
  return 0;
}

function isNearSoftLimit(provider) {
  if (!LLM_BUDGET_GUARD_ENABLED) return false;

  const softLimit = getProviderSoftLimit(provider);
  if (!softLimit || softLimit <= 0) return false;

  resetDailyUsageIfNeeded(provider);
  const used = providerDailyUsage[provider].requests;
  const threshold = Number.isFinite(LLM_BUDGET_SWITCH_THRESHOLD) ? LLM_BUDGET_SWITCH_THRESHOLD : 0.85;
  return used >= Math.floor(softLimit * threshold);
}

function isQuotaOrRateLimitError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return /(429|rate limit|quota|resource has been exhausted|exceeded|too many requests|limite|l[ií]mite)/.test(msg);
}

function setProviderCooldown(provider, ms) {
  const windowMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  if (!windowMs) return;
  providerCooldownUntil[provider] = Date.now() + windowMs;
}

function isProviderCoolingDown(provider) {
  const until = providerCooldownUntil[provider] || 0;
  if (!until) return false;
  if (Date.now() >= until) {
    providerCooldownUntil[provider] = 0;
    return false;
  }
  return true;
}

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

function canUseLocalModelFallback() {
  if (!OLLAMA_ENABLE_LOCAL_MODEL_FALLBACK) return false;
  if (!DEFAULT_OLLAMA_FALLBACK_MODEL) return false;
  return DEFAULT_OLLAMA_FALLBACK_MODEL !== DEFAULT_OLLAMA_MODEL;
}

async function callOllamaWithModel({ systemPrompt, history, model, providerLabel = 'ollama' }) {
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
        model,
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
    incrementDailyUsage('ollama');
    return { provider: providerLabel, reply, model };
  } catch (err) {
    markOllamaFailure();
    if (isQuotaOrRateLimitError(err)) {
      setProviderCooldown('ollama', LLM_QUOTA_COOLDOWN_MS);
    }
    throw err;
  } finally {
    timeout.clear();
  }
}

async function callOllamaSmart({ systemPrompt, history }) {
  try {
    return await callOllamaWithModel({
      systemPrompt,
      history,
      model: DEFAULT_OLLAMA_MODEL,
      providerLabel: 'ollama',
    });
  } catch (primaryErr) {
    if (!canUseLocalModelFallback()) {
      throw primaryErr;
    }

    console.warn(
      `[Habby] ollama primario fallo, intentando fallback local (${DEFAULT_OLLAMA_FALLBACK_MODEL}):`,
      primaryErr.message,
    );

    try {
      return await callOllamaWithModel({
        systemPrompt,
        history,
        model: DEFAULT_OLLAMA_FALLBACK_MODEL,
        providerLabel: 'ollama-fallback-model',
      });
    } catch (fallbackErr) {
      throw new Error(
        `Ollama primario (${DEFAULT_OLLAMA_MODEL}) fallo: ${primaryErr.message}. `
        + `Fallback local (${DEFAULT_OLLAMA_FALLBACK_MODEL}) fallo: ${fallbackErr.message}`,
      );
    }
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

    incrementDailyUsage('groq');
    return { provider: 'groq', reply };
  } catch (err) {
    if (isQuotaOrRateLimitError(err)) {
      setProviderCooldown('groq', LLM_QUOTA_COOLDOWN_MS);
    }
    throw err;
  } finally {
    timeout.clear();
  }
}

function toGeminiContents(history) {
  return history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

async function callGemini({ systemPrompt, history, apiKey }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada.');

  const timeout = withTimeoutSignal(GEMINI_TIMEOUT_MS);
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeout.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: toGeminiContents(history),
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.4,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const msg = data?.error?.message || `Gemini error ${response.status}`;
      throw new Error(msg);
    }

    const reply = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => String(p?.text || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!reply) throw new Error('Gemini devolvio una respuesta vacia.');

    incrementDailyUsage('gemini');
    return { provider: 'gemini', reply };
  } catch (err) {
    if (isQuotaOrRateLimitError(err)) {
      setProviderCooldown('gemini', LLM_QUOTA_COOLDOWN_MS);
    }
    throw err;
  } finally {
    timeout.clear();
  }
}

function getProviderOrder(primary) {
  if (primary === 'groq') return ['groq', 'gemini', 'ollama'];
  if (primary === 'gemini') return ['gemini', 'groq', 'ollama'];
  return ['ollama', 'gemini', 'groq'];
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
  const allowOllamaFallback = LLM_ENABLE_OLLAMA_FALLBACK;
  const allowGeminiFallback = LLM_ENABLE_GEMINI_FALLBACK;
  const allowGroqFallback = String(process.env.LLM_ENABLE_GROQ_FALLBACK || 'false').toLowerCase() === 'true';
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const providers = getProviderOrder(primary);

  const attempts = [];

  for (const provider of providers) {
    if (isProviderCoolingDown(provider)) {
      attempts.push({ provider, error: 'provider-cooling-down' });
      continue;
    }

    if (isNearSoftLimit(provider)) {
      attempts.push({ provider, error: 'provider-near-soft-limit' });
      continue;
    }

    if (provider === 'ollama' && !allowOllamaFallback && primary !== 'ollama') {
      continue;
    }

    if (provider === 'gemini' && !allowGeminiFallback && primary !== 'gemini') {
      continue;
    }

    if (provider === 'groq' && !allowGroqFallback && primary !== 'groq') {
      continue;
    }

    try {
      if (provider === 'ollama') {
        return await callOllamaSmart({ systemPrompt, history });
      }

      if (provider === 'gemini') {
        return await callGemini({ systemPrompt, history, apiKey: geminiKey });
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
      fallbackModel: DEFAULT_OLLAMA_FALLBACK_MODEL || null,
      localModelFallbackEnabled: canUseLocalModelFallback(),
      timeoutMs: OLLAMA_TIMEOUT_MS,
      consecutiveFailures: ollamaFailures,
      open: isOllamaOpen(),
      cooldownUntil: ollamaDisabledUntil ? new Date(ollamaDisabledUntil).toISOString() : null,
    },
    gemini: {
      enabledAsFallback: LLM_ENABLE_GEMINI_FALLBACK,
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: DEFAULT_GEMINI_MODEL,
      timeoutMs: GEMINI_TIMEOUT_MS,
    },
    fallback: {
      ollamaEnabled: LLM_ENABLE_OLLAMA_FALLBACK,
      geminiEnabled: LLM_ENABLE_GEMINI_FALLBACK,
      groqEnabled: String(process.env.LLM_ENABLE_GROQ_FALLBACK || 'false').toLowerCase() === 'true',
    },
    budgetGuard: {
      enabled: LLM_BUDGET_GUARD_ENABLED,
      switchThreshold: Number.isFinite(LLM_BUDGET_SWITCH_THRESHOLD) ? LLM_BUDGET_SWITCH_THRESHOLD : 0.85,
      quotaCooldownMs: LLM_QUOTA_COOLDOWN_MS,
      limits: {
        geminiDailySoftRpd: GEMINI_DAILY_SOFT_LIMIT_RPD,
        groqDailySoftRpd: GROQ_DAILY_SOFT_LIMIT_RPD,
        ollamaDailySoftRpd: OLLAMA_DAILY_SOFT_LIMIT_RPD,
      },
      usage: {
        dayKey: getDayKey(),
        geminiRequests: providerDailyUsage.gemini.requests,
        groqRequests: providerDailyUsage.groq.requests,
        ollamaRequests: providerDailyUsage.ollama.requests,
      },
      cooldown: {
        geminiUntil: providerCooldownUntil.gemini ? new Date(providerCooldownUntil.gemini).toISOString() : null,
        groqUntil: providerCooldownUntil.groq ? new Date(providerCooldownUntil.groq).toISOString() : null,
        ollamaUntil: providerCooldownUntil.ollama ? new Date(providerCooldownUntil.ollama).toISOString() : null,
      },
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
