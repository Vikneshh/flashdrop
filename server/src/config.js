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
   * 'loopback'    = requests from this machine (our demo scripts in local dev)
   * 'uniquelocal' = private network addresses (Nginx + the simulator inside Docker)
   * Express walks X-Forwarded-For from the right and stops at the first
   * address it does NOT trust, so a visitor on the internet can't fake their
   * IP: Nginx appends their real public IP, and that's where the walk stops.
   */
  trustProxy: process.env.TRUST_PROXY ?? 'loopback',

  // Name of this API server (step 6) — shows up in metrics and the X-Served-By header
  instanceId: process.env.INSTANCE_ID ?? `api-${process.pid}`,

  // Live dashboard (step 5)
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5174', // where the dashboard is served from
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',         // where the simulator sends its fake buyers

  // "Unleash the buyers" simulator — caps protect our free server from strangers
  sim: {
    maxBuyers: Number(process.env.SIM_MAX_BUYERS ?? 5000),
    maxStock: 1000,
    timeoutSeconds: 120,  // stop a simulation that runs longer than this
    cooldownSeconds: 10,  // pause between simulations
  },
};
