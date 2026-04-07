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
- Resaltar beneficios concretos de vender con Habita y por qué acelera el cierre
- Explicar el valor del equipo comercial, de marketing y audiovisual
- Guiar a una cita de valoración o llamada con asesor

Propuesta de valor que debes comunicar:
- Estrategia comercial para acelerar la venta
- Producción de fotos y video profesional para presentar mejor el inmueble
- Tomas con drones cuando la propiedad lo amerite
- Difusión y publicidad digital para generar más interesados
- Filtro de leads y visitas calificadas para evitar pérdida de tiempo
- Acompañamiento profesional durante todo el proceso

Si piden detalles específicos (tiempos, costos exactos o condiciones legales), indica que un asesor humano confirmará esos puntos con precisión.
Si preguntan por beneficios, desarrolla el valor comercial con tono persuasivo, pero claro y conciso.`;
  }

  if (profile === 'agente') {
    return `## ENFOQUE POR PERFIL: AGENTE
La persona es un agente/corredor con contacto de inmueble y quiere trabajar con Habita.

Objetivo:
- Explicar el modelo de colaboración con Habita
- Destacar comisiones competitivas y soporte comercial
- Incentivar una reunión para revisar el caso y acordar condiciones

Propuesta de valor que debes comunicar:
- Comisión competitiva según operación; no inventes porcentajes exactos
- Soporte integral de marketing y publicidad para aumentar cierres
- Cobertura audiovisual con cámaras, fotos, video y drones
- Gestión de interesados, seguimiento y apoyo en agenda de citas
- Más oportunidades por rotación, alcance y respaldo comercial

