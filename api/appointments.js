const { getSupabase, isSupabaseConfigured } = require('./db');
const { isMailConfigured, sendAppointmentConfirmation } = require('./mailer');

function normalizeText(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

async function logEmailEvent(supabase, payload) {
  try {
    await supabase.from('email_logs').insert(payload);
  } catch (err) {
    // No bloquea flujo principal si no existe tabla o falla log.
    console.warn('[Habby] email_logs warning:', err.message);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.json({
      ok: true,
      endpoint: 'POST /api/appointments',
      configured: isSupabaseConfigured(),
      emailConfigured: isMailConfigured(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido.' });
  }

  if (!isSupabaseConfigured()) {
    return res.status(500).json({ error: 'Supabase no configurado en el servidor.' });
  }

  const {
    lead_id,
    starts_at,
    ends_at,
    channel,
    notes,
  } = req.body || {};

  const clean = {
    lead_id: Number.isFinite(Number(lead_id)) ? Number(lead_id) : null,
    starts_at: normalizeText(starts_at, 80),
    ends_at: normalizeText(ends_at, 80),
    channel: normalizeText(channel || 'videollamada', 40).toLowerCase(),
    notes: normalizeText(notes, 500),
  };

  if (!clean.lead_id || !clean.starts_at || !clean.ends_at) {
    return res.status(400).json({ error: 'lead_id, starts_at y ends_at son obligatorios.' });
  }

  const startsAtDate = new Date(clean.starts_at);
  const endsAtDate = new Date(clean.ends_at);
  if (Number.isNaN(startsAtDate.getTime()) || Number.isNaN(endsAtDate.getTime())) {
    return res.status(400).json({ error: 'Formato de fecha invalido. Usa ISO-8601.' });
  }
  if (endsAtDate <= startsAtDate) {
    return res.status(400).json({ error: 'ends_at debe ser mayor que starts_at.' });
  }

  try {
    const supabase = getSupabase();

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, name, email, phone')
      .eq('id', clean.lead_id)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ error: 'Lead no encontrado.' });
    }

    const { data: conflicts, error: conflictsError } = await supabase
      .from('appointments')
      .select('id')
      .lt('starts_at', clean.ends_at)
      .gt('ends_at', clean.starts_at)
      .in('status', ['pending', 'confirmed'])
      .limit(1);

    if (conflictsError) {
      console.error('[Habby] appointments conflict check error:', conflictsError);
      return res.status(502).json({ error: 'No se pudo validar disponibilidad.' });
    }

    if (conflicts && conflicts.length > 0) {
      return res.status(409).json({ error: 'Ese horario ya no esta disponible.' });
    }

    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .insert({
        lead_id: clean.lead_id,
        starts_at: clean.starts_at,
        ends_at: clean.ends_at,
        channel: clean.channel,
        notes: clean.notes || null,
        status: 'confirmed',
      })
      .select('id, lead_id, starts_at, ends_at, channel, status, created_at')
      .single();

    if (apptError) {
      console.error('[Habby] appointments insert error:', apptError);
      return res.status(502).json({ error: 'No se pudo crear la cita.' });
    }

    let email = { sent: false, skipped: true, reason: 'email-no-configurado' };

    if (lead.email && isMailConfigured()) {
      try {
        const mailInfo = await sendAppointmentConfirmation({
          to: lead.email,
          leadName: lead.name,
          startsAt: appointment.starts_at,
          channel: appointment.channel,
        });

        email = { sent: true, skipped: false, messageId: mailInfo.messageId };
        await logEmailEvent(supabase, {
          lead_id: lead.id,
          appointment_id: appointment.id,
          type: 'appointment_confirmation',
          recipient: lead.email,
          provider_message_id: mailInfo.messageId,
          status: 'sent',
        });
      } catch (mailErr) {
        email = { sent: false, skipped: false, reason: 'email-send-error' };
        await logEmailEvent(supabase, {
          lead_id: lead.id,
          appointment_id: appointment.id,
          type: 'appointment_confirmation',
          recipient: lead.email,
          provider_message_id: null,
          status: 'failed',
          error: String(mailErr.message || mailErr).slice(0, 400),
        });
      }
    }

    const uiDate = new Date(appointment.starts_at).toLocaleString('es-PE', { timeZone: 'America/Lima' });

    return res.status(201).json({
      appointment,
      email,
      uiMessage: `Tu cita quedo agendada para ${uiDate} (Lima) por ${appointment.channel}.`,
    });
  } catch (err) {
    console.error('[Habby] appointments endpoint error:', err);
    return res.status(500).json({ error: 'Error interno creando cita.' });
  }
};
