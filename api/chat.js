const { fetchProperties, propertiesToContext } = require('./properties');
const { generateChatReply, getLlmStatus } = require('./llm');
const { applyCors } = require('./http');
const { createRateLimiter } = require('./rate-limit');

const WHATSAPP = process.env.WHATSAPP_NUMBER || '51999999999';
const RULES_ONLY_MODE = String(process.env.CHAT_RULES_ONLY_MODE || 'false').toLowerCase() === 'true';
const RULES_FALLBACK_ON_SAFE_MODE = String(process.env.CHAT_ENABLE_RULES_FALLBACK || 'true').toLowerCase() === 'true';
const checkChatRateLimit = createRateLimiter({ windowMs: 60_000, max: 45 });
const NO_DATA = 'No especificado en habita.pe';
const CONTEXT_MAX_PROPERTIES = parseInt(process.env.PROPERTY_CONTEXT_MAX_ITEMS || '6', 10);
const STOP_WORDS = new Set([
  'para', 'como', 'quiero', 'dime', 'sobre', 'tengo', 'necesito', 'del', 'de',
  'los', 'las', 'una', 'uno', 'por', 'con', 'sin', 'que', 'esta', 'este',
  'inmueble', 'propiedad', 'habita', 'tema', 'mas', 'info', 'informacion',
]);

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

function detectPropertyTypePreference(text) {
  const t = normalizeForSearch(text);
  if (/(terreno|lote|lotizacion|lotes)/.test(t)) return 'terreno';
  if (/(departamento|depa|dpto|flat)/.test(t)) return 'departamento';
  if (/(casa|casona|vivienda)/.test(t)) return 'casa';
  if (/(local|comercial|tienda)/.test(t)) return 'local';
  if (/(oficina|office)/.test(t)) return 'oficina';
  return null;
}

function typeMatchesPreference(property, preferredType) {
  if (!preferredType) return true;
  const haystack = normalizeForSearch(`${property.type} ${property.title} ${property.features}`);

  if (preferredType === 'terreno') return /(terreno|lote|lotizacion|loteamiento)/.test(haystack);
  if (preferredType === 'departamento') return /(departamento|depa|dpto|flat)/.test(haystack);
  if (preferredType === 'casa') return /(casa|casona|vivienda)/.test(haystack);
  if (preferredType === 'local') return /(local|comercial|tienda)/.test(haystack);
  if (preferredType === 'oficina') return /(oficina|office)/.test(haystack);

  return true;
}

function getQueryTokens(text) {
  const normalized = normalizeForSearch(text);
  return normalized
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
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
  const preferredType = detectPropertyTypePreference(queryText);

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

  if (preferredType) {
    score += typeMatchesPreference(property, preferredType) ? 8 : -6;
  }

  return score;
}

function isPropertySearchIntent(text) {
  const t = normalizeForSearch(text);
  return /(propiedad|propiedades|depa|departamento|casa|inmueble|comprar|alquilar|alquiler|venta|vender|distrito|zona|precio|cuarto|dormitorio)/.test(t);
}

function isPropertyDetailIntent(text) {
  const t = normalizeForSearch(text);
  return /(detalle|detalles|ficha|metros|metraje|m2|m²|area|precio|titulo|titulos|documentacion|documentos|sunarp|papeles|san blas|info)/.test(t);
}

function scorePropertyReference(property, queryText) {
  const query = normalizeForSearch(queryText);
  const title = normalizeForSearch(property.title);
  const city = normalizeForSearch(property.city);
  const address = normalizeForSearch(property.address);
  const type = normalizeForSearch(property.type);
  const features = normalizeForSearch(property.features);
  const excerpt = normalizeForSearch(property.excerpt);
  const preferredType = detectPropertyTypePreference(queryText);

  let score = 0;
  const tokens = getQueryTokens(queryText);

  if (title && query.includes(title) && title.length >= 8) score += 20;

  tokens.forEach((token) => {
    if (title.includes(token)) score += 7;
    if (city.includes(token)) score += 4;
    if (address.includes(token)) score += 4;
    if (type.includes(token)) score += 3;
    if (features.includes(token)) score += 1;
    if (excerpt.includes(token)) score += 1;
  });

  if (preferredType) {
    score += typeMatchesPreference(property, preferredType) ? 10 : -8;
  }

  return score;
}