No inventes porcentajes ni condiciones contractuales exactas. Si las piden, deriva a asesor humano para propuesta formal.
Si preguntan cuánto gana, aclara que depende del caso y remarca que el valor está en el volumen, la rapidez y el soporte comercial.`;
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

function getLastAssistantMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i] || {};
    const role = String(item.role || '').toLowerCase();
    if (role === 'assistant') {
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

function getPropertyVisualTag(property) {
  const haystack = normalizeForSearch(`${property.type} ${property.status}`);

  if (/(alquiler|alquilar|renta)/.test(haystack)) return '📅 Alquiler';
  if (/(venta|vender|compra)/.test(haystack)) return '💰 Venta';
  if (/(terreno|lote)/.test(haystack)) return '🌿 Terreno';
  if (/(departamento|depa|dpto|flat)/.test(haystack)) return '🏢 Departamento';
  if (/(casa|vivienda)/.test(haystack)) return '🏠 Casa';
  if (/(oficina|office)/.test(haystack)) return '💼 Oficina';
  return '🏡 Propiedad';
}

function mapPropertySuggestion(property) {
  const location = [property.city, property.address].filter(Boolean).join(' - ') || NO_DATA;
  return {
    id: property.id,
    title: property.title,
    price: property.price,
    location,
    type: property.type,
    status: property.status,
    areaTotal: property.areaTotal,
    url: property.url,
    imageUrl: property.imageThumbUrl || property.imageUrl || '',
    imageAlt: property.imageAlt || 'Imagen de propiedad',
    tag: getPropertyVisualTag(property),
  };
}

function buildPropertySuggestions({ text, properties, profile, limit = 3 }) {
  if (profile !== 'comprador') return [];
  const source = Array.isArray(properties) ? properties : [];
  if (!source.length) return [];

  const query = String(text || '');
  const ranked = source
    .map((property) => {
      const bySearch = scorePropertyMatch(property, query);
      const byReference = scorePropertyReference(property, query);
      return {
        property,
        score: (bySearch * 1.2) + (byReference * 1.4),
      };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked
    .filter((row) => row.score > 0)
    .slice(0, limit)
    .map((row) => mapPropertySuggestion(row.property));

  return selected;
}

function buildStructuredReply({ title, bullets = [], question = '' }) {
  const safeTitle = String(title || '').trim();
  const safeBullets = bullets
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((item) => `• ${item}`);
  const safeQuestion = String(question || '').trim();

  return [safeTitle, ...safeBullets, safeQuestion ? '' : null, safeQuestion]
    .filter((line) => line !== null && line !== undefined)
    .join('\n');
}

function hasStructuredPresentation(text) {
  const value = String(text || '');
  return /(^|\n)•\s+/m.test(value) && /\?\s*$/m.test(value.trim());
}

function getIntentQuestion(intent, waUrl) {
  if (intent === 'booking') return '¿Te parece si empezamos con tus datos para agendar la cita?';
  if (intent === 'advisor') return `¿Quieres que te conecte ahora con un asesor por WhatsApp (${waUrl})?`;
  if (intent === 'property-search') return '¿Quieres que te filtre por distrito, presupuesto o tipo de inmueble?';
  if (intent === 'property-detail') return '¿Quieres que compare esta opcion con otras similares?';
  return '¿Quieres que te guie con una recomendacion concreta segun tu objetivo?';
}

function normalizeReplyPresentation({ reply, intent, waUrl }) {
  const raw = String(reply || '').trim();
  if (!raw) return raw;
  if (hasStructuredPresentation(raw)) return raw;

  const clean = raw
    .replace(/\r/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  let title = 'Orientacion personalizada';
  let bullets = [];

  if (sentences.length >= 1) {
    title = sentences[0].replace(/[.!?]+$/, '').slice(0, 120) || title;
  }

  bullets = sentences.slice(1, 5);

  if (!bullets.length) {
    const chunks = clean
      .split(/\n+/)
      .map((line) => line.replace(/^[-•\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 4);

    bullets = chunks.length ? chunks : [clean.slice(0, 220)];
  }

  return buildStructuredReply({
    title,
    bullets,
    question: getIntentQuestion(intent, waUrl),
  });
}

function addVariationToReply(baseReply, attemptCount = 0) {
  if (!baseReply || !baseReply.includes('•')) return baseReply;

  const variations = [
    (r) => r, // 0: sin cambio
    (r) => r.replace(/Perfecto/g, 'Excelente').replace(/Te ayudo/g, 'Puedo ayudarte'),
    (r) => r.replace(/¿/g, '👉 ¿').replace(/\?/g, '?'), // 1: emojis
    (r) => {
      // 2: reorganizar bullets
      const lines = r.split('\n');
      if (lines.length < 4) return r;
      return [lines[0], ...lines.slice(1).sort(() => Math.random() - 0.5)].join('\n');
    },
    (r) => r.replace(/Perfecto,/gi, 'Entendido,').replace(/Claro,/gi, 'Por supuesto,'), // 3: variacion de tono
  ];

  const fn = variations[attemptCount % variations.length];
  return fn(baseReply);
}

function normalizeForComparison(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .trim();
}

function detectRecentDuplicateReply(reply, messages, maxLookback = 3) {
  if (!reply) return false;

  const normalized = normalizeForComparison(reply);
  if (normalized.length < 20) return false;

  let duplicateCount = 0;
  let checkLimit = 0;

  for (let i = messages.length - 1; i >= 0 && checkLimit < maxLookback; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      const prevNormalized = normalizeForComparison(msg.content);
      if (prevNormalized === normalized) {
        duplicateCount += 1;
      }
      checkLimit += 1;
    }
  }

  return duplicateCount > 0;
}

function buildDuplicateAvoidanceReply({ attemptNum = 0, waUrl }) {
  const variations = [
    buildStructuredReply({
      title: 'Déjame aclarar mejor',
      bullets: [
        'Parece que necesitamos algunos detalles diferentes para ayudarte de forma más específica.',
        '¿Podrías describir tu situación con un poco más de detalle?',
      ],
      question: '¿Qué es lo más importante para ti en esta búsqueda?',
    }),
    buildStructuredReply({
      title: 'Intentemos desde otro ángulo',
      bullets: [
        'A veces la búsqueda es más clara si la enfocamos de otra manera.',
        'Por ejemplo: ¿cuál es tu prioridad principal, zona o precio?',
      ],
      question: '¿Qué factor pesa más en tu decisión?',
    }),
    buildStructuredReply({
      title: 'Entiendo, vamos a buscar de forma diferente',
      bullets: [
        'Habita tiene varias estrategias de búsqueda. ¿Prefieres ver opciones por zona, presupuesto o tipo de propiedad?',
      ],
      question: '¿Por dónde te gustaría empezar?',
    }),
  ];

  return variations[(attemptNum || 0) % variations.length];
}

function isShortAffirmation(text) {
  const t = normalizeForSearch(text);
  return /^(si|sí|sii+|si porfa|si claro|claro|dale|ok|okay|listo|perfecto|va|de acuerdo|porfa|por favor|dale pues)$/.test(t)
    || (t.length <= 14 && /(si|sí|claro|dale|ok|listo|perfecto|va)/.test(t));
}

function looksLikeSellerFeasibilityQuery(text) {
  const t = normalizeForSearch(text);
  return /(factible|conviene|se puede vender|puedo vender|vale la pena|vender|venta|tasar|valuar|avaluar|valorar)/.test(t)
    && /(terreno|lote|casa|departamento|inmueble|propiedad)/.test(t);
}

function isSellerGeneralIntent(text) {
  const t = normalizeForSearch(text);
  return /(vender|venta|tasar|valorar|avaluar|valorizacion|publicar|mi casa|mi departamento|mi depa|mi inmueble|terreno|lote|casa|departamento|depa|dpto|inmueble|propiedad)/.test(t);
}

function isAgentCaptureIntent(text) {
  const t = normalizeForSearch(text);
  return /(captar|captacion|inmueble para captar|propiedad para captar|tengo un inmueble|tengo una propiedad|tengo inmueble|tengo propiedad|quiero captar)/.test(t);
}

function isAgentValueIntent(text) {
  const t = normalizeForSearch(text);
  return /(agente|corredor|comision|comisiones|beneficio|beneficios|alianza|colaborar|trabajar con habita|como trabajamos|como funciona|modelo de trabajo|soporte comercial|marketing|equipo comercial|ganancia|porcentaje)/.test(t);
}


function isMarketAnalysisQuery(text) {
  const t = normalizeForSearch(text);
  const hasMarketSignal = /(en que ano|en que año|que ano|que año|anio|año|historico|histórico|tendencia|mercado|vendieron|ventas|se vendio|se vendieron|demanda|precio promedio)/.test(t);
  const hasRealEstateSignal = /(casa|casas|departamento|departamentos|terreno|lote|inmueble|propiedad|cusco|distrito|zona)/.test(t);
  return hasMarketSignal && hasRealEstateSignal;
}

function isOutOfScopeQuery(text) {
  const t = normalizeForSearch(text);

  const hasRealEstateSignal = /(inmueble|inmobiliari|propiedad|casa|departamento|depa|dpto|terreno|lote|alquiler|arrendar|arrendamiento|venta|vender|comprar|hipoteca|credito hipotecario|credito|tasacion|avaluo|sunarp|escritura|distrito|zona|agente inmobiliario)/.test(t);
  if (hasRealEstateSignal) return false;

  return /(chiste|futbol|politica|receta|musica|tarea|programacion|codigo|videojuego|horoscopo|medicina|salud|dieta|viaje|turismo|pelicula|serie|farandula|astrologia|numerologia|clima general)/.test(t);
}

function isBuyDecisionQuery(text) {
  const t = normalizeForSearch(text);
  return /(que es mejor comprar|que conviene comprar|casa o departamento|casa vs departamento|casa versus departamento|comparar (una )?casa (y|o) (un )?(departamento|depa|dpto)|casa y departamento)/.test(t);
}

function parsePriceNumberFromProperty(property) {
  const raw = String(property?.priceRaw || property?.price || '');
  const normalized = raw.replace(/[^\d.]/g, '');
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function isYearPeakSalesQuery(text) {
  const t = normalizeForSearch(text);
  const asksYear = /(en que ano|en que año|que ano|que año|anio|año)/.test(t);
  const asksSales = /(vendieron|se vendio|se vendieron|ventas|cierres|vendidas|vendidos)/.test(t);
  return asksYear && asksSales;
}

function statusLooksLikeSold(status) {
  const normalized = normalizeForSearch(status);
  return /(vendid|sold|cerrad|transferid|adjudicad|escriturad)/.test(normalized);
}

function extractYearFromProperty(property) {
  const candidates = [
    property?.soldAt,
    property?.closedAt,
    property?.publishedAt,
    property?.publishedAtGmt,
    property?.modifiedAt,
    property?.modifiedAtGmt,
  ];

  for (const value of candidates) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    const match = raw.match(/\b(19|20)\d{2}\b/);
    if (!match) continue;
    const year = Number(match[0]);
    if (Number.isFinite(year) && year >= 1990 && year <= 2100) {
      return year;
    }
  }

  return null;
}

function buildYearCountMap(properties, { soldOnly = false } = {}) {
  const map = new Map();

  (properties || []).forEach((property) => {
    if (soldOnly && !statusLooksLikeSold(property?.status)) return;
    const year = extractYearFromProperty(property);
    if (!year) return;
    map.set(year, (map.get(year) || 0) + 1);
  });

  return map;
}

function pickTopYearStat(yearMap) {
  if (!yearMap || yearMap.size === 0) return null;

  return [...yearMap.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.count - a.count || b.year - a.year)[0];
}

function formatYearDistribution(yearMap, limit = 4) {
  if (!yearMap || yearMap.size === 0) return '';

  return [...yearMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map(([year, count]) => `${year}: ${count}`)
    .join(' | ');
}

function inferCityFromQuery(text, properties = []) {
  const t = normalizeForSearch(text);
  if (t.includes('cusco')) return 'Cusco';

  const seen = new Set();
  for (const property of properties) {
    const city = String(property?.city || '').split(',')[0].trim();
    if (!city) continue;
    const normalizedCity = normalizeForSearch(city);
    if (!normalizedCity || seen.has(normalizedCity)) continue;
    seen.add(normalizedCity);
    if (t.includes(normalizedCity)) return city;
  }

  return '';
}

function buildMarketAnalysisReply({ text, properties, waUrl }) {
  const query = String(text || '');
  const normalizedQuery = normalizeForSearch(query);
  const operation = detectOperation(query);
  const preferredType = detectPropertyTypePreference(query);
  const city = inferCityFromQuery(query, properties);

  const filtered = (properties || []).filter((property) => {
    const status = normalizeForSearch(property.status);
    const cityHaystack = normalizeForSearch(`${property.city} ${property.address}`);

    if (operation === 'venta' && !/(venta|vender|compra)/.test(status)) return false;
    if (operation === 'alquiler' && !/(alquiler|alquilar|renta)/.test(status)) return false;
    if (preferredType && !typeMatchesPreference(property, preferredType)) return false;
    if (city && !cityHaystack.includes(normalizeForSearch(city))) return false;
    return true;
  });

  const source = filtered.length ? filtered : (properties || []);
  const prices = source
    .map((property) => parsePriceNumberFromProperty(property))
    .filter((value) => Number.isFinite(value));

  const cityLabel = city || 'la zona consultada';
  const propertyLabel = preferredType || 'inmuebles';
  const qty = source.length;
  const asksYearPeakSales = isYearPeakSalesQuery(normalizedQuery);

  const soldYearMap = buildYearCountMap(source, { soldOnly: true });
  const publishedYearMap = buildYearCountMap(source, { soldOnly: false });
  const topSoldYear = pickTopYearStat(soldYearMap);
  const topPublishedYear = pickTopYearStat(publishedYearMap);

  let yearResultLine = 'No encontré suficientes fechas en el catálogo para calcular un año pico de forma confiable.';
  let yearContextLine = '';
  let yearDistributionLine = '';

  if (topSoldYear) {
    yearResultLine = `Resultado real con datos de Habita: el año con más cierres marcados como vendidos es ${topSoldYear.year} (${topSoldYear.count} propiedades).`;
    const soldDistribution = formatYearDistribution(soldYearMap, 5);
    if (soldDistribution) {
      yearDistributionLine = `Distribución de cierres por año: ${soldDistribution}.`;
    }
  } else if (topPublishedYear) {
    yearResultLine = `Resultado real con datos de Habita: el año con mayor actividad de publicaciones en ${cityLabel} es ${topPublishedYear.year} (${topPublishedYear.count} inmuebles).`;
    const publicationDistribution = formatYearDistribution(publishedYearMap, 5);
    if (publicationDistribution) {
      yearDistributionLine = `Distribución de publicaciones por año: ${publicationDistribution}.`;
    }

    if (asksYearPeakSales) {
      yearContextLine = 'En el catálogo actual no hay registros explícitos de estado vendido/cerrado por año; por eso uso publicaciones como proxy objetivo.';
    }
  }

  let priceLine = 'No tengo suficiente detalle de precios para calcular un promedio confiable ahora mismo.';
  if (prices.length) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = Math.round(prices.reduce((acc, val) => acc + val, 0) / prices.length);
    priceLine = `Con la oferta actual en catálogo, el rango referencial va de ${min.toLocaleString('es-PE')} a ${max.toLocaleString('es-PE')}, con promedio aproximado de ${avg.toLocaleString('es-PE')}.`;
  }

  return buildStructuredReply({
    title: `Análisis inmobiliario para ${propertyLabel} en ${cityLabel}`,
    bullets: [
      yearResultLine,
      yearContextLine,
      yearDistributionLine,
      `Con la data disponible de Habita, hoy veo ${qty} opciones relevantes para tu consulta.`,
      priceLine,
      'Si quieres, complemento este análisis con fuentes externas oficiales (SUNARP/INEI) para validar tendencia de mercado.',
      `También podemos revisarlo con un asesor aquí: ${waUrl}`,
    ],
    question: '¿Quieres que te lo desagregue por tipo de inmueble (casa, depa y terreno) en Cusco?',
  });
}

function buildBuyDecisionReply({ waUrl }) {
  return buildStructuredReply({
    title: 'Casa vs departamento: ¿qué conviene comprar?',
    bullets: [
      '🏠 Casa: más espacio, independencia y posibilidad de ampliación; suele requerir más mantenimiento y seguridad propia.',
      '🏢 Departamento: menor mantenimiento y más seguridad; considera costos de mantenimiento/áreas comunes y reglas del edificio.',
      'Para inversión, el rendimiento depende de ubicación, demanda de alquiler y presupuesto disponible.',
      'Si quieres datos puntuales por distrito, puedo complementar con fuentes oficiales (SUNARP/INEI) y tu rango de inversión.',
      `Si prefieres, también puedes conversar con un asesor: ${waUrl}`,
    ],
    question: '¿Buscas vivir o invertir y en qué zona/piensas comprar?',
  });
}

function buildSellerEvaluationReply({ text, waUrl }) {
  const raw = String(text || '');
  const location = /san sebasti[aá]n/i.test(raw) ? 'San Sebastián' : 'tu zona';

  return buildStructuredReply({
    title: '¡Excelente! Podemos ayudarte a vender tu terreno.',
    bullets: [
      '1️⃣ Ubicación exacta - ¿En qué distrito/zona está?',
      '2️⃣ Metraje - ¿Cuántos m² tiene el terreno?',
      '3️⃣ Inscripción - ¿Está inscrito en registros públicos?',
      '',
      'Con esos datos podré estimar rango de precio, evaluar documentación necesaria y conectarte con asesor para prevaluación gratis.',
    ],
    question: '¿Comienzas compartiendo la ubicación?',
  });
}

function buildSellerFollowUpReply({ waUrl }) {
  return buildStructuredReply({
    title: 'Perfecto, vayamos a tu caso de venta paso a paso',
    bullets: [
      '📋 Primero confirmo: tipo de inmueble, ubicación exacta, metraje y precio esperado.',
      '✅ Luego evaluamos documentación: inscripción, gravámenes y estado legal.',
      '📸 Produzco fotos, video y fotos con drones si aplica.',
      '📣 Difundo en canales adecuados para generar interesados calificados.',
      '🎯 Filtro leads y apoyo en visitas hasta cerrar la venta.',
      `📞 Vamos paso a paso: ${waUrl}`,
    ],
    question: '¿Comenzamos con el tipo de propiedad que quieres vender?',
  });
}

function buildAgentFollowUpReply({ waUrl }) {
  return buildStructuredReply({
    title: 'Perfecto, revisemos tu caso como agente',
    bullets: [
      'La comisión es competitiva y se confirma según el caso; no inventamos porcentajes fijos.',
      'El valor para ti está en el soporte comercial, publicidad, marketing, cámaras y drones.',
      'También damos seguimiento, filtro de interesados y apoyo en agenda para cerrar mejor.',
      `Podemos revisarlo por WhatsApp: ${waUrl}`,
    ],
    question: '¿Me compartes el tipo de inmueble y la zona para orientarte?',
  });
}

function buildAgentCaptureReply({ waUrl }) {
  return buildStructuredReply({
    title: 'Excelente, revisemos ese inmueble para captar',
    bullets: [
      '🏠 Tipo de inmueble (casa, depa, terreno, local u oficina).',
      '📍 Ubicación exacta (distrito y referencia).',
      '💰 Precio esperado o rango de mercado.',
      '📄 Documentación: ¿está inscrito y libre de cargas?',
      '📸 ¿Tienes fotos o video? Si no, nosotros lo gestionamos.',
      `📲 Si prefieres, lo vemos directo por WhatsApp: ${waUrl}`,
    ],
    question: '¿Qué tipo de inmueble es y en qué zona está?',
  });
}

function buildBuyerFollowUpReply({ waUrl }) {
  return buildStructuredReply({
    title: 'Perfecto, afinemos la búsqueda para ti',
    bullets: [
      'Dime si buscas casa, departamento, terreno o local.',
      'Indícame zona, presupuesto y si es para vivir o invertir.',
      'Con eso te muestro opciones más precisas, con fotos y ubicación.',
      `Si quieres, también coordinamos por WhatsApp: ${waUrl}`,
    ],
    question: '¿Qué tipo de propiedad buscas y en qué zona?',
  });
}

function buildContextualContinuationReply({ profile, lastAssistant, lastUser, waUrl }) {
  const assistantText = normalizeForSearch(lastAssistant);
  const userText = normalizeForSearch(lastUser);

  if (profile === 'vendedor') {
    if (looksLikeSellerFeasibilityQuery(userText) || /(venta|vender|terreno|lote|document|carga|gravamen|san sebastian|san sebasti[aá]n)/.test(`${assistantText} ${userText}`)) {
      return buildSellerEvaluationReply({ text: lastUser, waUrl });
    }
    return buildSellerFollowUpReply({ waUrl });
  }

  if (profile === 'agente') {
    return buildAgentFollowUpReply({ waUrl });
  }

  if (profile === 'comprador') {
    return buildBuyerFollowUpReply({ waUrl });
  }

  return null;
}

function buildSellerValueReply({ waUrl }) {
  return buildStructuredReply({
    title: 'Vender con Habita acelera tu cierre y obtiene mejor precio',
    bullets: [
      '📸 Fotos y video profesional para destacar tu inmueble vs competencia.',
      '🚁 Drones para mostrar ubicación, entorno y acceso a vías principales.',
      '📣 Difusión digital estratégica en el público correcto.',
      '💰 Valuación comercial para establecer precio competitivo.',
      '👥 Filtro de interesados serios (sin curiosos que pierden tu tiempo).',
      '📞 Apoyo en toda la negociación hasta el cierre.',
    ],
    question: '¿Quieres que te explique el proceso completo para vender tu inmueble?',
  });
}

function buildAgentValueReply({ waUrl }) {
  return buildStructuredReply({
    title: 'Con Habita puedes cerrar más rápido y con respaldo comercial',
    bullets: [
      '💼 Comision competitiva segun la operacion; el porcentaje exacto lo confirma un asesor.',
      '📣 Publicidad, marketing y difusión para mover más leads y oportunidades.',
      '📷📹 Fotos, video y camaras para presentar mejor el inmueble.',
      '🚁 Drones cuando la propiedad lo amerita para elevar el valor percibido.',
      '📅 Apoyo en agenda, seguimiento y filtro de interesados.',
      '📈 Ganas más por rotación y cierres respaldados por el equipo comercial.',
      `📲 Coordinamos por WhatsApp: ${waUrl}`,
    ],
    question: '¿Quieres revisar un caso concreto para orientarte mejor?',
  });
}

function detectIntent(text) {
  const t = normalizeForSearch(text);
  if (/(asesor|humano|telefono|whatsapp|llamar|contactar)/.test(t)) return 'advisor';
  if (/(agendar|agenda|cita|visita|reunion|horario|disponibilidad)/.test(t)) return 'booking';
  if (isPropertyDetailIntent(t)) return 'property-detail';
  if (isPropertySearchIntent(t)) return 'property-search';
  return 'general';
}

function buildUiPayload({ text, properties, profile }) {
  const suggestions = buildPropertySuggestions({
    text,
    properties,
    profile,
    limit: 3,
  });

  if (!suggestions.length) return null;

  return {
    propertySuggestions: suggestions,
  };
}

function formatPropertyField(value) {
  const text = String(value || '').trim();
  return text || NO_DATA;
}

function buildPropertyDetailReply({ property, waUrl }) {
  const place = [property.city, property.address].filter(Boolean).join(' - ') || NO_DATA;

  const details = [
    `🏠 Inmueble: ${property.title}`,
    `💰 Precio publicado: ${formatPropertyField(property.price)}`,
    `📍 Ubicacion: ${place}`,
    `📐 Area total: ${formatPropertyField(property.areaTotal)}`,
    `📐 Area terreno: ${formatPropertyField(property.areaLand)} | Area construida: ${formatPropertyField(property.areaBuilt)}`,
    `🛏️ Dormitorios: ${formatPropertyField(property.beds)} | Banos: ${formatPropertyField(property.baths)} | Garajes: ${formatPropertyField(property.garages)}`,
    `📄 Documentacion y titulos: ${formatPropertyField(property.documentation)}`,
    `🔗 URL: ${property.url}`,
  ];

  if (property.features) details.push(`✅ Caracteristicas: ${property.features}`);

  return buildStructuredReply({
    title: 'Detalle de inmueble encontrado',
    bullets: details,
    question: `¿Deseas que te muestre opciones similares o prefieres coordinar con un asesor por WhatsApp (${waUrl})?`,
  });
}

function buildPropertyDisambiguationReply({ matches }) {
  const options = matches.slice(0, 3).map((row, idx) => {
    const p = row.property;
    const area = p.areaTotal || p.areaBuilt || NO_DATA;
    const location = [p.city, p.address].filter(Boolean).join(' - ') || NO_DATA;
    return `${idx + 1}) 🏠 ${p.title} | 💰 ${p.price} | 📍 ${location} | 📐 ${area}`;
  }).join('\n');

  return buildStructuredReply({
    title: 'Encontre varias opciones parecidas',
    bullets: [options],
    question: '¿Me indicas el numero o el nombre exacto para darte la ficha completa?',
  });
}

function buildPropertyDetailIntentReply({ text, properties, waUrl }) {
  if (!isPropertyDetailIntent(text)) return null;

  const ranked = rankPropertiesByReference(properties, text);
  const positive = ranked.filter((row) => row.score >= 4);

  if (!positive.length) {
    return buildStructuredReply({
      title: 'No encontre una propiedad exacta con ese nombre',
      bullets: [
        'Si me compartes el nombre tal como aparece en la publicacion o el distrito, te doy la ficha detallada.',
        `Tambien te puedo conectar con un asesor: ${waUrl}`,
      ],
      question: '¿Me compartes el nombre de la publicacion o el distrito?',
    });
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
    return buildStructuredReply({
      title: 'No encontre coincidencias exactas por ahora',
      bullets: [
        'Puedo buscar alternativas cercanas con mejor ajuste.',
        `Si deseas apoyo inmediato, te conecto con un asesor: ${waUrl}`,
      ],
      question: '¿Buscas compra o alquiler, en que distrito y con que presupuesto aproximado?',
    });
  }

  const lines = selected.map((p, idx) => {
    const place = [p.city, p.address].filter(Boolean).join(' - ') || 'Ubicacion por confirmar';
    const area = p.areaTotal || p.areaBuilt || NO_DATA;
    return `${idx + 1}) 🏠 ${p.title} | 💰 ${p.price} | 📍 ${place} | 📐 ${area} | 🔗 ${p.url}`;
  });

  return buildStructuredReply({
    title: 'Opciones recomendadas de Habita para ti',
    bullets: [lines.join('\n')],
    question: '¿Quieres que ahora te filtre por precio maximo o por un distrito especifico?',
  });
}

function buildRulesOnlyFallbackReply({ properties, waUrl, profile }) {
  const top = (properties || []).slice(0, 3);
  const profileHint = profile === 'vendedor'
    ? 'Si deseas vender tu inmueble, te conecto con un asesor comercial para valorizacion.'
    : 'Si buscas compra o alquiler, dime distrito y presupuesto para filtrar mejor.';

  if (!top.length) {
    return buildStructuredReply({
      title: 'Te acompano con una respuesta de respaldo',
      bullets: [
        'No tengo el catalogo en vivo disponible ahora mismo.',
        `Asesor directo: ${waUrl}`,
      ],
      question: '¿Quieres que te conecte con asesor para atencion inmediata?',
    });
  }

  const list = top
    .map((p, idx) => `${idx + 1}. ${p.title} - ${p.price}\nArea: ${p.areaTotal || p.areaBuilt || NO_DATA}\n${p.url}`)
    .join('\n\n');
  return buildStructuredReply({
    title: 'Te acompano con opciones destacadas',
    bullets: [
      'Te comparto opciones destacadas del catalogo:',
      list,
      profileHint,
    ],
    question: '¿Deseas que te conecte con un asesor para avanzar hoy mismo?',
  });
}

function looksLikeOwnerPropertyDescription(text) {
  const t = normalizeForSearch(text);
  const hasPropertyWord = /(terreno|lote|casa|departamento|depa|local|oficina|inmueble)/.test(t);
  const hasMetricOrAmount = /(m2|m²|metros|metraje|\b\d{2,5}\b)/.test(t);
  return hasPropertyWord && hasMetricOrAmount;
}

function extractPriceFromText(text) {
  const matches = text.match(/(\d+\.?\d*)\s*k|(\d+\.?\d*)\s*mil|(\d+\.?\d*)\s*usd|s?\.\s*(\d+\.?\d*)|presupuesto\s*(?:de\s+)?(?:s?\.\s*)?(\d+\.?\d*)/i);
  if (!matches) return null;
  for (let i = 1; i < matches.length; i++) {
    if (matches[i]) {
      const num = parseFloat(matches[i]);
      if (num > 100) return num;
      if (matches[0].includes('k') || matches[0].includes('mil')) return num * 1000;
      return num;
    }
  }
  return null;
}

function extractLocationFromText(text) {
  const t = normalizeForSearch(text);
  const cuscoZones = ['cusco', 'wanchaq', 'santiago', 'centro', 'jose luis', 'playa', 'quispicanchi', 'urubamba', 'ollantaytambo'];
  for (const zone of cuscoZones) {
    if (t.includes(zone)) return zone;
  }
  return null;
}

function hasMissingCriteria(text, messages) {
  const t = normalizeForSearch(text);
  const hasPrice = /(\d+\.?\d*)\s*(k|mil|usd|soles|s\.|presupuesto)/.test(text);
  const hasLocation = /cusco|zona|distrito|wanchaq|centro|santiago/.test(t);
  const hasPropertyType = /(casa|departamento|depa|dpto|terreno|lote|local|oficina)/.test(t);

  const missing = [];
  if (!hasLocation) missing.push('ubicación');
  if (!hasPrice) missing.push('presupuesto');
  if (!hasPropertyType) missing.push('tipo de propiedad');

  return {
    hasMissing: missing.length > 0,
    missing,
    hasPrice,
    hasLocation,
    hasPropertyType,
  };
}

function detectPriceContradiction(text, messages) {
  const currentPrice = extractPriceFromText(text);
  if (!currentPrice) return null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && i < messages.length - 1) {
      const prevPrice = extractPriceFromText(msg.content);
      if (prevPrice && Math.abs(currentPrice - prevPrice) > (prevPrice * 0.25)) {
        return {
          previous: prevPrice,
          current: currentPrice,
          isDifferent: true,
        };
      }
    }
  }

  return null;
}

function buildIncompletionReply({ missing, hasPrice, hasLocation, text, waUrl }) {
  if (missing.length === 0) return null;

  if (missing.length === 3) {
    return buildStructuredReply({
      title: 'Perfecto, voy a ayudarte pero necesito algunos detalles',
      bullets: [
        '📍 ¿En qué zona o distrito buscas? (Ej: Cusco, Wanchaq)',
        '💰 ¿Cuál es tu presupuesto? (Ej: 100 mil)',
        '🏠 ¿Qué tipo de propiedad? (Ej: casa, departamento)',
      ],
      question: '¿Me compartes estos 3 datos para hacer una búsqueda más precisа?',
    });
  }

  if (missing.includes('ubicación') && missing.includes('presupuesto')) {
    return buildStructuredReply({
      title: 'Vamos a afinar la búsqueda',
      bullets: [
        '📍 Primero, ¿en qué zona o distrito buscas?',
        '💰 ¿Y cuál es tu presupuesto aproximado?',
      ],
      question: '¿Cuéntame esos dos datos?',
    });
  }

  if (missing.includes('presupuesto')) {
    return buildStructuredReply({
      title: 'Buena información, solo me falta un dato',
      bullets: [
        `Veo que buscas ${missing.includes('ubicación') ? 'una ubicación específica' : 'una propiedad'}.`,
        '💰 ¿Cuál es tu presupuesto máximo?',
      ],
      question: '¿Cuál sería el rango que manejаs?',
    });
  }

  if (missing.includes('ubicación')) {
    return buildStructuredReply({
      title: 'Casi listo, me falta conocer la zona',
      bullets: [
        `Entiendo que buscas ${hasPropertyType ? 'ese tipo de propiedad' : 'algo'} con presupuesto ${hasPrice ? 'definido' : 'flexible'}.`,
        '📍 ¿En qué zona o distrito está tu interés?',
      ],
      question: '¿Dónde te gustaría buscar?',
    });
  }

  return null;
}

function buildContradictionReply({ previous, current, waUrl }) {
  return buildStructuredReply({
    title: 'Noto que hay un cambio en tu presupuesto',
    bullets: [
      `Hace poco mencionaste presupuesto de $${(previous / 1000).toFixed(0)}K.`,
      `Ahora buscas opciones de $${(current / 1000).toFixed(0)}K.`,
      'Ambos presupuestos son válidos; solo quiero asegurarme de entenderte bien.',
    ],
    question: `¿Prefieres filtrar por $${(previous / 1000).toFixed(0)}K o changear a $${(current / 1000).toFixed(0)}K?`,
  });
}

function buildRuleBasedReply({ text, profile, waUrl, properties, messages = [] }) {
  const t = String(text || '').toLowerCase();
  const normalized = normalizeForSearch(text || '');
  const lastAssistant = getLastAssistantMessage(messages);

  if (!t) return null;

  // PRIORITY 1: Detectar y resolver contradicciones en presupuesto
  if (profile === 'comprador' && isPropertySearchIntent(t)) {
    const contradiction = detectPriceContradiction(text, messages);
    if (contradiction && contradiction.isDifferent) {
      return buildContradictionReply({
        previous: contradiction.previous,
        current: contradiction.current,
        waUrl,
      });
    }
  }

  // PRIORITY 2: Detectar información incompleta y solicitar
  if (profile === 'comprador' && isPropertySearchIntent(t)) {
    const incompleteness = hasMissingCriteria(text, messages);
    if (incompleteness.hasMissing && messages.length < 5) {
      const incompletionReply = buildIncompletionReply({
        missing: incompleteness.missing,
        hasPrice: incompleteness.hasPrice,
        hasLocation: incompleteness.hasLocation,
        text,
        waUrl,
      });
      if (incompletionReply) {
        return incompletionReply;
      }
    }
  }

  if (/(hola|buenas|buenos dias|buenas tardes|buenas noches)\b/.test(t)) {
    return buildStructuredReply({
      title: '¡Hola! Soy Habby, tu asesor inmobiliario de Habita',
      bullets: [
        'Te ayudo con compra, alquiler o venta de inmuebles en Peru.',
        'Puedo recomendar opciones reales del catalogo y ayudarte a agendar visita.',
      ],
      question: '¿En que distrito buscas y cual es tu rango de presupuesto?',
    });
  }

  if (/(asesor|humano|telefono|whatsapp|llamar|contactar)/.test(t)) {
    return buildStructuredReply({
      title: 'Perfecto, te conecto con un asesor humano',
      bullets: [
        `WhatsApp directo: ${waUrl}`,
        'Si deseas, tambien puedo adelantar tu perfil para una atencion mas rapida.',
      ],
      question: '¿Quieres que envie como prioridad tu operacion, distrito y presupuesto?',
    });
  }

  if (/(agendar|agenda|cita|visita|reunion|horario|disponibilidad)/.test(t)) {
    return buildStructuredReply({
      title: '📅 Perfecto, avancemos con tu cita',
      bullets: [
        'Nombre completo',
        'Celular',
        'Correo (opcional)',
        'Operacion: comprar, alquilar o vender',
        'Distrito de interes',
        `Si prefieres, tambien puedes coordinar por WhatsApp: ${waUrl}`,
      ],
      question: '¿Te parece si empezamos ahora?',
    });
  }

  if (isBuyDecisionQuery(t)) {
    return buildBuyDecisionReply({ waUrl });
  }

  if (isMarketAnalysisQuery(t)) {
    return buildMarketAnalysisReply({
      text,
      properties,
      waUrl,
    });
  }

  if (isShortAffirmation(t)) {
    const continuationReply = buildContextualContinuationReply({
      profile,
      lastAssistant,
      lastUser: text,
      waUrl,
    });

    if (continuationReply) {
      return continuationReply;
    }
  }

  if (profile === 'vendedor' && looksLikeSellerFeasibilityQuery(normalized)) {
    return buildSellerEvaluationReply({ text, waUrl });
  }

  if (profile === 'vendedor' && RULES_ONLY_MODE && isSellerGeneralIntent(normalized)) {
    return buildSellerValueReply({ waUrl });
  }

  if (profile === 'vendedor' && looksLikeOwnerPropertyDescription(normalized)) {
    return buildStructuredReply({
      title: 'Muy bien, ya tengo un avance de tu inmueble',
      bullets: [
        'El siguiente paso es valuacion comercial con asesor.',
        'Confirma direccion exacta, numero de ambientes y precio esperado.',
        `Atencion inmediata: ${waUrl}`,
      ],
      question: '¿Te parece si avanzamos con la valuacion hoy?',
    });
  }

  if (profile === 'agente' && isAgentCaptureIntent(normalized)) {
    return buildAgentCaptureReply({ waUrl });
  }

  if (profile === 'agente' && isAgentValueIntent(normalized)) {
    return buildAgentValueReply({ waUrl });
  }

  if (profile === 'agente' && looksLikeOwnerPropertyDescription(normalized)) {
    return buildStructuredReply({
      title: 'Perfecto, revisemos esta oportunidad comercial',
      bullets: [
        'Comparte tipo de inmueble, zona, operacion y precio.',
        'Con eso evaluamos encaje y estrategia comercial.',
        `Si prefieres, coordinamos directo con asesor: ${waUrl}`,
      ],
      question: '¿Quieres que lo evaluemos como prioridad esta semana?',
    });
  }

  if (isOutOfScopeQuery(t)) {
    const profileHint = profile === 'vendedor'
      ? 'si quieres vender, te explico como Habita acelera la comercializacion de tu inmueble.'
      : 'si buscas comprar o alquilar, te ayudo a filtrar por zona, presupuesto y tipo de propiedad.';
    return buildStructuredReply({
      title: 'Puedo ayudarte en temas inmobiliarios de Habita',
      bullets: [profileHint],
      question: '¿Quieres que te recomiende opciones segun tu objetivo?',
    });
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
    return RULES_ONLY_MODE ? buildSellerValueReply({ waUrl }) : null;
  }

  if (profile === 'agente') {
    return RULES_ONLY_MODE ? buildAgentValueReply({ waUrl }) : null;
  }

  // Comprador fallback: si llegó aquí, podría ser una pregunta sin estructura clara
  if (profile === 'comprador') {
    const isQuestion = t.endsWith('?');
    if (isQuestion && !isPropertySearchIntent(t)) {
      // Pregunta vaga o fuera de contexto - redirigir
      return buildStructuredReply({
        title: 'Estoy optimizado para temas de propiedades e inmuebles',
        bullets: [
          'Puedo ayudarte con búsqueda, filtros, información de inmuebles y coordinación de visitas.',
        ],
        question: '¿Quieres que te muestre opciones de compra o alquiler?',
      });
    }
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
  const intent = detectIntent(lastUserMessage);
  const uiPayload = buildUiPayload({
    text: lastUserMessage,
    properties: properties.length ? properties : contextProperties,
    profile: normalizedProfile,
  });

  // ANTI-LOOP: Check if exact same query was asked in last 2 turns (PRIORITY!)
  const recentUserQueries = messages
    .filter((m) => m.role === 'user')
    .slice(-3, -1)
    .map((m) => normalizeForComparison(m.content));
  const normalizedCurrentQuery = normalizeForComparison(lastUserMessage);
  const isExactRepeat = recentUserQueries.includes(normalizedCurrentQuery);

  if (isExactRepeat && profile === 'comprador') {
    return res.json({
      reply: buildDuplicateAvoidanceReply({
        attemptNum: Math.floor(messages.length / 2),
        waUrl,
      }),
      provider: 'duplicate-avoidance',
      bypassedLlm: true,
      intent,
      ui: uiPayload,
    });
  }

  const ruleReply = buildRuleBasedReply({
    text: lastUserMessage,
    profile: normalizedProfile,
    waUrl,
    properties,
    messages,
  });

  if (ruleReply) {
    return res.json({
      reply: ruleReply,
      provider: RULES_ONLY_MODE ? 'rules-only' : 'rule-based',
      bypassedLlm: true,
      intent,
      ui: uiPayload,
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
      intent,
      ui: uiPayload,
    });
  }

  const profilePrompt = getProfilePrompt(normalizedProfile);
  const promptCatalogMeta = `Total de propiedades cargadas: ${properties.length}. Propiedades enviadas al LLM: ${contextProperties.length}.`;
  const systemPrompt = `Eres Habby, el asistente virtual de Habita Perú, una agencia inmobiliaria especializada en la compra, venta y alquiler de inmuebles en Perú.

