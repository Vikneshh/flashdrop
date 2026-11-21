// All settings in one place. Values come from environment variables,
// with defaults that work for local development.
export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://localhost:27017/flashdrop',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  // Worker settings (step 3)
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 10), // jobs processed in parallel per worker
  workerDelayMs: Number(process.env.WORKER_DELAY_MS ?? 100),       // pretend "payment capture + email" takes this long
  workerFailRate: Number(process.env.WORKER_FAIL_RATE ?? 0),       // 0.3 = 30% of attempts fail on purpose (chaos testing)

  // Rate limits (step 4): token buckets — burst up to `capacity`, steady `perSecond`
  rateLimit: {
    ip: { capacity: 100, perSecond: 50 }, // per IP address, across all buyer routes
    user: { capacity: 5, perSecond: 2 },  // per user, per action (join / poll / reserve / pay)
  },

  /**
   * Which proxies to trust for the real client IP (X-Forwarded-For header).
   * 'loopback' = only trust it when the request comes from this machine,
   * e.g. our demo scripts, or Nginx later. A random client on the internet
   * can't fake their IP by sending the header themselves.
   */
  trustProxy: process.env.TRUST_PROXY ?? 'loopback',
};
