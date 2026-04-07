/* ============================================================
   HABBY — Widget de chat inmobiliario para Habita Perú
   Incrustar en WordPress con:
   <script src="https://habby-chatbot.vercel.app/habby.js"></script>
   ============================================================ */
(function () {
  'use strict';

  function trimTrailingSlash(url) {
    return String(url || '').replace(/\/+$/, '');
  }

  function inferApiBaseFromScript() {
    try {
      const scriptTag = document.currentScript || Array.from(document.getElementsByTagName('script'))
        .find((item) => /\/habby\.js$/i.test(new URL(item.src || '', window.location.href).pathname || ''));

      if (!scriptTag || !scriptTag.src) return '';

      const scriptUrl = new URL(scriptTag.src, window.location.href);
      const scriptPath = scriptUrl.pathname.replace(/\/habby\.js$/i, '');
      const prefix = scriptPath.endsWith('/') ? scriptPath.slice(0, -1) : scriptPath;
      return `${scriptUrl.origin}${prefix}/api`;
    } catch {
      return '';
    }
  }

  /* ── Configuración ── */
  const DEFAULT_API_BASE = 'https://habby-chatbot.vercel.app/api';
  const API_BASE     = trimTrailingSlash(window.HABBY_API_BASE || inferApiBaseFromScript() || DEFAULT_API_BASE);
  const API_URL      = `${API_BASE}/chat`;
  const LEADS_URL    = `${API_BASE}/leads`;
  const AVAIL_URL    = `${API_BASE}/availability`;
  const APPT_URL     = `${API_BASE}/appointments`;
  const BOOKING_DAYS = 3;
  const BOOKING_MIN_DAYS = 1;
  const BOOKING_SLOT_MINUTES = 30;
  const BOOKING_MAX_SLOTS = 12;
  const PRIMARY      = '#1E3A8A';
  const PRIMARY_DK   = '#1B2F73';
  const ACCENT       = '#11b965';
  const CARD_FALLBACK_BG = 'linear-gradient(135deg,#1E3A8A 0%,#11b965 100%)';
  const WELCOME      = '¡Hola! 👋 Soy **Habby**, tu asesor inmobiliario de Habita Perú.';
  const PROFILE_COPY = {
    comprador: {
      label: 'Quiero comprar una propiedad',
      userText: 'Quiero comprar una propiedad',
      intro: 'Perfecto. Te ayudaré a encontrar la propiedad ideal con datos reales, fotos y opciones claras. ¿Qué tipo de inmueble buscas, en qué zona y con qué presupuesto?',
      quick: [
        'Casa',
        'Departamento',
        'Terreno',
        'Quiero alquilar un inmueble',
        'Quiero comparar opciones',
        'Quiero agendar una visita',
      ],
    },
    vendedor: {
      label: 'Quiero vender una propiedad',
      userText: 'Quiero vender una propiedad',
      intro: 'Excelente. Te ayudaré a vender mejor y más rápido con soporte comercial, fotos, video, cámaras, drones y difusión. ¿Qué tipo de inmueble deseas vender?',
      quick: [
        'Quiero vender mi terreno',
        'Quiero vender mi departamento',
        '¿Qué beneficios tengo al vender con Habita?',
        'Quiero una llamada de asesor',
      ],
    },
    agente: {
      label: 'Quiero hablar con un asesor / agente de ventas',
      userText: 'Quiero hablar con un asesor / agente de ventas',
      intro: 'Genial. Si eres agente o deseas hablar con un asesor, te explico comisión competitiva, soporte comercial, marketing, cámaras, drones y agenda de citas. ¿Te explico cómo trabajamos?',
      quick: [
        'Tengo un inmueble para captar',
        '¿Qué comisión manejan?',
        '¿Qué apoyo de marketing y publicidad ofrecen?',
        'Quiero coordinar una reunión',
      ],
    },
  };

  /* ── Estado ── */
  let open    = false;
  let loading = false;
  let history = [];
  let profile = null;
  let booking = {
    active: false,
    step: null,
    leadId: null,
    data: {},
  };

  function trackEvent(name, payload = {}) {
    const event = {
      event: 'habby_event',
      event_name: name,
      ...payload,
      ts: Date.now(),
    };

    try {
      if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push(event);
      }
    } catch {}

    try {
      console.info('[Habby][track]', event);
    } catch {}
  }

  function isPropertyIntent(text) {
    return /(propiedad|propiedades|depa|departamento|casa|inmueble|comprar|alquilar|alquiler|venta|vender|distrito|zona|precio|metros|metraje)/i.test(String(text || ''));
  }

  /* ── Inyectar estilos ── */
  const style = document.createElement('style');
  style.textContent = `
#hb-wrap *{box-sizing:border-box;font-family:inherit}
#hb-btn{position:fixed;bottom:24px;right:24px;z-index:999999;width:58px;height:58px;border-radius:50%;background:${PRIMARY};color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(27,79,216,.45);transition:transform .2s,background .2s}
#hb-btn:hover{background:${PRIMARY_DK};transform:scale(1.07)}
#hb-btn:focus-visible,#hb-send:focus-visible,.hb-qr:focus-visible,.hb-card-btn:focus-visible{outline:3px solid rgba(17,185,101,.45);outline-offset:2px}
#hb-badge{position:absolute;top:2px;right:2px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
#hb-box{position:fixed;bottom:96px;right:24px;z-index:999999;width:420px;max-width:calc(100vw - 32px);height:660px;max-height:calc(100vh - 120px);background:#fff;border-radius:20px;box-shadow:0 18px 44px rgba(0,0,0,.16);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.5);opacity:0;transform:translateY(12px) scale(.97);pointer-events:none;transition:opacity .22s,transform .22s}
#hb-box.hb-open{opacity:1;transform:none;pointer-events:all}
#hb-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:linear-gradient(135deg,${PRIMARY} 0%,${ACCENT} 100%);color:#fff;flex-shrink:0}
#hb-av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.26);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0}
.hb-hinfo{flex:1;display:flex;flex-direction:column;line-height:1.3}
.hb-hinfo strong{font-size:14px;font-weight:700}
.hb-status{font-size:11px;opacity:.85;display:flex;align-items:center;gap:4px}
.hb-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block}
#hb-clr,#hb-cls{background:none;border:none;color:rgba(255,255,255,.8);cursor:pointer;padding:4px;border-radius:6px;display:flex;align-items:center;transition:background .15s}
#hb-clr:hover,#hb-cls:hover{background:rgba(255,255,255,.15)}
#hb-msgs{flex:1;overflow-y:auto;padding:16px 14px;background:#f8fafc;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
#hb-msgs::-webkit-scrollbar{width:4px}
#hb-msgs::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:4px}
.hb-msg{display:flex;flex-direction:column;max-width:86%;animation:hbIn .2s ease}
@keyframes hbIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.hb-msg.bot{align-self:flex-start}.hb-msg.usr{align-self:flex-end}
.hb-bbl{padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.58;word-break:break-word;white-space:pre-wrap;box-shadow:0 4px 14px rgba(15,23,42,.04)}
.bot .hb-bbl{background:#fff;color:#111827;border-bottom-left-radius:4px;border:1px solid rgba(15,23,42,.06)}
.usr .hb-bbl{background:linear-gradient(135deg,${PRIMARY} 0%,${ACCENT} 100%);color:#fff;border-bottom-right-radius:4px}
.bot .hb-bbl a{color:${PRIMARY};text-decoration:underline;font-weight:500}
.hb-typing .hb-bbl{padding:12px 16px}
.hb-dots{display:flex;gap:5px;align-items:center;height:12px}
.hb-dots span{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:hbDot 1.2s infinite}
.hb-dots span:nth-child(2){animation-delay:.2s}.hb-dots span:nth-child(3){animation-delay:.4s}
@keyframes hbDot{0%,80%,100%{transform:scale(.7);opacity:.5}40%{transform:scale(1);opacity:1}}
.hb-qrs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.hb-qr{background:#fff;border:1px solid rgba(30,58,138,.25);color:${PRIMARY};border-radius:999px;padding:8px 13px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit}
.hb-qr:hover{background:${PRIMARY};color:#fff;transform:translateY(-1px)}
#hb-inp-area{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid #e5e7eb;background:#fff;flex-shrink:0}
#hb-inp{flex:1;resize:none;border:1px solid #e5e7eb;border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:inherit;color:#111827;background:#fff;outline:none;height:40px;min-height:40px;max-height:40px;overflow-y:auto;line-height:1.45;transition:border-color .15s}
#hb-inp:focus{border-color:${ACCENT};box-shadow:0 0 0 3px rgba(17,185,101,.12)}
#hb-inp::placeholder{color:#9ca3af}
#hb-send{flex-shrink:0;width:38px;height:38px;border-radius:10px;background:${PRIMARY};color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,opacity .15s,transform .1s}
#hb-send:hover:not(:disabled){background:${ACCENT}}
#hb-send:active:not(:disabled){transform:scale(.94)}
#hb-send:disabled{opacity:.35;cursor:default}
#hb-note{text-align:center;font-size:10.5px;color:#9ca3af;margin:0;padding:5px 12px 8px;flex-shrink:0}
.hb-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:8px;align-items:stretch;width:100%}
.hb-card{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:12px;overflow:hidden;box-shadow:0 6px 16px rgba(15,23,42,.06)}
.hb-card-media{aspect-ratio:16/9;min-height:104px;max-height:156px;background:${CARD_FALLBACK_BG};position:relative}
.hb-card-media img{width:100%;height:100%;object-fit:cover;display:block}
.hb-card-body{padding:10px}
.hb-card-title{font-size:12.5px;font-weight:700;color:#111827;line-height:1.35;margin-bottom:4px}
.hb-card-meta{font-size:11.5px;color:#334155;line-height:1.5}
.hb-card-tag{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:rgba(30,58,138,.08);color:${PRIMARY};font-size:10.5px;font-weight:700;margin-bottom:6px}
.hb-card-btn{margin-top:8px;width:100%;border:1px solid rgba(17,185,101,.35);background:#ecfdf5;color:#065f46;font-size:12px;font-weight:700;border-radius:10px;padding:8px 10px;cursor:pointer;transition:all .2s}
.hb-card-btn:hover{background:${ACCENT};color:#fff;border-color:${ACCENT}}
.hb-card-skeleton{display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px}
.hb-sk-item{border-radius:12px;background:#fff;border:1px solid rgba(15,23,42,.06);overflow:hidden}
.hb-sk-media{aspect-ratio:16/9;min-height:96px;background:linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9);background-size:220% 100%;animation:hbSk 1.2s linear infinite}
.hb-sk-line{height:10px;margin:8px 10px;background:linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9);background-size:220% 100%;animation:hbSk 1.2s linear infinite;border-radius:999px}
.hb-sk-line.w70{width:70%}
.hb-sk-line.w45{width:45%}
@keyframes hbSk{0%{background-position:0% 0}100%{background-position:220% 0}}
@media(max-width:420px){#hb-box{right:0;bottom:0;width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0;border:none}#hb-btn{bottom:16px;right:16px}.hb-cards{grid-template-columns:1fr}}
`;
  document.head.appendChild(style);

  /* ── HTML del widget ── */
  const wrap = document.createElement('div');
  wrap.id = 'hb-wrap';
  wrap.innerHTML = `
<button id="hb-btn" aria-label="Abrir chat con Habby" aria-expanded="false">
  <span id="hb-ico-chat"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
  <span id="hb-ico-cls" style="display:none"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
  <span id="hb-badge" style="display:none">1</span>
</button>
<div id="hb-box" role="dialog" aria-label="Chat con Habby" aria-hidden="true">
  <div id="hb-head">
  <div id="hb-av">
  
</div>
    <div class="hb-hinfo"><strong>Habby</strong><span class="hb-status"><span class="hb-dot"></span>Activo ahora</span></div>
    <button id="hb-clr" aria-label="Limpiar chat" title="Limpiar conversación"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
    <button id="hb-cls" aria-label="Cerrar"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>
  <div id="hb-msgs" role="log" aria-live="polite"></div>
  <div id="hb-inp-area">
    <textarea id="hb-inp" placeholder="Escribe tu consulta..." rows="1" maxlength="500"></textarea>
    <button id="hb-send" aria-label="Enviar" disabled><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
  </div>
  <p id="hb-note">Habby puede cometer errores. Verifica información importante.</p>
</div>`;
  document.body.appendChild(wrap);

  /* ── Referencias DOM ── */
  const btn      = document.getElementById('hb-btn');
  const box      = document.getElementById('hb-box');
  const clrBtn   = document.getElementById('hb-clr');
  const clsBtn   = document.getElementById('hb-cls');
  const msgs     = document.getElementById('hb-msgs');
  const inp      = document.getElementById('hb-inp');
  const sendBtn  = document.getElementById('hb-send');
  const badge    = document.getElementById('hb-badge');
  const icoChat  = document.getElementById('hb-ico-chat');
  const icoCls   = document.getElementById('hb-ico-cls');

  /* ── Helpers ── */
  function md(text) {
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/(https?:\/\/[^\s<>"]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g,'<br>');
  }

  function scroll() { requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; }); }

  function renderPropertyCards(items = []) {
    if (!Array.isArray(items) || !items.length) return null;

    const cards = document.createElement('div');
    cards.className = 'hb-cards';

    items.slice(0, 3).forEach((item) => {
      const card = document.createElement('article');
      card.className = 'hb-card';

      const media = document.createElement('div');
      media.className = 'hb-card-media';

      if (item.imageUrl) {
        const img = document.createElement('img');
        img.src = item.imageUrl;
        img.alt = item.imageAlt || item.title || 'Imagen de propiedad';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          img.remove();
        });
        media.appendChild(img);
      }

      const body = document.createElement('div');
      body.className = 'hb-card-body';

      if (item.tag) {
        const tag = document.createElement('span');
        tag.className = 'hb-card-tag';
        tag.textContent = item.tag;
        body.appendChild(tag);
      }

      const title = document.createElement('div');
      title.className = 'hb-card-title';
      title.textContent = item.title || 'Propiedad';

      const meta = document.createElement('div');
      meta.className = 'hb-card-meta';
      meta.innerHTML = `💰 ${item.price || 'Consultar'}<br>📍 ${item.location || 'No especificado'}`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hb-card-btn';
      btn.textContent = 'Ver propiedad';
      btn.addEventListener('click', () => {
        if (item.url) {
          window.open(item.url, '_blank', 'noopener');
          trackEvent('card_click', {
            property_id: item.id,
            property_title: item.title,
            property_url: item.url,
          });
        }
      });

      body.appendChild(title);
      body.appendChild(meta);
      body.appendChild(btn);

      card.appendChild(media);
      card.appendChild(body);
      cards.appendChild(card);
    });

    return cards;
  }

  function addMsg(role, text, withQR = false, options = {}) {
    const w = document.createElement('div');
    w.className = `hb-msg ${role}`;
    const b = document.createElement('div');
    b.className = 'hb-bbl';
    b.innerHTML = md(text);
    w.appendChild(b);

    if (role === 'bot' && Array.isArray(options.propertySuggestions) && options.propertySuggestions.length) {
      const cards = renderPropertyCards(options.propertySuggestions);
      if (cards) w.appendChild(cards);
    }

    if (withQR && role === 'bot') {
      const qrs = document.createElement('div');
      qrs.className = 'hb-qrs';
      const quick = profile ? (PROFILE_COPY[profile]?.quick || []) : [];
      quick.forEach(label => {
        const q = document.createElement('button');
        q.className = 'hb-qr';
        q.textContent = label;
        q.onclick = () => { qrs.remove(); send(label); };
        qrs.appendChild(q);
      });
      w.appendChild(qrs);
    }
    msgs.appendChild(w);
    scroll();
  }

  function addChoices(text, choices) {
    const w = document.createElement('div');
    w.className = 'hb-msg bot';
    const b = document.createElement('div');
    b.className = 'hb-bbl';
    b.innerHTML = md(text);
    w.appendChild(b);

    const qrs = document.createElement('div');
    qrs.className = 'hb-qrs';
    choices.forEach(choice => {
      const q = document.createElement('button');
      q.className = 'hb-qr';
      q.textContent = choice.label;
      q.onclick = () => {
        qrs.remove();
        if (choice.onClick) choice.onClick();
      };
      qrs.appendChild(q);
    });
    w.appendChild(qrs);

    msgs.appendChild(w);
    scroll();
  }

  function isBookingIntent(text) {
    return /(agendar|agenda|cita|visita|reunion)/i.test(text);
  }

  function resetBooking() {
    booking = { active: false, step: null, leadId: null, data: {} };
  }

  function startBookingFlow() {
    booking.active = true;
    booking.step = 'name';
    booking.data = {};
    booking.leadId = null;
    trackEvent('booking_flow_started', { profile: profile || 'unknown' });
    addMsg('bot', 'Perfecto. Te ayudo a agendar una cita. Primero, ¿cuál es tu nombre completo?');
  }

  function setProfile(selectedProfile) {
    if (!PROFILE_COPY[selectedProfile]) return;

    profile = selectedProfile;
    addMsg('usr', PROFILE_COPY[selectedProfile].userText || PROFILE_COPY[selectedProfile].label);
    addMsg('bot', PROFILE_COPY[selectedProfile].intro, true);
    inp.disabled = false;
    inp.focus();
    resize();
  }

  async function createLeadAndOfferSlots() {
    showTyping();
    try {
      const leadRes = await fetch(LEADS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: booking.data.name,
          phone: booking.data.phone,
          email: booking.data.email || null,
          operation: booking.data.operation || null,
          district: booking.data.district || null,
        }),
      });
      const leadData = await leadRes.json();
      if (!leadRes.ok || !leadData?.lead?.id) {
        throw new Error(leadData?.error || 'No se pudo registrar el lead.');
      }

      booking.leadId = leadData.lead.id;

      const params = new URLSearchParams({
        days: String(BOOKING_DAYS),
        min_days: String(BOOKING_MIN_DAYS),
        slot_minutes: String(BOOKING_SLOT_MINUTES),
        limit: String(BOOKING_MAX_SLOTS),
      });
      const availRes = await fetch(`${AVAIL_URL}?${params.toString()}`);
      const availData = await availRes.json();
      if (!availRes.ok) {
        throw new Error(availData?.error || 'No se pudo consultar disponibilidad.');
      }

      const slots = (availData.slots || [])
        .slice()
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
        .slice(0, 6);
      hideTyping();

      if (!slots.length) {
        addMsg('bot', 'Por ahora no tengo horarios libres para los proximos 3 dias desde manana. ¿Deseas que un asesor te contacte con una alternativa?');
        resetBooking();
        return;
      }

      const choices = slots.map(slot => {
        const label = new Date(slot.starts_at).toLocaleString('es-PE', {
          timeZone: 'America/Lima',
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).replace(',', '');

        return {
          label,
          onClick: () => reserveSlot(slot),
        };
      });

      addChoices('Excelente. Elige uno de estos horarios disponibles:', choices);
    } catch (err) {
      hideTyping();
      addMsg('bot', `⚠️ ${String(err.message || err)}`);
      resetBooking();
    }
  }

  async function reserveSlot(slot) {
    showTyping();
    try {
      const res = await fetch(APPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: booking.leadId,
          starts_at: slot.starts_at,
          ends_at: slot.ends_at,
          channel: 'videollamada',
          notes: 'Cita agendada desde widget',
        }),
      });

      const data = await res.json();
      hideTyping();

      if (!res.ok) {
        addMsg('bot', `⚠️ ${data?.error || 'No se pudo agendar la cita.'}`);
        if (res.status === 409) {
          await createLeadAndOfferSlots();
        }
        return;
      }

      addMsg('bot', data.uiMessage || 'Tu cita fue agendada correctamente.');
      trackEvent('booking_confirmed', {
        appointment_id: data?.appointment?.id || null,
        lead_id: booking.leadId,
      });
      if (data.email?.sent) {
        addMsg('bot', 'También envié la confirmación a tu correo.');
      }
      resetBooking();
    } catch {
      hideTyping();
      addMsg('bot', '⚠️ No se pudo agendar por un error de conexión. Intenta de nuevo.');
      resetBooking();
    }
  }

  async function handleBookingStep(text) {
    if (booking.step === 'name') {
      booking.data.name = text.slice(0, 120);
      booking.step = 'phone';
      addMsg('bot', 'Gracias. Ahora compárteme tu número de celular.');
      return true;
    }

    if (booking.step === 'phone') {
      const only = text.replace(/\D/g, '');
      if (only.length < 7) {
        addMsg('bot', 'Necesito un número válido. Intenta nuevamente con tu celular.');
        return true;
      }
      booking.data.phone = text.slice(0, 40);
      booking.step = 'email';
      addMsg('bot', 'Perfecto. ¿Cuál es tu correo? Si no deseas compartirlo, escribe "omitir".');
      return true;
    }

    if (booking.step === 'email') {
      const lower = text.toLowerCase();
      if (lower !== 'omitir' && !/^\S+@\S+\.\S+$/.test(text)) {
        addMsg('bot', 'El correo parece inválido. Escribe uno válido o escribe "omitir".');
        return true;
      }
      booking.data.email = lower === 'omitir' ? null : text.slice(0, 180);
      booking.step = 'operation';
      addChoices('¿Qué tipo de operación estás buscando?', [
        { label: 'Comprar', onClick: () => send('Comprar') },
        { label: 'Alquilar', onClick: () => send('Alquilar') },
        { label: 'Vender', onClick: () => send('Vender') },
      ]);
      return true;
    }

    if (booking.step === 'operation') {
      booking.data.operation = text.slice(0, 40);
      booking.step = 'district';
      addMsg('bot', 'Genial. ¿En qué distrito te interesa la propiedad?');
      return true;
    }

    if (booking.step === 'district') {
      booking.data.district = text.slice(0, 80);
      booking.step = 'submitting';
      await createLeadAndOfferSlots();
      return true;
    }

    return false;
  }

  function showTyping(withCardSkeleton = false) {
    const w = document.createElement('div');
    w.id = 'hb-typing'; w.className = 'hb-msg bot hb-typing';
    const skeleton = withCardSkeleton
      ? '<div class="hb-card-skeleton"><div class="hb-sk-item"><div class="hb-sk-media"></div><div class="hb-sk-line w70"></div><div class="hb-sk-line"></div><div class="hb-sk-line w45"></div></div></div>'
      : '';
    w.innerHTML = `<div class="hb-bbl"><div class="hb-dots"><span></span><span></span><span></span></div>${skeleton}</div>`;
    msgs.appendChild(w); scroll();
  }
  function hideTyping() { const el = document.getElementById('hb-typing'); if (el) el.remove(); }

  function openChat()  {
    open = true;
    box.classList.add('hb-open');
    box.setAttribute('aria-hidden','false');
    btn.setAttribute('aria-expanded','true');
    icoChat.style.display = 'none';
    icoCls.style.display  = 'flex';
    badge.style.display   = 'none';
    inp.focus(); scroll();
  }
  function closeChat() {
    open = false;
    box.classList.remove('hb-open');
    box.setAttribute('aria-hidden','true');
    btn.setAttribute('aria-expanded','false');
    icoChat.style.display = 'flex';
    icoCls.style.display  = 'none';
  }

  function clearChat() {
    history = [];
    profile = null;
    msgs.innerHTML = '';
    inp.disabled = true;
    inp.value = '';
    resize();
    addChoices(`${WELCOME}\n\nSelecciona tu ruta para comenzar:`, [
      { label: PROFILE_COPY.comprador.label, onClick: () => setProfile('comprador') },
      { label: PROFILE_COPY.vendedor.label, onClick: () => setProfile('vendedor') },
      { label: PROFILE_COPY.agente.label, onClick: () => setProfile('agente') },
    ]);
  }

  /* ── Enviar mensaje ── */
  async function send(text) {
    const t = (text || inp.value).trim();
    if (!t || loading) return;

    if (!profile) {
      addChoices('Para ayudarte mejor, primero elige tu perfil:', [
        { label: 'Comprador', onClick: () => setProfile('comprador') },
        { label: 'Vendedor', onClick: () => setProfile('vendedor') },
        { label: 'Agente de venta', onClick: () => setProfile('agente') },
      ]);
      return;
    }

    addMsg('usr', t);
    trackEvent('chat_message_sent', { profile: profile || 'unknown', length: t.length });
    history.push({ role: 'user', content: t });
    inp.value = '';
    resize();
    sendBtn.disabled = true;
    loading = true;

    if (!booking.active && isBookingIntent(t)) {
      loading = false;
      startBookingFlow();
      inp.focus();
      return;
    }

    if (booking.active) {
      const consumed = await handleBookingStep(t);
      loading = false;
      inp.focus();
      if (consumed) return;
    }

    showTyping(isPropertyIntent(t));

    try {
      const r = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: history, profile }),
        
      });
      const d = await r.json();
      hideTyping();

      if (d.reply) {
        history.push({ role: 'assistant', content: d.reply });
        addMsg('bot', d.reply, false, { propertySuggestions: d?.ui?.propertySuggestions || [] });
        if (!open) badge.style.display = 'flex';
      } else {
        addMsg('bot', '⚠️ Tuvimos un inconveniente al procesar tu consulta. Si quieres, lo intentamos de nuevo en unos segundos.');
      }
    } catch {
      hideTyping();
      addMsg('bot', '⚠️ Parece que hubo un problema de conexión. Verifica tu internet y seguimos en segundos.');
    }

    loading = false;
    inp.focus();
  }

  function resize() {
    inp.style.height = '40px';
    sendBtn.disabled = inp.value.trim() === '' || loading;
  }

  /* ── Eventos ── */
  btn.addEventListener('click',  () => open ? closeChat() : openChat());
  clrBtn.addEventListener('click', clearChat);
  clsBtn.addEventListener('click', closeChat);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) closeChat(); });
  msgs.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const anchor = target.closest('a');
    if (!anchor) return;
    const href = String(anchor.getAttribute('href') || '');
    if (/wa\.me|whatsapp/i.test(href)) {
      trackEvent('whatsapp_click', { href });
    }
  });
  inp.addEventListener('input', resize);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) send(); }
  });
  sendBtn.addEventListener('click', () => { if (!sendBtn.disabled) send(); });

  /* ── Inicio ── */
  inp.disabled = true;
  addChoices(`${WELCOME}\n\nSelecciona tu ruta para comenzar:`, [
    { label: PROFILE_COPY.comprador.label, onClick: () => setProfile('comprador') },
    { label: PROFILE_COPY.vendedor.label, onClick: () => setProfile('vendedor') },
    { label: PROFILE_COPY.agente.label, onClick: () => setProfile('agente') },
  ]);
  setTimeout(() => { if (!open) badge.style.display = 'flex'; }, 4000);

})();