function rankPropertiesByReference(properties, queryText) {
  return (properties || [])
    .map((property) => ({ property, score: scorePropertyReference(property, queryText) }))
    .sort((a, b) => b.score - a.score);
}

function formatPropertyField(value) {
  const text = String(value || '').trim();
  return text || NO_DATA;
}

function buildPropertyDetailReply({ property, waUrl }) {
  const place = [property.city, property.address].filter(Boolean).join(' - ') || NO_DATA;

  const lines = [
    `Ficha encontrada en habita.pe para: ${property.title}`,
    `- Tipo / estado: ${formatPropertyField(property.type)} / ${formatPropertyField(property.status)}`,
    `- Precio publicado: ${formatPropertyField(property.price)}`,
    `- Area total: ${formatPropertyField(property.areaTotal)}`,
    `- Area de terreno: ${formatPropertyField(property.areaLand)}`,
    `- Area construida: ${formatPropertyField(property.areaBuilt)}`,
    `- Dormitorios: ${formatPropertyField(property.beds)} | Banos: ${formatPropertyField(property.baths)} | Garajes: ${formatPropertyField(property.garages)}`,
    `- Ubicacion: ${place}`,
    `- Documentacion y titulos: ${formatPropertyField(property.documentation)}`,
  ];

  if (property.features) lines.push(`- Caracteristicas: ${property.features}`);
  if (property.detailsSummary) lines.push(`- Datos adicionales: ${property.detailsSummary}`);
  if (property.excerpt) lines.push(`- Resumen: ${property.excerpt}`);
  lines.push(`- URL: ${property.url}`);
  lines.push('');
  lines.push(`Si deseas, te comparo esta opcion con otras similares o te conecto con asesor: ${waUrl}`);

  return lines.join('\n');
}

function buildPropertyDisambiguationReply({ matches }) {
  const options = matches.slice(0, 3).map((row, idx) => {
    const p = row.property;
    const area = p.areaTotal || p.areaBuilt || NO_DATA;
    return `${idx + 1}. ${p.title} | ${p.price} | ${area}`;
  }).join('\n');

  return [
    'En habita.pe encontre varias propiedades parecidas a tu consulta:',
    options,
    '',
    'Indicame el numero o el nombre exacto y te doy la ficha completa con metros, precio y documentacion.',
  ].join('\n');
}

function buildPropertyDetailIntentReply({ text, properties, waUrl }) {
  if (!isPropertyDetailIntent(text)) return null;

  const ranked = rankPropertiesByReference(properties, text);
  const positive = ranked.filter((row) => row.score >= 4);

  if (!positive.length) {
    return [
      'No encontre una propiedad exacta con ese nombre en habita.pe en este momento.',
      'Si me compartes el nombre tal como aparece en la publicacion o el distrito, te doy la ficha detallada.',
      `Tambien te puedo conectar con un asesor: ${waUrl}`,
    ].join('\n');
  }

  if (positive.length === 1) {
    return buildPropertyDetailReply({ property: positive[0].property, waUrl });
  }

  const top = positive[0];
  const second = positive[1];
  if (!second || top.score - second.score >= 4) {
    return buildPropertyDetailReply({ property: top.property, waUrl });
  }

  return buildPropertyDisambiguationReply({ matches: positive });
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
    const area = p.areaTotal || p.areaBuilt || NO_DATA;
    return `${idx + 1}. ${p.title}\n${p.price} | ${place}\nArea: ${area}\n${p.url}`;
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

  const list = top
    .map((p, idx) => `${idx + 1}. ${p.title} - ${p.price}\nArea: ${p.areaTotal || p.areaBuilt || NO_DATA}\n${p.url}`)
    .join('\n\n');
  return [
    'Estoy operando en modo local sin IA externa.',
    'Te comparto opciones destacadas del catalogo:',
    list,
    '',
    profileHint,
  ].join('\n');
}

function looksLikeOwnerPropertyDescription(text) {
  const t = normalizeForSearch(text);
  const hasPropertyWord = /(terreno|lote|casa|departamento|depa|local|oficina|inmueble)/.test(t);
  const hasMetricOrAmount = /(m2|m²|metros|metraje|\b\d{2,5}\b)/.test(t);
  return hasPropertyWord && hasMetricOrAmount;
}

