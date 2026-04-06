const { getLlmStatus } = require('./llm');
const { getPropertiesCacheMeta } = require('./properties');
const { getSupabase, isSupabaseConfigured } = require('./db');
const { applyCors } = require('./http');

async function checkSupabase() {
  if (!isSupabaseConfigured()) {
    return { configured: false, ok: false, error: 'Supabase no configurado' };
  }

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('appointments')
      .select('id', { head: true, count: 'exact' })
      .limit(1);

    if (error) {
      return { configured: true, ok: false, error: error.message };
    }

    return { configured: true, ok: true, error: null };
  } catch (err) {
    return { configured: true, ok: false, error: String(err.message || err) };
  }
}

module.exports = async (req, res) => {
  const corsAllowed = applyCors(req, res, 'GET, OPTIONS');
  if (!corsAllowed) {
    return res.status(403).json({ error: 'Origen no permitido por CORS.' });
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido.' });
  }

  const startedAt = Date.now();
  const supabase = await checkSupabase();
  const memory = process.memoryUsage();
  const elapsedMs = Date.now() - startedAt;

  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'habby-chatbot',
    env: process.env.NODE_ENV || 'development',
    uptimeSec: Math.round(process.uptime()),
    responseTimeMs: elapsedMs,
    runtime: {
      node: process.version,
      platform: process.platform,
      pid: process.pid,
    },
    memory: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
    },
    llm: getLlmStatus(),
    properties: getPropertiesCacheMeta(),
    dependencies: {
      supabase,
    },
  });
};
