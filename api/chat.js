const { fetchProperties, propertiesToContext } = require('./properties');
const { generateChatReply, getLlmStatus } = require('./llm');

const WHATSAPP = process.env.WHATSAPP_NUMBER || '51999999999';

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    return res.json({
      ok: true,
      endpoint: 'POST /api/chat',
      llm: getLlmStatus(),
    });
  }
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Método no permitido.' });

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
- Cierra con una pregunta corta para seguir ayudando`;

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