
const WP_URL = process.env.WP_URL || 'https://habita.pe';
const MAX_PROPS = parseInt(process.env.MAX_PROPERTIES || '20', 10);
const PROPERTY_CONTEXT_MAX_ITEMS = parseInt(process.env.PROPERTY_CONTEXT_MAX_ITEMS || '6', 10);
const NO_DATA = 'No especificado en habita.pe';

// Cache en memoria: se renueva cada 15 minutos.
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

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pickFirst(meta, keys, fallback = '') {
  for (const key of keys) {
    const raw = meta?.[key];
    if (raw === undefined || raw === null) continue;

    if (Array.isArray(raw)) {
      const first = raw.find((item) => String(item || '').trim());
      if (first !== undefined) return String(first).trim();
      continue;
    }

    const value = String(raw).trim();
    if (value) return value;
  }
  return fallback;
}

function parseNumber(value) {
  const normalized = String(value || '').replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function formatPrice(priceRaw, currencyRaw) {
  const currency = String(currencyRaw || 'USD').trim() || 'USD';
  const priceNumber = parseNumber(priceRaw);

  if (priceNumber !== null) {
    return `${priceNumber.toLocaleString('es-PE')} ${currency}`;
  }

  const plain = String(priceRaw || '').trim();
  if (!plain) return 'Consultar';
  return `${plain} ${currency}`.trim();
}

function formatArea(valueRaw, unitRaw, fallbackUnit = 'm2') {
  const value = String(valueRaw || '').trim();
  if (!value) return NO_DATA;
  const unit = String(unitRaw || fallbackUnit).trim() || fallbackUnit;
  return `${value} ${unit}`;
}

function getDocumentationSummary(meta, textBlob) {
  const explicit = pickFirst(meta, [
    'REAL_HOMES_property_documentation',
    'REAL_HOMES_property_legal_status',
    'REAL_HOMES_property_title_type',
    'habita_property_documentation',
    'property_documentation',
    'property_title',
  ], '');
  if (explicit) return explicit;

  const text = normalizeSearch(textBlob);
  const flags = [];

  if (text.includes('sunarp')) flags.push('menciona SUNARP');
  if (text.includes('titulado')) flags.push('menciona titulo');
  if (text.includes('saneado')) flags.push('menciona saneamiento');
  if (text.includes('independizado')) flags.push('menciona independizacion');
  if (text.includes('papeles en regla')) flags.push('menciona papeles en regla');
  if (text.includes('habilitacion urbana')) flags.push('menciona habilitacion urbana');

  if (!flags.length) return NO_DATA;
  return `Publicacion ${flags.join(', ')}.`;
}

function getTerms(embeddedTerms, taxonomy) {
  return embeddedTerms
    .filter((term) => term.taxonomy === taxonomy)
    .map((term) => term.name)
    .join(', ');
}

async function fetchProperties(options = {}) {
  const { allowStaleOnError = true } = options;
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL) {
    return cache.data;
  }

  // RealHomes expone el CPT "propiedad" via WP REST API.
  const url = `${WP_URL}/wp-json/wp/v2/propiedad?per_page=${MAX_PROPS}&status=publish&_embed=true`;

  let posts;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`WP REST API error: ${res.status}`);
    posts = await res.json();
  } catch (err) {
    if (allowStaleOnError && cache.data) {
      console.warn('[Habby] Usando cache stale de propiedades por error de WP:', err.message);
      return cache.data;
    }
    throw err;
  }

  const properties = posts.map((post) => {
    const meta = post.meta || {};
    const emb = post._embedded || {};
    const terms = emb['wp:term'] ? emb['wp:term'].flat() : [];

    const title = stripHtml(post.title?.rendered || 'Sin titulo');
    const excerpt = stripHtml(post.excerpt?.rendered || '').slice(0, 260);
    const description = stripHtml(post.content?.rendered || '').slice(0, 950);

    const priceRaw = pickFirst(meta, ['REAL_HOMES_property_price'], '');
    const priceCurrency = pickFirst(meta, ['REAL_HOMES_property_price_postfix'], 'USD');
    const price = formatPrice(priceRaw, priceCurrency);

    const address = pickFirst(meta, ['REAL_HOMES_property_address', 'REAL_HOMES_property_map'], '');
    const beds = pickFirst(meta, ['REAL_HOMES_property_bedrooms'], NO_DATA);
    const baths = pickFirst(meta, ['REAL_HOMES_property_bathrooms'], NO_DATA);
    const garages = pickFirst(meta, ['REAL_HOMES_property_garage'], NO_DATA);

    const builtAreaValue = pickFirst(meta, ['REAL_HOMES_property_size', 'REAL_HOMES_property_building_size'], '');
    const builtAreaUnit = pickFirst(meta, ['REAL_HOMES_property_size_postfix', 'REAL_HOMES_property_building_size_postfix'], 'm2');
    const builtArea = formatArea(builtAreaValue, builtAreaUnit, 'm2');

    const landAreaValue = pickFirst(meta, ['REAL_HOMES_property_lot_size', 'REAL_HOMES_property_land_area', 'REAL_HOMES_property_plot_area'], '');
    const landAreaUnit = pickFirst(meta, ['REAL_HOMES_property_lot_size_postfix', 'REAL_HOMES_property_land_area_postfix', 'REAL_HOMES_property_plot_area_postfix'], 'm2');
    const landArea = formatArea(landAreaValue, landAreaUnit, 'm2');

    let areaTotal = NO_DATA;
    if (landAreaValue && builtAreaValue) {
      areaTotal = `${landArea} terreno | ${builtArea} construida`;
    } else if (landAreaValue) {
      areaTotal = landArea;
    } else if (builtAreaValue) {
      areaTotal = builtArea;
    }

    const type = getTerms(terms, 'property-type') || 'Propiedad';
    const status = getTerms(terms, 'property-status') || 'Disponible';
    const city = getTerms(terms, 'property-city') || '';
    const features = getTerms(terms, 'property-feature') || '';

    const documentation = getDocumentationSummary(
      meta,
      `${title} ${excerpt} ${description} ${features}`,
    );

    return {
      id: post.id,
      slug: post.slug || '',
      title,
      url: post.link,
      type,
      status,
      price,
      priceRaw,
      priceCurrency,
      address,
      city,
      beds,
      baths,
      garages,
      areaBuilt: builtArea,
      areaLand: landArea,
      areaTotal,
      features,
      documentation,
      excerpt,
      description,
    };
  });

  cache = { data: properties, ts: now };
  return properties;
}

