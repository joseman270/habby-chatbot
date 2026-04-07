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
    expectStructured: true,
    expectCards: true,
  },
  {
    name: 'Agenda de visita',
    profile: 'comprador',
    message: 'quiero agendar una visita',
    mustIncludeAny: ['cita', 'nombre completo', 'celular', 'distrito'],
    expectStructured: true,
  },
  {
    name: 'Flujo vendedor',
    profile: 'vendedor',
    message: 'soy vendedor y quiero vender mi casa',
    mustIncludeAny: ['vender', 'inmueble', 'marketing', 'drones', 'camaras'],
    mustNotIncludeAny: ['ficha encontrada en habita.pe', 'catalogo de habita pueden encajar', 'en habita.pe encontre varias propiedades'],
    expectStructured: true,
  },
  {
    name: 'Vendedor no cruza a compra',
    profile: 'vendedor',
    message: 'terreno san sebastian y es de 300m2',
    mustIncludeAny: ['valuacion', 'venta', 'inmueble', 'asesor'],
    mustNotIncludeAny: ['ficha encontrada en habita.pe', 'en habita.pe encontre varias propiedades'],
    expectStructured: true,
  },
  {
    name: 'Flujo agente',
    profile: 'agente',
    message: 'soy agente y quiero colaborar con comisiones',
    mustIncludeAny: ['comision', 'marketing', 'drones', 'camaras', 'asesor'],
    mustNotIncludeAny: ['ficha encontrada en habita.pe', 'catalogo de habita pueden encajar', 'en habita.pe encontre varias propiedades'],
    expectStructured: true,
  },
  {
    name: 'Consulta abierta',
    profile: 'comprador',
    message: 'tengo dudas y necesito orientacion para decidir mejor',
    expectStructured: true,
  },
  {
    name: 'Venta de terreno factible',
    profile: 'vendedor',
    message: 'hoy en dia es factible vender mi terreno en san sebastian?',
    mustIncludeAny: ['terreno', 'san sebastian', 'factible', 'acceso', 'document'],
    expectStructured: true,
  },
  {
    name: 'Analítica ventas por año Cusco',
    profile: 'vendedor',
    message: 'en que año se vendieron mas casas en cusco?',
    mustIncludeAny: ['ano', 'año', 'cusco', 'resultado real', 'publicaciones'],
    mustNotIncludeAny: [
      'vender con habita te da mas alcance y mejor presentacion',
      'para responder exactamente que año se vendieron más propiedades se requiere histórico de cierres',
    ],
    expectYearValue: true,
    expectStructured: true,
  },
];

const dialogueTests = [
  {
    name: 'Seguimiento vendedor sin repetir',
    profile: 'vendedor',
    steps: [
      'quiero vender mi terreno en san sebastian',
      'si porfa',
    ],
    secondMustIncludeAny: ['metraje', 'document', 'acceso', 'cargas', 'valuacion'],
  },
  {
    name: 'Seguimiento agente sin repetir',
    profile: 'agente',
    steps: [
      'soy agente y quiero saber comision y beneficios con Habita',
      'si porfa',
    ],
    secondMustIncludeAny: ['caso', 'tipo de inmueble', 'zona', 'marketing', 'drones', 'comision'],
  },
];

function normalizeForSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function includesAny(text, terms) {
  const t = String(text || '').toLowerCase();
  return terms.some((term) => t.includes(String(term).toLowerCase()));
}

function hasUrl(text) {
  return /(https?:\/\/|www\.)/i.test(String(text || ''));
}

function hasStructuredFormat(text) {
  const value = String(text || '');
  const hasBullet = /(^|\n)•\s+/m.test(value);
  const hasQuestion = /\?\s*$/.test(value.trim());
  return hasBullet && hasQuestion;
}

function hasYearValue(text) {
  return /\b(19|20)\d{2}\b/.test(String(text || ''));
}

