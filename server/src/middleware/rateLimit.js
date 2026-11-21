import { redis } from '../redis.js';

/**
 * Rate-limit middleware backed by a Redis token bucket (see tokenBucket.lua).
 *
 * Because the bucket lives in Redis (not in this server's memory), the
 * limit holds across ALL API servers: a bot can't get 3x the limit by
 * hitting 3 servers behind the load balancer.
 *
 *   name       – which bucket family, e.g. 'ip' or 'reserve'
 *   capacity   – max burst
 *   perSecond  – steady refill rate
 *   key(req)   – who is this? (IP, userId...). Return nothing to skip.
 */
export const rateLimit = ({ name, capacity, perSecond, key }) =>
  async function rateLimiter(req, res, next) {
    const id = key(req);
    if (!id) return next();

    const [allowed, retryAfterMs] = await redis.tokenBucket(`rl:${name}:${id}`, capacity, perSecond);
    if (allowed) return next();

    res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
    res.status(429).json({ ok: false, reason: 'rate_limited', retryAfterMs });
  };
