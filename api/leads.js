const { getSupabase, isSupabaseConfigured } = require('./db');

function normalizeText(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.json({
      ok: true,
      endpoint: 'POST /api/leads',
      configured: isSupabaseConfigured(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido.' });
  }

  if (!isSupabaseConfigured()) {
    return res.status(500).json({ error: 'Supabase no configurado en el servidor.' });
  }

  const {
    name,
    email,
    phone,
    operation,
    district,
    budget_min,
    budget_max,
    notes,
  } = req.body || {};

  const clean = {
    name: normalizeText(name, 120),
    email: normalizeText(email, 180).toLowerCase(),
    phone: normalizeText(phone, 40),
    operation: normalizeText(operation, 40).toLowerCase(),
    district: normalizeText(district, 80),
    budget_min: Number.isFinite(Number(budget_min)) ? Number(budget_min) : null,
    budget_max: Number.isFinite(Number(budget_max)) ? Number(budget_max) : null,
    notes: normalizeText(notes, 500),
  };

  if (!clean.name || !clean.phone) {
    return res.status(400).json({ error: 'name y phone son obligatorios.' });
  }

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('leads')
      .insert({
        name: clean.name,
        email: clean.email || null,
        phone: clean.phone,
        operation: clean.operation || null,
        district: clean.district || null,
        budget_min: clean.budget_min,
        budget_max: clean.budget_max,
        notes: clean.notes || null,
        status: 'new',
      })
      .select('id, name, email, phone, operation, district, status, created_at')
      .single();

    if (error) {
      console.error('[Habby] leads insert error:', error);
      return res.status(502).json({ error: 'No se pudo registrar el lead.' });
    }

    return res.status(201).json({
      lead: data,
      uiMessage: 'Gracias. Tus datos fueron registrados correctamente.',
    });
  } catch (err) {
    console.error('[Habby] leads endpoint error:', err);
    return res.status(500).json({ error: 'Error interno registrando lead.' });
  }
};
