const { fetchProperties, propertiesToContext } = require('./properties');
const { generateChatReply, getLlmStatus } = require('./llm');
const { applyCors } = require('./http');
const { createRateLimiter } = require('./rate-limit');

const WHATSAPP = process.env.WHATSAPP_NUMBER || '51999999999';
const RULES_ONLY_MODE = String(process.env.CHAT_RULES_ONLY_MODE || 'false').toLowerCase() === 'true';
const checkChatRateLimit = createRateLimiter({ windowMs: 60_000, max: 45 });

function normalizeProfile(profile) {
  const raw = String(profile || '').trim().toLowerCase();
  if (raw === 'comprador') return 'comprador';
  if (raw === 'vendedor') return 'vendedor';
  if (raw === 'agente') return 'agente';
  return 'comprador';
}

function getProfilePrompt(profile) {
  if (profile === 'vendedor') {
    return `## ENFOQUE POR PERFIL: VENDEDOR
La persona quiere vender su inmueble directamente con Habita.

Objetivo:
- Resaltar beneficios claros de vender con Habita
- Explicar el valor de nuestro equipo comercial y de marketing
- Guiar a una cita de valoración o llamada con asesor

Propuesta de valor que debes comunicar:
- Estrategia comercial para acelerar la venta
- Producción de contenido inmobiliario de alta calidad
- Difusión y publicidad digital para generar más interesados
- Acompañamiento profesional durante todo el proceso

Si piden detalles específicos (tiempos, costos exactos o condiciones legales), indica que un asesor humano confirmará esos puntos con precisión.`;
  }

  if (profile === 'agente') {
    return `## ENFOQUE POR PERFIL: AGENTE
La persona es un agente/corredor con contacto de inmueble y quiere trabajar con Habita.

Objetivo:
- Explicar modelo de colaboración con Habita
- Destacar comisiones competitivas y soporte comercial
- Incentivar una reunión para revisar caso y acordar condiciones

Propuesta de valor que debes comunicar:
- Comisiones bajas o competitivas según operación
- Soporte integral de marketing y publicidad
- Cobertura audiovisual con cámaras, drones y piezas promocionales
- Gestión de interesados y apoyo en agenda de citas

No inventes porcentajes ni condiciones contractuales exactas. Si las piden, deriva a asesor humano para propuesta formal.`;
  }

  return `## ENFOQUE POR PERFIL: COMPRADOR
La persona busca comprar o alquilar un inmueble.

Objetivo:
- Brindar excelente experiencia y orientación clara
- Recomendar inmuebles del catálogo de Habita según necesidad y presupuesto
- Convencer con información útil, transparente y accionable

Al recomendar propiedades:
- Prioriza coincidencia por zona, precio, tipo y características
- Incluye siempre URL cuando exista
- Si no hay match exacto, sugiere alternativas cercanas y explica por qué`;
}

function getLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i] || {};
    const role = String(item.role || '').toLowerCase();
    if (role === 'user') {
      return String(item.content || '').trim();
    }
  }
  return '';
}

function normalizeForSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function detectOperation(text) {
  const t = normalizeForSearch(text);
  if (/(alquilar|alquiler|renta|arrendar)/.test(t)) return 'alquiler';
  if (/(comprar|compra|venta|vender|vendo)/.test(t)) return 'venta';
  return null;
}

function scorePropertyMatch(property, queryText) {
  const query = normalizeForSearch(queryText);
  const status = normalizeForSearch(property.status);
  const title = normalizeForSearch(property.title);
  const type = normalizeForSearch(property.type);
  const city = normalizeForSearch(property.city);
  const address = normalizeForSearch(property.address);
  const features = normalizeForSearch(property.features);
  const operation = detectOperation(query);

  let score = 0;

  if (operation) {
    if (operation === 'alquiler' && /(alquiler|alquilar|renta)/.test(status)) score += 4;
    if (operation === 'venta' && /(venta|vender|compra)/.test(status)) score += 4;
  }

  const words = query.split(/\s+/).filter((w) => w.length >= 3);
  words.forEach((word) => {
    if (city.includes(word)) score += 3;
    if (address.includes(word)) score += 2;
    if (title.includes(word) || type.includes(word)) score += 2;
    if (features.includes(word)) score += 1;
  });

  return score;
}

