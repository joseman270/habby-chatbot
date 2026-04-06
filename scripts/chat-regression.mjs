#!/usr/bin/env node

const args = process.argv.slice(2);
const baseArgIndex = args.findIndex((a) => a === '--base');
const base = baseArgIndex >= 0 && args[baseArgIndex + 1]
  ? args[baseArgIndex + 1].replace(/\/$/, '')
  : (args[0] && !args[0].startsWith('--')
      ? args[0].replace(/\/$/, '')
      : 'http://localhost:3000');

const tests = [
  {
    name: 'Compra en distrito',
    profile: 'comprador',
    message: 'busco departamento en miraflores para comprar',
    mustIncludeAny: ['catalogo', 'propiedad', 'opciones'],
  },
  {
    name: 'Agenda de visita',
    profile: 'comprador',
    message: 'quiero agendar una visita',
    mustIncludeAny: ['cita', 'datos', 'disponibilidad'],
  },
  {
    name: 'Flujo vendedor',
    profile: 'vendedor',
    message: 'soy vendedor y quiero vender mi casa',
    mustIncludeAny: ['vender', 'inmueble', 'valuacion', 'valoracion'],
  },
  {
    name: 'Flujo agente',
    profile: 'agente',
    message: 'soy agente y quiero colaborar con comisiones',
    mustIncludeAny: ['colaborar', 'comercializacion', 'comision', 'asesor'],
  },
  {
    name: 'Consulta abierta',
    profile: 'comprador',
    message: 'tengo dudas y necesito orientacion para decidir mejor',
    mustIncludeAny: ['habby', 'orientacion', 'ayudarte', 'ayudarte a'],
  },
];

function includesAny(text, terms) {
  const t = String(text || '').toLowerCase();
  return terms.some((term) => t.includes(String(term).toLowerCase()));
}

async function postChat({ profile, message }) {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      profile,
    }),
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { parseError: true, raw: text };
  }

  return { ok: res.ok, status: res.status, data, raw: text };
}

async function getStatus() {
  const res = await fetch(`${base}/api/chat`, { method: 'GET' });
  const text = await res.text();
  const data = JSON.parse(text);
  return { ok: res.ok, status: res.status, data };
}

(async () => {
  console.log(`Chat regression base: ${base}`);
  let failed = 0;

  try {
    const st = await getStatus();
    if (!st.ok || !st.data?.ok) {
      failed += 1;
      console.log(`FAIL status /api/chat -> ${st.status}`);
    } else {
      console.log(`OK   status /api/chat -> ${st.status} | primary=${st.data?.llm?.primary || 'unknown'}`);
    }
  } catch (err) {
    failed += 1;
    console.log(`FAIL status /api/chat -> ERROR ${err.message}`);
  }

  for (const test of tests) {
    try {
      const r = await postChat(test);
      const provider = r.data?.provider || 'unknown';
      const reply = String(r.data?.reply || '');

      let caseFailed = false;

      if (!r.ok) caseFailed = true;
      if (!reply || reply.trim().length < 20) caseFailed = true;
      if (provider === 'safe-mode') caseFailed = true;
      if (!includesAny(reply, test.mustIncludeAny)) caseFailed = true;

      if (caseFailed) {
        failed += 1;
        console.log(`FAIL ${test.name} -> HTTP ${r.status} | provider=${provider}`);
        console.log(`     reply=${reply.slice(0, 180) || r.raw.slice(0, 180)}`);
      } else {
        console.log(`OK   ${test.name} -> HTTP ${r.status} | provider=${provider}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`FAIL ${test.name} -> ERROR ${err.message}`);
    }
  }

  if (failed > 0) {
    console.log(`\nResultado: ${failed} prueba(s) con falla.`);
    process.exit(1);
  }

  console.log('\nResultado: chat OK para entrega.');
})();
