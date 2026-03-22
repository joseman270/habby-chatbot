

const WP_URL   = process.env.WP_URL || 'https://habita.pe';
const MAX_PROPS = parseInt(process.env.MAX_PROPERTIES || '20');

/* Cache en memoria — se renueva cada 15 minutos */
let cache = { data: null, ts: 0 };
const CACHE_TTL = 15 * 60 * 1000;

function cacheMeta() {
  return {
    cached: Boolean(cache.data),
    updatedAt: cache.ts ? new Date(cache.ts).toISOString() : null,
    ttlMs: CACHE_TTL,
    count: cache.data?.length || 0,
  };
}

async function fetchProperties(options = {}) {
  const { allowStaleOnError = true } = options;
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL) {
    return cache.data;
  }

  /* RealHomes expone el CPT "property" en el WP REST API */
  const url = `${WP_URL}/wp-json/wp/v2/propiedad?per_page=${MAX_PROPS}&status=publish&_embed=true`;

  let posts;
  try {
    const res  = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`WP REST API error: ${res.status}`);
    posts = await res.json();
  } catch (err) {
    if (allowStaleOnError && cache.data) {
      console.warn('[Habby] Usando cache stale de propiedades por error de WP:', err.message);
      return cache.data;
    }
    throw err;
  }

  const properties = posts.map(p => {
    const meta = p.meta || {};
    const emb  = p._embedded || {};

    /* Precio */
    const price     = meta.REAL_HOMES_property_price        || '';
    const pricePost = meta.REAL_HOMES_property_price_postfix || 'USD';
    const priceStr  = price
      ? Number(price).toLocaleString('es-PE') + ' ' + pricePost
      : 'Consultar';

    /* Ubicación */
    const address = meta.REAL_HOMES_property_address || meta.REAL_HOMES_property_map || '';

    /* Características */
    const beds     = meta.REAL_HOMES_property_bedrooms  || '—';
    const baths    = meta.REAL_HOMES_property_bathrooms || '—';
    const garages  = meta.REAL_HOMES_property_garage    || '0';
    const size     = meta.REAL_HOMES_property_size      || '';
    const sizeUnit = meta.REAL_HOMES_property_size_postfix || 'm²';
    const area     = size ? `${size} ${sizeUnit}` : 'N/D';

    /* Taxonomías embebidas */
    const terms   = emb['wp:term'] ? emb['wp:term'].flat() : [];
    const getTerms = taxonomy => terms
      .filter(t => t.taxonomy === taxonomy)
      .map(t => t.name)
      .join(', ');

    const type    = getTerms('property-type')    || 'Propiedad';
    const status  = getTerms('property-status')  || 'Disponible';
    const city    = getTerms('property-city')    || '';
    const features = getTerms('property-feature') || '';

    /* Descripción corta */
    const excerpt = p.excerpt?.rendered
      ? p.excerpt.rendered.replace(/<[^>]+>/g, '').trim().slice(0, 200)
      : '';

    return {
      id:       p.id,
      title:    p.title?.rendered || 'Sin título',
      url:      p.link,
      type,
      status,
      price:    priceStr,
      address,
      city,
      beds,
      baths,
      garages,
      area,
      features,
      excerpt,
    };
  });

  cache = { data: properties, ts: now };
  return properties;
}

/* Convierte el array de propiedades a texto para el contexto de Claude */
function propertiesToContext(properties) {
  if (!properties.length) return 'No hay inmuebles disponibles en este momento.';

  const lines = ['=== INMUEBLES DISPONIBLES EN HABITA.PE ===\n'];

  properties.forEach(p => {
    const block = [
      `📍 [${p.type}] ${p.title}`,
      `   Estado:      ${p.status}`,
      `   Precio:      ${p.price}`,
      `   Ubicación:   ${p.address}${p.city ? ` (${p.city})` : ''}`,
      `   Dorm: ${p.beds}  |  Baños: ${p.baths}  |  Garajes: ${p.garages}  |  Área: ${p.area}`,
    ];
    if (p.features) block.push(`   Extras:      ${p.features}`);
    if (p.excerpt)  block.push(`   Descripción: ${p.excerpt}`);
    block.push(`   URL:         ${p.url}`);
    lines.push(block.join('\n'));
  });

  return lines.join('\n\n---\n\n');
}

/* ── Vercel serverless handler ── */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const props = await fetchProperties();
    res.json({ count: props.length, cache: cacheMeta(), properties: props });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

module.exports.fetchProperties     = fetchProperties;
module.exports.propertiesToContext = propertiesToContext;
module.exports.getPropertiesCacheMeta = cacheMeta;
