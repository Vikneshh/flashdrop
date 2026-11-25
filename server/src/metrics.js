import { redis } from './redis.js';
import { config } from './config.js';

/**
 * REQUEST METRICS — requests/second and latency percentiles.
 *
 * Recording every request straight into Redis would double our Redis
 * traffic. Instead each server counts in memory and flushes every 250ms
 * with one pipelined batch. Counters go into one Redis hash per second
 * (metrics:<unix second>), so with many API servers the numbers simply
 * add up.
 *
 * Latency is stored as a HISTOGRAM: "how many requests took ≤5ms, ≤10ms,
 * ≤25ms ...". You can't add up percentiles from different servers, but you
 * can add up histograms and compute p50/p95 from the total.
 */
const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]; // ms upper bounds (+ 'inf')
const TRACKED = /^\/drops\/[^/]+\/(line|reserve|pay|orders)/; // buyer-facing routes only

const pending = new Map(); // second -> { field: count }

function bump(sec, field) {
  let m = pending.get(sec);
  if (!m) pending.set(sec, (m = {}));
  m[field] = (m[field] ?? 0) + 1;
}

export function metricsMiddleware(req, res, next) {
  if (!TRACKED.test(req.path)) return next();

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const sec = Math.floor(Date.now() / 1000);
    const bucket = BUCKETS.find((b) => ms <= b) ?? 'inf';
    bump(sec, 'req');
    bump(sec, `i:${config.instanceId}`); // which server handled it (step 6)
    bump(sec, `s${res.statusCode}`);
    bump(sec, `lat_${bucket}`);
  });
  next();
}

export function startMetricsFlusher(intervalMs = 250) {
  setInterval(async () => {
    if (!pending.size) return;
    const batch = [...pending];
    pending.clear();

    const p = redis.pipeline();
    for (const [sec, fields] of batch) {
      const key = `metrics:${sec}`;
      for (const [field, n] of Object.entries(fields)) p.hincrby(key, field, n);
      p.expire(key, 900); // keep 15 minutes of history
    }
    await p.exec().catch((err) => console.error('[metrics] flush failed:', err.message));
  }, intervalMs);
}

/** p-th percentile (0..1) from a histogram { bucket: count } */
export function percentile(hist, total, p) {
  if (!total) return 0;
  let seen = 0;
  for (const b of [...BUCKETS, 'inf']) {
    seen += hist[b] ?? 0;
    if (seen >= total * p) return b === 'inf' ? BUCKETS.at(-1) * 2 : b;
  }
  return 0;
}

/** Per-second points for [fromSec, toSec], oldest first. */
export async function readMetrics(fromSec, toSec) {
  const secs = [];
  for (let s = fromSec; s <= toSec; s++) secs.push(s);

  const p = redis.pipeline();
  secs.forEach((s) => p.hgetall(`metrics:${s}`));
  const rows = await p.exec();

  return secs.map((t, i) => {
    const raw = rows[i][1] ?? {};
    const hist = {};
    const codes = {};
    const servers = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('lat_')) hist[k.slice(4)] = Number(v);
      else if (k.startsWith('i:')) servers[k.slice(2)] = Number(v);
      else if (k.startsWith('s')) codes[k.slice(1)] = Number(v);
    }
    const rps = Number(raw.req ?? 0);
    return { t, rps, p50: percentile(hist, rps, 0.5), p95: percentile(hist, rps, 0.95), codes, servers, hist };
  });
}

/** Combine many seconds into one summary (used for the final report). */
export function summarize(points) {
  const hist = {};
  const servers = {};
  let total = 0;
  let peakRps = 0;
  for (const pt of points) {
    total += pt.rps;
    peakRps = Math.max(peakRps, pt.rps);
    for (const [b, n] of Object.entries(pt.hist)) hist[b] = (hist[b] ?? 0) + n;
    for (const [s, n] of Object.entries(pt.servers ?? {})) servers[s] = (servers[s] ?? 0) + n;
  }
  return { totalRequests: total, peakRps, p50: percentile(hist, total, 0.5), p95: percentile(hist, total, 0.95), servers };
}