## ROL PROFESIONAL
Eres un asesor inmobiliario profesional de Habita. Tu foco es resolver consultas inmobiliarias con precisión comercial y técnica.
Tu trabajo es:
- asesorar a compradores, vendedores y agentes,
- informar con datos reales del catálogo,
- y convertir conversaciones en oportunidades (lead, cita o contacto con asesor).

## OBJETIVO DE NEGOCIO
1) Vender/alquilar con mejor calificación de interesados.
2) Informar con claridad, sin inventar información.
3) Captar leads y llevar a una acción concreta (WhatsApp, cita, datos de contacto).

## TONO
- Formal, amigable y directo.
- Español profesional, claro y natural.
- Evita relleno; responde con enfoque práctico y accionable.

## LIMITES OPERATIVOS
1) SOLO hablar de temas inmobiliarios (compra, venta, alquiler, inversión, valuación, documentación, mercado y procesos relacionados).
2) Si consultan algo fuera de inmobiliaria, redirigir con cortesía al ámbito inmobiliario.
3) NUNCA inventar propiedades, precios, áreas, metrajes, estados legales, fechas ni resultados de mercado.
4) Si un dato no está disponible en Habita, responder literalmente: "No especificado en habita.pe".
5) Si mencionas fuentes externas (SUNARP/INEI), úsalas como referencia y sin fabricar cifras.

