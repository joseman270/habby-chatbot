const { getSupabase, isSupabaseConfigured } = require('./db');
const { isMailConfigured, sendAppointmentConfirmation } = require('./mailer');
const { applyCors } = require('./http');
const { createRateLimiter } = require('./rate-limit');

const checkAppointmentsReadRateLimit = createRateLimiter({ windowMs: 60_000, max: 120 });
const checkAppointmentsWriteRateLimit = createRateLimiter({ windowMs: 60_000, max: 30 });
const APPOINTMENT_MIN_LEAD_HOURS = Number.parseInt(process.env.APPOINTMENT_MIN_LEAD_HOURS || '12', 10);

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
  const corsAllowed = applyCors(req, res, 'GET, POST, DELETE, OPTIONS');
  if (!corsAllowed) {
    return res.status(403).json({ error: 'Origen no permitido por CORS.' });
  }

  if (req.method === 'OPTIONS') return res.status(200).end();

  const readRate = checkAppointmentsReadRateLimit(req);
  const writeRate = checkAppointmentsWriteRateLimit(req);

  if (req.method === 'GET') {
    res.setHeader('X-RateLimit-Remaining', String(readRate.remaining));
    res.setHeader('X-RateLimit-Reset', String(readRate.resetAt));
    if (!readRate.allowed) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta nuevamente en un momento.' });
    }
  }

  if (req.method === 'POST' || req.method === 'DELETE') {
    res.setHeader('X-RateLimit-Remaining', String(writeRate.remaining));
    res.setHeader('X-RateLimit-Reset', String(writeRate.resetAt));
    if (!writeRate.allowed) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta nuevamente en un momento.' });
    }
  }

  if (req.method === 'GET') {
    const wantsList = String(req.query?.view || '').toLowerCase() === 'list';

    if (wantsList && isSupabaseConfigured()) {
      const parsedLimit = Number.parseInt(String(req.query?.limit || '50'), 10);
      const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;
      const statusFilter = normalizeText(req.query?.status || '', 20).toLowerCase();

      try {
        const supabase = getSupabase();
        let query = supabase
          .from('appointments')
          .select('id, lead_id, starts_at, ends_at, channel, status, notes, created_at, leads(id, name, email, phone, operation, district)')
          .order('starts_at', { ascending: false })
          .limit(limit);

        if (statusFilter) {
          query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (error) {
          console.error('[Habby] appointments list error:', error);
          return res.status(502).json({ error: 'No se pudo listar citas.' });
        }

        const appointments = (data || []).map((item) => ({
          id: item.id,
          lead_id: item.lead_id,
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          channel: item.channel,
          status: item.status,
          notes: item.notes,
          created_at: item.created_at,
          lead: item.leads || null,
        }));

        return res.json({
          ok: true,
          endpoint: 'GET /api/appointments?view=list',
          configured: true,
          count: appointments.length,
          appointments,
        });
      } catch (err) {
        console.error('[Habby] appointments list endpoint error:', err);
        return res.status(500).json({ error: 'Error interno listando citas.' });
      }
    }

    return res.json({
      ok: true,
      endpoint: 'POST /api/appointments',
      configured: isSupabaseConfigured(),
      emailConfigured: isMailConfigured(),
    });
  }

  if (req.method !== 'POST') {
    if (req.method !== 'DELETE') {
      return res.status(405).json({ error: 'Metodo no permitido.' });
    }
  }

  if (!isSupabaseConfigured()) {
    return res.status(500).json({ error: 'Supabase no configurado en el servidor.' });
  }

  if (req.method === 'DELETE') {
    const idFromQuery = req.query?.id;
    const idFromBody = req.body?.id;
    const appointmentId = Number.parseInt(String(idFromQuery || idFromBody || ''), 10);

    if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
      return res.status(400).json({ error: 'Debes enviar un id de cita valido.' });
    }

    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointmentId)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('[Habby] appointments delete error:', error);
        return res.status(502).json({ error: 'No se pudo borrar la cita.' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Cita no encontrada.' });
      }

      return res.json({
        ok: true,
        deletedId: data.id,
        uiMessage: `La cita #${data.id} fue eliminada correctamente.`,
      });
    } catch (err) {
      console.error('[Habby] appointments delete endpoint error:', err);
      return res.status(500).json({ error: 'Error interno borrando cita.' });
    }
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

  if (Number.isFinite(APPOINTMENT_MIN_LEAD_HOURS) && APPOINTMENT_MIN_LEAD_HOURS > 0) {
    const minStart = new Date(Date.now() + APPOINTMENT_MIN_LEAD_HOURS * 60 * 60 * 1000);
    if (startsAtDate < minStart) {
      return res.status(400).json({
        error: `La cita debe programarse con al menos ${APPOINTMENT_MIN_LEAD_HOURS} horas de anticipacion.`,
      });
    }
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
