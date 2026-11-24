/**
 * THE SIMULATOR — plays thousands of buyers against the real API.
 *
 * Runs as its own process (npm run simulator) and picks up "Unleash"
 * jobs from a queue. Each fake buyer goes through the same HTTP routes a
 * real browser would: rate limiter, waiting room, reserve, pay. Nothing
 * is faked on the server side, so what the dashboard shows is real.
 *
 * The crowd is a mix:
 *   90% normal buyers  – join the line, wait, reserve, most of them pay
 *    5% spam bots      – fire 15 requests at once (should hit 429)
 *    5% line skippers  – call reserve directly (should hit 403)
 */
import { Worker } from 'bullmq';
import { Agent, fetch } from 'undici';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from './config.js';
import { redis } from './redis.js';
import { queueConnection } from './queue.js';
import { SIM_QUEUE, finishSimulation } from './services/simulations.js';
import { readMetrics, summarize } from './metrics.js';

// Reuse up to 500 keep-alive connections instead of opening one per request
const agent = new Agent({ connections: 500, keepAliveTimeout: 10_000 });
const API = config.apiUrl;

const rand = (min, max) => min + Math.random() * (max - min);

function fakeIp(n) {
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

async function runSimulation({ simulationId, dropId, buyers }) {
  const simKey = `sim:${simulationId}`;
  const deadline = Date.now() + config.sim.timeoutSeconds * 1000;
  const startedAt = Date.now();
  await redis.hset(simKey, { status: 'running', startedAt });

  // Count locally, flush to Redis 4x per second (same trick as metrics.js)
  let counts = {};
  const count = (field) => (counts[field] = (counts[field] ?? 0) + 1);
  const flush = async () => {
    const batch = counts;
    counts = {};
    const p = redis.pipeline();
    for (const [f, n] of Object.entries(batch)) p.hincrby(simKey, f, n);
    await p.exec();
  };
  const flusher = setInterval(flush, 250);

  async function call(method, path, body, ip) {
    try {
      const r = await fetch(`${API}${path}`, {
        method,
        dispatcher: agent,
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      count(`r:${r.status}`);
      return { httpStatus: r.status, ...data };
    } catch {
      count('r:error');
      return { httpStatus: 0, reason: 'network_error' };
    }
  }

  // ─── Buyer personalities ─────────────────────────────

  async function normalBuyer(userId, ip) {
    let r = await call('POST', `/drops/${dropId}/line`, { userId }, ip);

    while (r.status !== 'admitted') {
      if (Date.now() > deadline) return 'timed out';
      if (r.status === 'sold_out') return 'sold out while in line';
      if (r.status === 'not_in_line') return 'lost their turn';
      await sleep(r.httpStatus === 429 ? r.retryAfterMs : rand(900, 1500)); // poll like a browser tab
      r = await call('GET', `/drops/${dropId}/line/${userId}`, null, ip);
    }

    const hold = await call('POST', `/drops/${dropId}/reserve`, { userId }, ip);
    if (!hold.ok) return 'admitted, then missed out';

    if (Math.random() > 0.8) return 'walked away (hold expired)';
    await sleep(rand(300, 1500)); // "typing card details"
    const pay = await call('POST', `/drops/${dropId}/pay`, { userId }, ip);
    return pay.ok ? 'bought' : 'payment too late';
  }

  async function spamBot(userId, ip) {
    const burst = await Promise.all(
      Array.from({ length: 15 }, () => call('POST', `/drops/${dropId}/reserve`, { userId }, ip))
    );
    return burst.some((r) => r.ok) ? 'bot got through ❌' : 'bot blocked';
  }

  async function lineSkipper(userId, ip) {
    const r = await call('POST', `/drops/${dropId}/reserve`, { userId }, ip);
    return r.ok ? 'skipper got through ❌' : 'line skipper blocked';
  }

  // ─── Release the crowd ───────────────────────────────

  const crowd = Array.from({ length: buyers }, async (_, i) => {
    const roll = Math.random();
    const userId = `sim-${i + 1}`;
    const ip = fakeIp(i + 1);

    await sleep(rand(0, 2000)); // people don't all arrive in the same millisecond

    const outcome =
      roll < 0.05 ? await spamBot(userId, ip)
      : roll < 0.1 ? await lineSkipper(userId, ip)
      : await normalBuyer(userId, ip);

    count(`o:${outcome}`);
    count('finishedBuyers');
  });

  await Promise.all(crowd);
  clearInterval(flusher);
  await flush();

  // ─── Final report ────────────────────────────────────

  await sleep(1500); // let the last metrics flush and holds settle
  const stats = await fetch(`${API}/drops/${dropId}/stats`, { dispatcher: agent }).then((r) => r.json());
  const server = summarize(
    await readMetrics(Math.floor(startedAt / 1000), Math.floor(Date.now() / 1000))
  );

  return {
    buyers,
    durationSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
    stock: stats.initialStock,
    sold: stats.paid,
    oversold: stats.oversold,
    balanced: stats.balanced,
    totalRequests: server.totalRequests,
    peakRps: server.peakRps,
    p50: server.p50,
    p95: server.p95,
  };
}

const worker = new Worker(
  SIM_QUEUE,
  async (job) => {
    const { simulationId } = job.data;
    console.log(`[simulator] ▶ ${simulationId}: ${job.data.buyers} buyers for ${job.data.stock} items`);
    try {
      const report = await runSimulation(job.data);
      await finishSimulation(simulationId, { status: 'done', report: JSON.stringify(report) });
      console.log(`[simulator] ✔ ${simulationId}:`, report);
    } catch (err) {
      console.error(`[simulator] ✖ ${simulationId}:`, err);
      await finishSimulation(simulationId, { status: 'failed', error: err.message });
    }
  },
  { connection: queueConnection, concurrency: 1, lockDuration: (config.sim.timeoutSeconds + 30) * 1000 }
);

worker.on('ready', () => console.log(`[simulator] ready — sending buyers to ${API}`));

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