function isPropertySearchIntent(text) {
  const t = normalizeForSearch(text);
  return /(propiedad|propiedades|depa|departamento|casa|inmueble|comprar|alquilar|alquiler|venta|vender|distrito|zona|precio|cuarto|dormitorio)/.test(t);
}

function buildPropertyRuleReply({ text, properties, waUrl }) {
  if (!isPropertySearchIntent(text)) return null;

  const ranked = (properties || [])
    .map((property) => ({ property, score: scorePropertyMatch(property, text) }))
    .sort((a, b) => b.score - a.score);

  const withScore = ranked.filter((row) => row.score > 0);
  const selected = (withScore.length ? withScore : ranked).slice(0, 3).map((row) => row.property);

  if (!selected.length) {
    return [
      'No encontre propiedades en este momento con ese criterio exacto.',
      `Si deseas apoyo inmediato, te conecto con un asesor: ${waUrl}`,
      'Dime si buscas compra o alquiler, distrito y presupuesto aproximado.',
    ].join('\n');
  }

  const lines = selected.map((p, idx) => {
    const place = [p.city, p.address].filter(Boolean).join(' - ') || 'Ubicacion por confirmar';
    return `${idx + 1}. ${p.title}\n${p.price} | ${place}\n${p.url}`;
  });

  return [
    'Estas opciones del catalogo de Habita pueden encajar con tu busqueda:',
    lines.join('\n\n'),
    '',
    'Si deseas, te ayudo a filtrar por distrito y presupuesto para darte opciones mas precisas.',
  ].join('\n');
}

function buildRulesOnlyFallbackReply({ properties, waUrl, profile }) {
  const top = (properties || []).slice(0, 3);
  const profileHint = profile === 'vendedor'
    ? 'Si deseas vender tu inmueble, te conecto con un asesor comercial para valorizacion.'
    : 'Si buscas compra o alquiler, dime distrito y presupuesto para filtrar mejor.';

  if (!top.length) {
    return [
      'Estoy operando en modo local sin IA externa en este momento.',
      'No tengo el catalogo en vivo disponible ahora mismo.',
      `Asesor directo: ${waUrl}`,
    ].join('\n');
  }

  const list = top.map((p, idx) => `${idx + 1}. ${p.title} - ${p.price}\n${p.url}`).join('\n\n');
  return [
    'Estoy operando en modo local sin IA externa.',
    'Te comparto opciones destacadas del catalogo:',
    list,
    '',
    profileHint,
  ].join('\n');
}

function buildRuleBasedReply({ text, profile, waUrl, properties }) {
  const t = String(text || '').toLowerCase();

  if (!t) return null;

  if (/(hola|buenas|buenos dias|buenas tardes|buenas noches)\b/.test(t)) {
    return 'Hola, soy Habby de Habita Peru. Te ayudo con compra, alquiler o venta de inmuebles. Dime en que distrito buscas y tu rango de presupuesto.';
  }

  if (/(asesor|humano|telefono|whatsapp|llamar|contactar)/.test(t)) {
    return [
      'Perfecto, te conecto con un asesor humano de Habita.',
      `WhatsApp directo: ${waUrl}`,
      '',
      'Si deseas, tambien puedo adelantar tu perfil (operacion, distrito y presupuesto) para que te atiendan mas rapido.',
    ].join('\n');
  }

  if (/(agendar|agenda|cita|visita|reunion|horario|disponibilidad)/.test(t)) {
    return [
      'Claro, te ayudo con la cita. Para asegurar disponibilidad en tiempo real necesitamos estos datos:',
      '1. Nombre completo',
      '2. Celular',
      '3. Correo (opcional)',
      '4. Operacion: comprar, alquilar o vender',
      '5. Distrito de interes',
      '',
      `Si prefieres atencion inmediata por asesor: ${waUrl}`,
    ].join('\n');
  }

  if (/(chiste|futbol|politica|receta|musica|tarea|programacion|codigo)/.test(t)) {
    const profileHint = profile === 'vendedor'
      ? 'si quieres vender, te explico como Habita acelera la comercializacion de tu inmueble.'
      : 'si buscas comprar o alquilar, te ayudo a filtrar por zona, presupuesto y tipo de propiedad.';
    return `Puedo ayudarte solo en temas inmobiliarios de Habita. Pero con gusto ${profileHint}`;
  }

  const propertyReply = buildPropertyRuleReply({ text: t, properties, waUrl });
  if (propertyReply) return propertyReply;

  return null;
}

