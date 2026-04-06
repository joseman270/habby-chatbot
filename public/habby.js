/* ============================================================
   HABBY — Widget de chat inmobiliario para Habita Perú
   Incrustar en WordPress con:
   <script src="https://habby-chatbot.vercel.app/habby.js"></script>
   ============================================================ */
(function () {
  'use strict';

  /* ── Configuración ── */
  const API_URL      = 'https://habby-chatbot.vercel.app/api/chat';
  const API_BASE     = API_URL.replace(/\/chat$/, '');
  const LEADS_URL    = `${API_BASE}/leads`;
  const AVAIL_URL    = `${API_BASE}/availability`;
  const APPT_URL     = `${API_BASE}/appointments`;
  const BOOKING_DAYS = 3;
  const BOOKING_MIN_DAYS = 1;
  const BOOKING_SLOT_MINUTES = 30;
  const BOOKING_MAX_SLOTS = 12;
  const PRIMARY      = '#1B4FD8';
  const PRIMARY_DK   = '#1540B8';
  const WELCOME      = '¡Hola! 👋 Soy **Habby**, tu asesor inmobiliario de Habita Perú.';
  const PROFILE_COPY = {
    comprador: {
      label: 'Comprador',
      intro: 'Perfecto. Te ayudaré a encontrar el inmueble ideal con datos reales de nuestro catálogo. ¿Qué estás buscando?',
      quick: [
        'Busco depa para comprar',
        'Quiero alquilar un inmueble',
        '¿Qué propiedades tienen en mi zona?',
        'Quiero agendar una cita',
      ],
    },
    vendedor: {
      label: 'Vendedor',
      intro: 'Excelente. Te cuento cómo Habita puede ayudarte a vender mejor y más rápido con apoyo comercial y marketing profesional. ¿Qué tipo de inmueble deseas vender?',
      quick: [
        'Quiero vender mi departamento',
        '¿Qué beneficios tengo con Habita?',
        '¿Cómo promocionan mi inmueble?',
        'Quiero una llamada de asesor',
      ],
    },
    agente: {
      label: 'Agente de venta',
      intro: 'Genial. Si tienes un contacto para vender, podemos colaborar con comisiones competitivas y soporte integral de marketing, contenido audiovisual y citas. ¿Te explico cómo trabajamos?',
      quick: [
        'Tengo un inmueble para captar',
        'Quiero trabajar con baja comisión',
        '¿Qué apoyo de marketing ofrecen?',
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

  /* ── Inyectar estilos ── */
  const style = document.createElement('style');
  style.textContent = `
#hb-wrap *{box-sizing:border-box;font-family:inherit}
#hb-btn{position:fixed;bottom:24px;right:24px;z-index:999999;width:58px;height:58px;border-radius:50%;background:${PRIMARY};color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(27,79,216,.45);transition:transform .2s,background .2s}
#hb-btn:hover{background:${PRIMARY_DK};transform:scale(1.07)}
#hb-badge{position:absolute;top:2px;right:2px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
#hb-box{position:fixed;bottom:96px;right:24px;z-index:999999;width:400px;max-width:calc(100vw - 32px);height:620px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.15);display:flex;flex-direction:column;overflow:hidden;border:1px solid #e5e7eb;opacity:0;transform:translateY(12px) scale(.97);pointer-events:none;transition:opacity .22s,transform .22s}
#hb-box.hb-open{opacity:1;transform:none;pointer-events:all}
#hb-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:${PRIMARY};color:#fff;flex-shrink:0}
#hb-av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0}
.hb-hinfo{flex:1;display:flex;flex-direction:column;line-height:1.3}
.hb-hinfo strong{font-size:14px;font-weight:600}
.hb-status{font-size:11px;opacity:.85;display:flex;align-items:center;gap:4px}
.hb-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block}
#hb-clr,#hb-cls{background:none;border:none;color:rgba(255,255,255,.8);cursor:pointer;padding:4px;border-radius:6px;display:flex;align-items:center;transition:background .15s}
#hb-clr:hover,#hb-cls:hover{background:rgba(255,255,255,.15)}
#hb-msgs{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
#hb-msgs::-webkit-scrollbar{width:4px}
#hb-msgs::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:4px}
.hb-msg{display:flex;flex-direction:column;max-width:86%;animation:hbIn .2s ease}
@keyframes hbIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.hb-msg.bot{align-self:flex-start}.hb-msg.usr{align-self:flex-end}
.hb-bbl{padding:9px 13px;border-radius:12px;font-size:13.5px;line-height:1.55;word-break:break-word;white-space:pre-wrap}
.bot .hb-bbl{background:#f3f4f6;color:#111827;border-bottom-left-radius:3px}
.usr .hb-bbl{background:${PRIMARY};color:#fff;border-bottom-right-radius:3px}
.bot .hb-bbl a{color:${PRIMARY};text-decoration:underline;font-weight:500}
.hb-typing .hb-bbl{padding:12px 16px}
.hb-dots{display:flex;gap:5px;align-items:center;height:12px}
.hb-dots span{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:hbDot 1.2s infinite}
.hb-dots span:nth-child(2){animation-delay:.2s}.hb-dots span:nth-child(3){animation-delay:.4s}
@keyframes hbDot{0%,80%,100%{transform:scale(.7);opacity:.5}40%{transform:scale(1);opacity:1}}
.hb-qrs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.hb-qr{background:#fff;border:1px solid ${PRIMARY};color:${PRIMARY};border-radius:20px;padding:5px 12px;font-size:12px;cursor:pointer;transition:background .15s,color .15s;font-family:inherit}
.hb-qr:hover{background:${PRIMARY};color:#fff}
#hb-inp-area{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid #e5e7eb;background:#fff;flex-shrink:0}
#hb-inp{flex:1;resize:none;border:1px solid #e5e7eb;border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:inherit;color:#111827;background:#fff;outline:none;height:40px;min-height:40px;max-height:40px;overflow-y:auto;line-height:1.45;transition:border-color .15s}
#hb-inp:focus{border-color:${PRIMARY};box-shadow:0 0 0 3px rgba(27,79,216,.12)}
#hb-inp::placeholder{color:#9ca3af}
#hb-send{flex-shrink:0;width:38px;height:38px;border-radius:10px;background:${PRIMARY};color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,opacity .15s,transform .1s}
#hb-send:hover:not(:disabled){background:${PRIMARY_DK}}
#hb-send:active:not(:disabled){transform:scale(.94)}
#hb-send:disabled{opacity:.35;cursor:default}
#hb-note{text-align:center;font-size:10.5px;color:#9ca3af;margin:0;padding:5px 12px 8px;flex-shrink:0}
@media(max-width:420px){#hb-box{right:0;bottom:0;width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0;border:none}#hb-btn{bottom:16px;right:16px}}
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

  function addMsg(role, text, withQR = false) {
    const w = document.createElement('div');
    w.className = `hb-msg ${role}`;
    const b = document.createElement('div');
    b.className = 'hb-bbl';
    b.innerHTML = md(text);
    w.appendChild(b);

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
    addMsg('bot', 'Perfecto. Te ayudo a agendar una cita. Primero, ¿cuál es tu nombre completo?');
  }

  function setProfile(selectedProfile) {
    if (!PROFILE_COPY[selectedProfile]) return;

    profile = selectedProfile;
    addMsg('usr', `Soy ${PROFILE_COPY[selectedProfile].label}.`);
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

  function showTyping() {
    const w = document.createElement('div');
    w.id = 'hb-typing'; w.className = 'hb-msg bot hb-typing';
    w.innerHTML = '<div class="hb-bbl"><div class="hb-dots"><span></span><span></span><span></span></div></div>';
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
    addChoices(`${WELCOME}\n\nSelecciona tu perfil para comenzar:`, [
      { label: 'Comprador', onClick: () => setProfile('comprador') },
      { label: 'Vendedor', onClick: () => setProfile('vendedor') },
      { label: 'Agente de venta', onClick: () => setProfile('agente') },
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

    showTyping();

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
        addMsg('bot', d.reply);
        if (!open) badge.style.display = 'flex';
      } else {
        addMsg('bot', '⚠️ ' + (d.error || 'Ocurrió un error. Intenta de nuevo.'));
      }
    } catch {
      hideTyping();
      addMsg('bot', '⚠️ Sin conexión. Verifica tu internet e intenta de nuevo.');
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
  inp.addEventListener('input', resize);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) send(); }
  });
  sendBtn.addEventListener('click', () => { if (!sendBtn.disabled) send(); });

  /* ── Inicio ── */
  inp.disabled = true;
  addChoices(`${WELCOME}\n\nSelecciona tu perfil para comenzar:`, [
    { label: 'Comprador', onClick: () => setProfile('comprador') },
    { label: 'Vendedor', onClick: () => setProfile('vendedor') },
    { label: 'Agente de venta', onClick: () => setProfile('agente') },
  ]);
  setTimeout(() => { if (!open) badge.style.display = 'flex'; }, 4000);

})();
