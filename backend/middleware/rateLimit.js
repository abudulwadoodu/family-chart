// Lightweight in-memory sliding-window rate limiter. No external store is
// configured for this single-process app, so per-key timestamps live in
// memory for the life of the process - that's enough to blunt spam/abuse
// without adding a Redis dependency.
const buckets = new Map();

// Test-only: routes keyed by req.ip (e.g. public/unauthenticated endpoints)
// otherwise accumulate hits across every test in the same process, since
// supertest requests all share one loopback IP. Authenticated routes don't
// need this - each test there already uses a distinct user id as the key.
export function resetRateLimits() {
  buckets.clear();
}

export function rateLimit({ windowMs, max, keyFn = (req) => req.user?.id }) {
  return (req, res, next) => {
    const key = keyFn(req);
    if (!key) return next();

    const now = Date.now();
    const timestamps = (buckets.get(key) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= max) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
    }

    timestamps.push(now);
    buckets.set(key, timestamps);
    return next();
  };
}