module.exports = async (req, res) => {
  const corsAllowed = applyCors(req, res, 'GET, POST, OPTIONS');
  if (!corsAllowed) {
    return res.status(403).json({ error: 'Origen no permitido por CORS.' });
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    return res.json({
      ok: true,
      endpoint: 'POST /api/chat',
      llm: getLlmStatus(),
    });
  }
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Método no permitido.' });

  const rate = checkChatRateLimit(req);
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  res.setHeader('X-RateLimit-Reset', String(rate.resetAt));
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta nuevamente en un momento.' });
  }

  const { messages, profile } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Se requiere el campo messages.' });
  }

  let propertiesContext = 'No se pudieron cargar los inmuebles en este momento.';
  let properties = [];
  try {
    properties = await fetchProperties();
    propertiesContext = propertiesToContext(properties);
  } catch (err) {
    console.warn('[Habby] WP REST API caído:', err.message);
  }

  const waUrl = `https://wa.me/${WHATSAPP}`;
  const normalizedProfile = normalizeProfile(profile);
  const lastUserMessage = getLastUserMessage(messages);
  const ruleReply = buildRuleBasedReply({
    text: lastUserMessage,
    profile: normalizedProfile,
    waUrl,
    properties,
  });

  if (ruleReply) {
    return res.json({
      reply: ruleReply,
      provider: 'rule-based',
      bypassedLlm: true,
    });
  }

  if (RULES_ONLY_MODE) {
    return res.json({
      reply: buildRulesOnlyFallbackReply({
        properties,
        waUrl,
        profile: normalizedProfile,
      }),
      provider: 'rules-only',
      bypassedLlm: true,
    });
  }

  const profilePrompt = getProfilePrompt(normalizedProfile);
  const systemPrompt = `Eres Habby, el asistente virtual de Habita Perú, una agencia inmobiliaria especializada en la compra, venta y alquiler de inmuebles en Perú.

## TU ROL
Eres un asesor inmobiliario experto, amigable y profesional. Ayudas a las personas a:
- Encontrar el inmueble ideal según sus necesidades y presupuesto
- Entender el proceso de compra, venta o alquiler en Perú
- Conocer los detalles de propiedades específicas del catálogo
- Conectar con asesores humanos cuando sea necesario

## PERFIL ACTUAL DEL USUARIO
${normalizedProfile}

${profilePrompt}

## PERSONALIDAD
- Cálido, cercano y profesional
- Español peruano natural (sin ser forzado)
- Respuestas concisas pero completas
- Cuando recomiendas una propiedad, incluye siempre el link URL
- Si no hay propiedades que coincidan exactamente, sugiere las más cercanas
- No exceder 140 palabras salvo que pidan mas detalle
- Cerrar siempre con una pregunta accionable de negocio

## REGLAS IMPORTANTES
1. SOLO hablas de inmuebles y temas relacionados
2. Si preguntan algo fuera del ámbito inmobiliario, redirige amablemente
3. NUNCA inventes propiedades, precios ni datos que no estén en el listado
4. Si no tienes la información exacta, deriva al asesor humano
5. Usa emojis con moderación — 📍🏠💰

## CONTACTO DIRECTO CON ASESOR
Cuando el usuario quiera hablar con un asesor o agendar visita:
${waUrl}

## CATÁLOGO ACTUAL DE HABITA.PE
${propertiesContext}

## FORMATO
- Listas cortas para múltiples propiedades
- Por propiedad: nombre, precio, ubicación, características y URL
- Cierra con una pregunta corta para seguir ayudando
- Si no hay datos suficientes, primero pide maximo 2 datos concretos antes de responder`;

  try {
    const result = await generateChatReply({
      messages,
      systemPrompt,
      properties,
      waUrl,
    });

    res.json({
      reply: result.reply,
      provider: result.provider,
      fallbackAttempts: result.attempts || [],
    });

  } catch (err) {
    console.error('[Habby] Fetch error:', err);
    res.status(502).json({ error: 'Error de conexión. Intenta de nuevo.' });
  }
};