## REGLAS ESTRICTAS (LOGICA Y RESTRICCIONES)
- Si la consulta es fuera de rubro: 1 línea de redirección + 1 pregunta inmobiliaria para retomar contexto.
- Si piden ficha puntual de inmueble: usar exclusivamente datos del catálogo y mantener el orden de ficha.
- Si faltan datos para responder bien: pedir máximo 2 datos concretos.
- Si hay ambigüedad entre varias propiedades: mostrar opciones y pedir confirmación.
- No entregar respuestas genéricas repetidas; usar el contexto de mensajes previos para continuar la conversación.
- **CRÍTICO: Si el usuario hace la misma pregunta o muy parecida a una anterior, NO repetir respuesta igual. Cambia el enfoque, pregunta diferente, o profundiza.**
- **Cada respuesta debe ser única. Lee TODA la conversación previa. Si ya respondiste algo parecido, reformula o pide más detalles.**

## FLUJO DE CONVERSACION DINAMICO
Paso 1: Identifica intención principal (comprar, vender, alquilar, analizar mercado, agendar, hablar con asesor).
Paso 2: Responde con valor (encabezado corto + bullets concretos con datos reales).
Paso 3: Cierra con una pregunta accionable orientada a avanzar el proceso.
Paso 4: Si detectas oportunidad comercial, invita de forma natural a contacto por WhatsApp o cita.

