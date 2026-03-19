const { fetchProperties, propertiesToContext } = require('./properties');

const WHATSAPP = process.env.WHATSAPP_NUMBER || '51999999999';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Método no permitido.' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY no configurada en Vercel.' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Se requiere el campo messages.' });
  }

  const history = messages
    .slice(-20)
    .map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 1000).trim(),
    }))
    .filter(m => m.content);

  if (!history.length) return res.status(400).json({ error: 'Mensaje vacío.' });

  let propertiesContext = 'No se pudieron cargar los inmuebles en este momento.';
  try {
    const props = await fetchProperties();
    propertiesContext = propertiesToContext(props);
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
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 1024,
        messages:   [
          { role: 'system', content: systemPrompt },
          ...history,
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const rawError = data?.error?.message || 'Error de Groq.';
      const lower = String(rawError).toLowerCase();
      const isCreditIssue = /credit|saldo|insufficient|payment|required/.test(lower);
      const userMessage = isCreditIssue
        ? `El servicio de IA está temporalmente sin saldo. Puedes hablar con un asesor aquí: ${waUrl}`
        : rawError;

      console.error('[Habby] Groq error:', data);
      return res.status(502).json({ error: userMessage });
    }

    const reply = data.choices?.[0]?.message?.content || '';
    res.json({ reply });

  } catch (err) {
    console.error('[Habby] Fetch error:', err);
    res.status(502).json({ error: 'Error de conexión. Intenta de nuevo.' });
  }
};