async function fetchProperties() {
  const res = await fetch(`${base}/api/properties`, { method: 'GET' });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET /api/properties -> ${res.status}`);
  }

  const data = JSON.parse(text);
  return Array.isArray(data?.properties) ? data.properties : [];
}

async function buildDetailPropertyTest() {
  const fallback = {
    name: 'Detalle propiedad puntual',
    profile: 'comprador',
    message: 'del terreno de san blas dime precio, metros y titulos',
    mustIncludeAny: ['precio', 'area', 'metros', 'm2', 'm²', 'no especificado'],
    requiresUrl: true,
    allowsDisambiguation: true,
    expectStructured: true,
    expectCards: true,
  };

  try {
    const properties = await fetchProperties();
    if (!properties.length) return fallback;

    const preferred = properties.find((p) => normalizeForSearch(p.title).includes('san blas'))
      || properties.find((p) => normalizeForSearch(p.type).includes('terreno'))
      || properties[0];

    const cleanedTitle = String(preferred.title || 'esta propiedad').replace(/[^\w\s\u00C0-\u024F-]/g, '').trim();
    const titleTokens = normalizeForSearch(cleanedTitle)
      .split(/\s+/)
      .filter((token) => token.length >= 4)
      .slice(0, 2);

    return {
      name: 'Detalle propiedad puntual',
      profile: 'comprador',
      message: `del inmueble ${cleanedTitle} dime precio, metros y titulos`,
      mustIncludeAny: ['precio', 'area', 'metros', 'm2', 'm²', 'no especificado'],
      shouldMentionAny: titleTokens,
      requiresUrl: true,
      allowsDisambiguation: true,
      expectStructured: true,
      expectCards: true,
    };
  } catch {
    return fallback;
  }
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

async function postChatMessages({ profile, messages }) {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
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

  const detailTest = await buildDetailPropertyTest();
  const allTests = [...tests, detailTest];

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

  for (const test of allTests) {
    try {
      const r = await postChat({ profile: test.profile, message: test.message });
      const provider = r.data?.provider || 'unknown';
      const reply = String(r.data?.reply || '');
      const replyNormalized = normalizeForSearch(reply);

      let caseFailed = false;

      if (!r.ok) caseFailed = true;
      if (!reply || reply.trim().length < 20) caseFailed = true;
      if (provider === 'safe-mode') caseFailed = true;
      if (test.mustIncludeAny && !includesAny(reply, test.mustIncludeAny)) caseFailed = true;
      if (test.mustNotIncludeAny && includesAny(reply, test.mustNotIncludeAny)) caseFailed = true;
      if (test.shouldMentionAny && test.shouldMentionAny.length > 0 && !includesAny(reply, test.shouldMentionAny)) caseFailed = true;
      if (test.expectStructured && !hasStructuredFormat(reply)) caseFailed = true;
      if (test.expectYearValue && !hasYearValue(reply)) caseFailed = true;
      if (test.requiresUrl && !hasUrl(reply)) {
        const isDisambiguation = test.allowsDisambiguation
          && /(varias propiedades parecidas|indica el numero|nombre exacto)/.test(replyNormalized);
        if (!isDisambiguation) caseFailed = true;
      }
      if (test.expectCards) {
        const suggestions = r.data?.ui?.propertySuggestions;
        if (!Array.isArray(suggestions) || suggestions.length === 0) caseFailed = true;
      }

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

  for (const test of dialogueTests) {
    try {
      const history = [];
      const replies = [];

      for (const step of test.steps) {
        history.push({ role: 'user', content: step });
        const r = await postChatMessages({ profile: test.profile, messages: history });
        const provider = r.data?.provider || 'unknown';
        const reply = String(r.data?.reply || '');
        replies.push(reply);

        if (!r.ok || !reply || reply.trim().length < 20 || provider === 'safe-mode') {
          throw new Error(`respuesta inválida en paso ${replies.length}`);
        }

        history.push({ role: 'assistant', content: reply });
      }

      const firstReply = replies[0] || '';
      const secondReply = replies[1] || '';

      let caseFailed = false;
      if (firstReply === secondReply) caseFailed = true;
      if (!hasStructuredFormat(secondReply)) caseFailed = true;
      if (test.secondMustIncludeAny && !includesAny(secondReply, test.secondMustIncludeAny)) caseFailed = true;

      if (caseFailed) {
        failed += 1;
        console.log(`FAIL ${test.name} -> respuestas repetidas o poco profundas`);
        console.log(`     step1=${firstReply.slice(0, 180)}`);
        console.log(`     step2=${secondReply.slice(0, 180)}`);
      } else {
        console.log(`OK   ${test.name} -> seguimiento conversacional correcto`);
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