const { fetchProperties, propertiesToContext } = require('./properties');
const { generateChatReply, getLlmStatus } = require('./llm');

const WHATSAPP = process.env.WHATSAPP_NUMBER || '51999999999';

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

  const { messages } = req.body;
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
  const systemPrompt = `Eres Habby, el asistente virtual de Habita Perú, una agencia inmobiliaria especializada en la compra, venta y alquiler de inmuebles en Perú.

## TU ROL
Eres un asesor inmobiliario experto, amigable y profesional. Ayudas a las personas a:
- Encontrar el inmueble ideal según sus necesidades y presupuesto
- Entender el proceso de compra, venta o alquiler en Perú
- Conocer los detalles de propiedades específicas del catálogo
- Conectar con asesores humanos cuando sea necesario

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