function propertiesToContext(properties, options = {}) {
  if (!properties.length) return 'No hay inmuebles disponibles en este momento.';

  const maxItemsRaw = Number.parseInt(String(options.maxItems || PROPERTY_CONTEXT_MAX_ITEMS), 10);
  const maxItems = Number.isFinite(maxItemsRaw) && maxItemsRaw > 0 ? maxItemsRaw : PROPERTY_CONTEXT_MAX_ITEMS;
  const selected = properties.slice(0, maxItems);

  const lines = [`=== INMUEBLES DISPONIBLES EN HABITA.PE (contexto ${selected.length}/${properties.length}) ===`, ''];

  selected.forEach((property, idx) => {
    const place = [property.city, property.address].filter(Boolean).join(' - ') || NO_DATA;
    const block = [
      `[PROP-${idx + 1}] ${property.title}`,
      `Tipo / Estado: ${property.type} / ${property.status}`,
      `Precio: ${property.price}`,
      `Ubicacion: ${place}`,
      `Area total: ${property.areaTotal}`,
      `Area de terreno: ${property.areaLand}`,
      `Area construida: ${property.areaBuilt}`,
      `Dormitorios: ${property.beds} | Banos: ${property.baths} | Garajes: ${property.garages}`,
      `Documentacion / titulos: ${property.documentation}`,
    ];

    if (property.features) block.push(`Caracteristicas: ${property.features}`);
    if (property.excerpt) block.push(`Resumen: ${property.excerpt}`);
    block.push(`URL: ${property.url}`);
    lines.push(block.join('\n'));
  });

  return lines.join('\n\n---\n\n');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const props = await fetchProperties();
    res.json({ count: props.length, cache: cacheMeta(), properties: props });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

module.exports.fetchProperties = fetchProperties;
module.exports.propertiesToContext = propertiesToContext;
module.exports.getPropertiesCacheMeta = cacheMeta;