function buildRuleBasedReply({ text, profile, waUrl, properties }) {
  const t = String(text || '').toLowerCase();
  const normalized = normalizeForSearch(text || '');

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

  if (profile === 'vendedor' && /(vender|venta|tasar|valorar|valorizacion|publicar|mi casa|mi departamento|mi depa|mi inmueble)/.test(normalized)) {
    return [
      'Perfecto. Te ayudo con el proceso para vender tu inmueble con Habita.',
      'Para una valuacion comercial inicial, comparte por favor:',
      '1. Tipo de inmueble',
      '2. Distrito o zona',
      '3. Area aproximada y numero de ambientes',
      '4. Precio esperado (opcional)',
      '',
      `Si deseas atencion inmediata, te conecto con un asesor: ${waUrl}`,
    ].join('\n');
  }

  if (profile === 'vendedor' && looksLikeOwnerPropertyDescription(normalized)) {
    return [
      'Perfecto, tomo los datos de tu inmueble para venta con Habita.',
      'Con lo que indicas, el siguiente paso es una valuacion comercial con asesor.',
      'Para continuar, confirma por favor: direccion exacta, numero de ambientes y precio esperado.',
      `Si deseas atencion inmediata: ${waUrl}`,
    ].join('\n');
  }

  if (profile === 'agente' && /(agente|corredor|comision|captar|cliente|colaborar|alianza|trabajar con habita|inmueble de cliente)/.test(normalized)) {
    return [
      'Excelente, podemos colaborar contigo en la comercializacion de inmuebles.',
      'Para revisar tu caso, comparteme por favor:',
      '1. Tipo de inmueble y zona',
      '2. Operacion (venta o alquiler)',
      '3. Rango de precio',
      '4. Si ya tienes propietario o cliente calificado',
      '',
      `Coordinamos por asesor comercial aqui: ${waUrl}`,
    ].join('\n');
  }

  if (profile === 'agente' && looksLikeOwnerPropertyDescription(normalized)) {
    return [
      'Perfecto, revisemos tu oportunidad como agente con Habita.',
      'Compárteme tipo de inmueble, zona, operacion y precio para evaluar encaje comercial.',
      `Si prefieres, lo coordinamos directo con asesor comercial: ${waUrl}`,
    ].join('\n');
  }

  if (/(chiste|futbol|politica|receta|musica|tarea|programacion|codigo)/.test(t)) {
    const profileHint = profile === 'vendedor'
      ? 'si quieres vender, te explico como Habita acelera la comercializacion de tu inmueble.'
      : 'si buscas comprar o alquilar, te ayudo a filtrar por zona, presupuesto y tipo de propiedad.';
    return `Puedo ayudarte solo en temas inmobiliarios de Habita. Pero con gusto ${profileHint}`;
  }

  if (profile === 'comprador') {
    const detailReply = buildPropertyDetailIntentReply({ text: t, properties, waUrl });
    if (detailReply) return detailReply;
  }

  const propertyReply = profile === 'comprador'
    ? buildPropertyRuleReply({ text: t, properties, waUrl })
    : null;
  if (propertyReply) return propertyReply;

  if (profile === 'vendedor') {
    return [
      'Te acompano en la venta de tu inmueble con un enfoque comercial claro.',
      'Si me compartes zona, tipo de inmueble y metraje, te doy una orientacion inicial.',
      `Tambien puedes coordinar directo por WhatsApp: ${waUrl}`,
    ].join('\n');
  }

  if (profile === 'agente') {
    return [
      'Te ayudo a estructurar una colaboracion comercial con Habita.',
      'Cuantame tipo de inmueble, zona y operacion para orientarte mejor.',
      `Si prefieres, coordinamos directo con un asesor: ${waUrl}`,
    ].join('\n');
  }

  return null;
}

