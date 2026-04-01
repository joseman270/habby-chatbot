function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
  const buckets = new Map();

  return function checkRateLimit(req) {
    const now = Date.now();
    const ip = getClientIp(req);
    const key = `${ip}:${req.method}:${req.url}`;

    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
    }

    if (current.count >= max) {
      return { allowed: false, remaining: 0, resetAt: current.resetAt };
    }

    current.count += 1;
    return { allowed: true, remaining: max - current.count, resetAt: current.resetAt };
  };
}

module.exports = {
  createRateLimiter,
};