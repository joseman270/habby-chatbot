const { fetchProperties, propertiesToContext } = require('./properties');

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
const WHATSAPP       = process.env.WHATSAPP_NUMBER || '51999999999';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Método no permitido.' });
  if (!CLAUDE_API_KEY) {
    return res.status(500).json({
      error: 'CLAUDE_API_KEY no configurada. Ve a Vercel → Settings → Environment Variables.'
    });
  }

  /* ── Leer mensajes ── */
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Se requiere el campo messages.' });
  }

  /* ── Sanitizar historial (máx 20 turnos) ── */
  const history = messages
    .slice(-20)
    .map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 1000).trim(),
    }))
    .filter(m => m.content);

  if (!history.length) {
    return res.status(400).json({ error: 'Mensaje vacío.' });
  }

  /* ── Obtener inmuebles (con cache) ── */
  let propertiesContext = 'No se pudieron cargar los inmuebles en este momento.';
  try {
    const props = await fetchProperties();
    propertiesContext = propertiesToContext(props);
  } catch (err) {
    console.warn('[Habby] No se pudo leer WP REST API:', err.message);
    /* El chat sigue funcionando aunque WP esté caído */
  }

  /* ── System prompt ── */
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
- Respuestas concisas pero completas — sin textos larguísimos
- Cuando recomiendas una propiedad, incluye siempre el link URL
- Si no hay propiedades que coincidan exactamente, sugiere las más cercanas y explica por qué

## REGLAS IMPORTANTES
1. SOLO hablas de inmuebles y temas relacionados (precios, zonas, proceso de compra/alquiler, documentos, etc.)
2. Si preguntan algo fuera del ámbito inmobiliario, redirige amablemente
3. NUNCA inventes propiedades, precios ni datos que no estén en el listado
4. Si no tienes la información exacta, sé honesto y deriva al asesor humano
5. Usa emojis con moderación — 📍🏠💰 son apropiados, no abuses

## CONTACTO DIRECTO CON ASESOR
Cuando el usuario quiera hablar con un asesor o agendar visita, usa este link de WhatsApp:
${waUrl}

## CATÁLOGO ACTUAL DE HABITA.PE
${propertiesContext}

## FORMATO
- Usa listas cortas cuando presentes múltiples propiedades
- Para cada propiedad: nombre, precio, ubicación, características clave y URL
- Cierra con una pregunta corta para seguir ayudando, cuando sea natural`;

  /* ── Llamada a Claude ── */
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     systemPrompt,
        messages:   history,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Habby] Claude API error:', data);
      return res.status(502).json({ error: data?.error?.message || 'Error de la API de Claude.' });
    }

    const reply = data.content?.[0]?.text || '';
    res.json({ reply });

  } catch (err) {
    console.error('[Habby] Fetch error:', err);
    res.status(502).json({ error: 'Error de conexión con la IA. Intenta de nuevo.' });
  }
};