function selectPromptProperties({ properties, text, profile, maxItems = 6 }) {
  if (!Array.isArray(properties) || !properties.length) return [];

  const cap = Number.isFinite(maxItems) && maxItems > 0 ? maxItems : 6;
  const message = String(text || '');

  if (!message.trim()) {
    return properties.slice(0, cap);
  }

  const ranked = properties
    .map((property) => {
      const byReference = scorePropertyReference(property, message);
      const bySearch = profile === 'comprador' ? scorePropertyMatch(property, message) : 0;
      return {
        property,
        score: (byReference * 1.5) + bySearch,
      };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked
    .filter((row) => row.score > 0)
    .slice(0, cap)
    .map((row) => row.property);

  return selected.length ? selected : properties.slice(0, cap);
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
      chatMode: {
        rulesOnly: RULES_ONLY_MODE,
        rulesFallbackOnSafeMode: RULES_FALLBACK_ON_SAFE_MODE,
      },
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

  const waUrl = `https://wa.me/${WHATSAPP}`;
  const normalizedProfile = normalizeProfile(profile);
  const lastUserMessage = getLastUserMessage(messages);

  let propertiesContext = 'No se pudieron cargar los inmuebles en este momento.';
  let properties = [];
  let promptProperties = [];
  try {
    properties = await fetchProperties();
    promptProperties = selectPromptProperties({
      properties,
      text: lastUserMessage,
      profile: normalizedProfile,
      maxItems: CONTEXT_MAX_PROPERTIES,
    });
    const forPrompt = promptProperties.length ? promptProperties : properties;
    propertiesContext = propertiesToContext(forPrompt, { maxItems: CONTEXT_MAX_PROPERTIES });
  } catch (err) {
    console.warn('[Habby] WP REST API caído:', err.message);
  }

  const contextProperties = promptProperties.length
    ? promptProperties
    : properties.slice(0, CONTEXT_MAX_PROPERTIES);
  const ruleReply = buildRuleBasedReply({
    text: lastUserMessage,
    profile: normalizedProfile,
    waUrl,
    properties,
  });

  if (ruleReply) {
    return res.json({
      reply: ruleReply,
      provider: RULES_ONLY_MODE ? 'rules-only' : 'rule-based',
      bypassedLlm: true,
    });
  }

  if (RULES_ONLY_MODE) {
    return res.json({
      reply: buildRulesOnlyFallbackReply({
        properties: contextProperties,
        waUrl,
        profile: normalizedProfile,
      }),
      provider: 'rules-only',
      bypassedLlm: true,
    });
  }

  const profilePrompt = getProfilePrompt(normalizedProfile);
  const promptCatalogMeta = `Total de propiedades cargadas: ${properties.length}. Propiedades enviadas al LLM: ${contextProperties.length}.`;
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
- Responde entre 80 y 140 palabras. Si piden ficha detallada de una propiedad, puedes usar hasta 220 palabras
- Cerrar siempre con una pregunta accionable de negocio

## REGLAS IMPORTANTES
1. SOLO hablas de inmuebles y temas relacionados
2. Si preguntan algo fuera del ámbito inmobiliario, redirige amablemente
3. NUNCA inventes propiedades, precios, areas, metrajes ni documentacion
4. Si un dato no existe en habita.pe, responde literalmente: "No especificado en habita.pe"
5. Usa emojis con moderación — 📍🏠💰

## MODO FICHA DETALLADA (cuando pregunten por un inmueble puntual)
Responde siempre en este orden:
1) Propiedad
2) Precio publicado
3) Area total
4) Area de terreno
5) Area construida
6) Dormitorios, banos y garajes
7) Documentacion y titulos
8) URL de habita.pe

## CONTACTO DIRECTO CON ASESOR
Cuando el usuario quiera hablar con un asesor o agendar visita:
${waUrl}

## CATALOGO ACTUAL DE HABITA.PE
${promptCatalogMeta}

## PROPIEDADES RELEVANTES PARA ESTA CONSULTA
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
      properties: contextProperties,
      waUrl,
    });

    if (result.provider === 'safe-mode' && RULES_FALLBACK_ON_SAFE_MODE) {
      const rulesFallbackReply = buildPropertyRuleReply({
        text: lastUserMessage,
        properties,
        waUrl,
      }) || buildRulesOnlyFallbackReply({
        properties,
        waUrl,
        profile: normalizedProfile,
      });

      return res.json({
        reply: rulesFallbackReply,
        provider: 'rules-fallback',
        bypassedLlm: true,
        llmAttempts: result.attempts || [],
      });
    }

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