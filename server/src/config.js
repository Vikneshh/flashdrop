// Render passes other services' addresses as bare hostnames ("x.onrender.com")
const withScheme = (url) => (/^https?:\/\//.test(url) ? url : `https://${url}`);

// Cloudflare's published proxy ranges (cloudflare.com/ips). Render sits behind
// Cloudflare, so the request reaches us as: visitor → Cloudflare → Render → app.
// Trusting these ranges lets Express pick the visitor's IP from X-Forwarded-For.
const CLOUDFLARE_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
  '2a06:98c0::/29', '2c0f:f248::/32',
];
// TRUST_PROXY="loopback, uniquelocal, cloudflare" → the word "cloudflare" expands to the ranges above
const parseTrustProxy = (value) =>
  value.split(',').map((s) => s.trim()).filter(Boolean).flatMap((s) => (s === 'cloudflare' ? CLOUDFLARE_RANGES : [s]));

// All settings in one place. Values come from environment variables,
// with defaults that work for local development.
export const config = {
  port: Number(process.env.PORT ?? 4000),
  isProduction: process.env.NODE_ENV === 'production',
  // Protects admin routes (create/reset drops). Required in production, optional in local dev.
  adminToken: process.env.ADMIN_TOKEN ?? '',
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
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY ?? 'loopback'),

  // Name of this API server (step 6) — shows up in metrics and the X-Served-By header
  instanceId: process.env.INSTANCE_ID ?? `api-${process.pid}`,

  // Live dashboard (step 5)
  corsOrigin: withScheme(process.env.CORS_ORIGIN ?? 'http://localhost:5174'), // where the dashboard is served from
  apiUrl: process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,         // where the simulator sends its fake buyers

  // "Unleash the buyers" simulator — caps protect our free server from strangers
  sim: {
    maxBuyers: Number(process.env.SIM_MAX_BUYERS ?? 5000),
    maxStock: Number(process.env.SIM_MAX_STOCK ?? 1000),
    timeoutSeconds: 120,  // stop a simulation that runs longer than this
    cooldownSeconds: 10,  // pause between simulations
  },
};
