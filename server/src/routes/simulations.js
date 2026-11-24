import { Router } from 'express';
import { config } from '../config.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { startSimulation, getSimulation } from '../services/simulations.js';

export const simulationsRouter = Router();

// One simulation per IP every 30 seconds (on top of the global "one at a time" lock)
const simLimit = rateLimit({ name: 'sim', capacity: 1, perSecond: 1 / 30, key: (req) => req.ip });

const clamp = (n, min, max) => Math.min(max, Math.max(min, Math.round(Number(n) || 0)));

/**
 * The Unleash button.
 * POST /simulations { buyers: 2000, stock: 300, chaos: false }
 */
simulationsRouter.post('/', simLimit, async (req, res) => {
  const buyers = clamp(req.body?.buyers ?? 2000, 100, config.sim.maxBuyers);
  const stock = clamp(req.body?.stock ?? 300, 10, Math.min(config.sim.maxStock, buyers));
  const chaos = Boolean(req.body?.chaos);

  const result = await startSimulation({ buyers, stock, chaos });

  if (result.error === 'already_running') {
    return res.status(409).json({ ok: false, reason: 'already_running', message: 'A simulation is already running — watch it live!' });
  }
  if (result.error === 'cooldown') {
    return res.status(429).json({ ok: false, reason: 'cooldown', retryAfterSeconds: result.retryAfterSeconds });
  }
  res.status(202).json({ ok: true, ...result, buyers, stock, chaos });
});

simulationsRouter.get('/current', async (req, res) => {
  res.json(await getSimulation());
});

simulationsRouter.get('/limits', (req, res) => {
  res.json({ maxBuyers: config.sim.maxBuyers, maxStock: config.sim.maxStock });
});
