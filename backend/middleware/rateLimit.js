// Lightweight in-memory sliding-window rate limiter. No external store is
// configured for this single-process app, so per-key timestamps live in
// memory for the life of the process - that's enough to blunt spam/abuse
// without adding a Redis dependency.
const buckets = new Map();

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