## PERFIL ACTUAL DEL USUARIO
${normalizedProfile}

${profilePrompt}

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

## FORMATO DE RESPUESTA
- Encabezado breve + 2 a 5 bullets + cierre con pregunta.
- Respuestas entre 80 y 140 palabras (hasta 220 en ficha detallada).
- En recomendaciones incluir: nombre, precio, ubicación, características y URL.
- Usa emojis con moderación y solo si aportan claridad (📍🏠💰📅).`;

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
        intent,
        ui: uiPayload,
      });
    }

    const normalizedReply = normalizeReplyPresentation({
      reply: result.reply,
      intent,
      waUrl,
    });

    // Detectar si es un bucle (respuesta duplicada)
    const isDuplicate = detectRecentDuplicateReply(normalizedReply, messages, 2);
    const finalReply = isDuplicate
      ? buildDuplicateAvoidanceReply({
          attemptNum: (result.attempts || []).length,
          waUrl,
        })
      : addVariationToReply(normalizedReply, (result.attempts || []).length);

    res.json({
      reply: finalReply,
      provider: isDuplicate ? 'duplicate-avoidance' : result.provider,
      fallbackAttempts: result.attempts || [],
      intent,
      ui: uiPayload,
    });

  } catch (err) {
    console.error('[Habby] Fetch error:', err);
    res.status(502).json({ error: 'Error de conexión. Intenta de nuevo.' });
  }
};