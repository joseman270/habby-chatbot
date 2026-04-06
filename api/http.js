const DEFAULT_ALLOWED_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || '*')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (DEFAULT_ALLOWED_ORIGINS.includes('*')) return true;
  return DEFAULT_ALLOWED_ORIGINS.includes(origin);
}

function applyCors(req, res, methods) {
  const origin = req.headers.origin;
  const allowed = isOriginAllowed(origin);

  if (DEFAULT_ALLOWED_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return allowed;
}

module.exports = {
  applyCors,
};