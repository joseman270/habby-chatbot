const { getSupabase, isSupabaseConfigured } = require('./db');

const DEFAULT_DAYS_AHEAD = parseInt(process.env.SLOTS_DAYS_AHEAD || '7', 10);
const DEFAULT_SLOT_MINUTES = parseInt(process.env.SLOT_MINUTES || '30', 10);
const DEFAULT_WORK_START_HOUR = parseInt(process.env.WORK_START_HOUR || '9', 10);
const DEFAULT_WORK_END_HOUR = parseInt(process.env.WORK_END_HOUR || '18', 10);
const DEFAULT_WORK_DAYS = String(process.env.WORK_DAYS || '1,2,3,4,5,6')
  .split(',')
  .map((v) => parseInt(v.trim(), 10))
  .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
const DEFAULT_TZ_OFFSET_MINUTES = parseInt(process.env.LOCAL_TZ_OFFSET_MINUTES || '-300', 10);

function parsePositiveInt(value, fallback) {
  const num = parseInt(String(value || ''), 10);
  return Number.isInteger(num) && num > 0 ? num : fallback;
}

function localDayInfoFromUtc(utcDate, tzOffsetMinutes) {
  const localMs = utcDate.getTime() + (tzOffsetMinutes * 60 * 1000);
  const local = new Date(localMs);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    weekDay: local.getUTCDay(),
  };
}

function localToUtcDate({ year, month, day, hour, minute }, tzOffsetMinutes) {
  const utcMs = Date.UTC(year, month, day, hour, minute) - (tzOffsetMinutes * 60 * 1000);
  return new Date(utcMs);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido.' });
  }

  if (!isSupabaseConfigured()) {
    return res.status(500).json({ error: 'Supabase no configurado en el servidor.' });
  }

  const daysAhead = Math.min(parsePositiveInt(req.query?.days, DEFAULT_DAYS_AHEAD), 30);
  const slotMinutes = parsePositiveInt(req.query?.slot_minutes, DEFAULT_SLOT_MINUTES);
  const tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES;

  const nowUtc = new Date();
  const windowEndUtc = new Date(nowUtc.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  try {
    const supabase = getSupabase();

    const { data: booked, error } = await supabase
      .from('appointments')
      .select('starts_at, ends_at, status')
      .in('status', ['pending', 'confirmed'])
      .lt('starts_at', windowEndUtc.toISOString())
      .gt('ends_at', nowUtc.toISOString());

    if (error) {
      console.error('[Habby] availability query error:', error);
      return res.status(502).json({ error: 'No se pudo consultar disponibilidad.' });
    }

    const occupied = (booked || []).map((b) => ({
      start: new Date(b.starts_at),
      end: new Date(b.ends_at),
    }));

    const slots = [];

    for (let offset = 0; offset < daysAhead; offset += 1) {
      const dayBaseUtc = new Date(nowUtc.getTime() + offset * 24 * 60 * 60 * 1000);
      const info = localDayInfoFromUtc(dayBaseUtc, tzOffsetMinutes);

      if (!DEFAULT_WORK_DAYS.includes(info.weekDay)) {
        continue;
      }

      for (let hour = DEFAULT_WORK_START_HOUR; hour < DEFAULT_WORK_END_HOUR; hour += 1) {
        for (let minute = 0; minute < 60; minute += slotMinutes) {
          const startUtc = localToUtcDate({
            year: info.year,
            month: info.month,
            day: info.day,
            hour,
            minute,
          }, tzOffsetMinutes);
          const endUtc = new Date(startUtc.getTime() + slotMinutes * 60 * 1000);

          if (startUtc <= nowUtc) continue;
          if (endUtc > windowEndUtc) continue;

          const taken = occupied.some((o) => overlaps(startUtc, endUtc, o.start, o.end));
          if (taken) continue;

          slots.push({
            starts_at: startUtc.toISOString(),
            ends_at: endUtc.toISOString(),
            slot_minutes: slotMinutes,
          });
        }
      }
    }

    return res.json({
      ok: true,
      timezoneOffsetMinutes: tzOffsetMinutes,
      window: {
        from: nowUtc.toISOString(),
        to: windowEndUtc.toISOString(),
      },
      config: {
        daysAhead,
        slotMinutes,
        workStartHour: DEFAULT_WORK_START_HOUR,
        workEndHour: DEFAULT_WORK_END_HOUR,
        workDays: DEFAULT_WORK_DAYS,
      },
      count: slots.length,
      slots,
    });
  } catch (err) {
    console.error('[Habby] availability endpoint error:', err);
    return res.status(500).json({ error: 'Error interno consultando disponibilidad.' });
  }
};
