import { Router } from 'express';
import { Order } from '../models/Order.js';
import { redis, dropKeys, dropOps } from '../redis.js';
import { createDrop, getDropStats } from '../services/drops.js';
import { enqueueOrder } from '../queue.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';

export const dropsRouter = Router();

// ─── Middleware ──────────────────────────────────────────

const requireUser = (req, res, next) =>
  req.body?.userId ? next() : res.status(400).json({ ok: false, reason: 'userId_required' });

// Per IP, shared across every buyer route. Stops one machine from flooding us,
// even if it invents a new userId for every request.
const ipLimit = rateLimit({ name: 'ip', ...config.rateLimit.ip, key: (req) => req.ip });

// Per user, per action. Polling your queue position doesn't use up your "reserve" budget.
const userLimit = (action) =>
  rateLimit({
    name: `user:${action}`,
    ...config.rateLimit.user,
    key: (req) => req.body?.userId ?? req.params.userId,
  });

// ─── Routes ──────────────────────────────────────────────

/**
 * Create a new drop.
 * POST /drops { stock, holdSeconds, waitingRoom, admitRate, admitWindowSeconds }
 * (Admin-only in a real app — auth comes later.)
 */
dropsRouter.post('/', async (req, res) => {
  const b = req.body ?? {};
  const product = await createDrop({
    stock: Number(b.stock ?? 100),
    holdSeconds: Number(b.holdSeconds ?? 120),
    waitingRoom: Boolean(b.waitingRoom),
    admitRate: Number(b.admitRate ?? 100),
    admitWindowSeconds: Number(b.admitWindowSeconds ?? 60),
  });
  res.status(201).json({ dropId: product._id, stock: product.initialStock, holdSeconds: product.holdSeconds });
});

/**
 * Join the waiting room → get your place in line.
 */
dropsRouter.post('/:dropId/line', ipLimit, userLimit('line'), requireUser, async (req, res) => {
  const [code, value] = await dropOps.join(req.params.dropId, req.body.userId);

  if (code === 1) return res.json({ ok: true, status: 'waiting', position: value });
  if (code === 2) return res.json({ ok: true, status: 'admitted', expiresAt: value });
  if (code === 3) return res.status(409).json({ ok: false, status: 'sold_out' });
  if (code === 4) return res.status(409).json({ ok: false, status: 'already_has_item' });
  return res.status(404).json({ ok: false, reason: 'drop_not_found' });
});

/**
 * "Where am I in line?" — the waiting-room screen polls this.
 * (Step 6 replaces polling with live Socket.IO updates.)
 */
dropsRouter.get('/:dropId/line/:userId', ipLimit, userLimit('line-status'), async (req, res) => {
  const [code, value, admitRate] = await dropOps.status(req.params.dropId, req.params.userId);

  if (code === 1) {
    return res.json({
      status: 'waiting',
      position: value,
      estimatedWaitSeconds: Math.ceil(value / admitRate),
    });
  }
  if (code === 2) return res.json({ status: 'admitted', expiresAt: value });
  if (code === 3) return res.json({ status: 'sold_out' });
  if (code === 0) return res.status(404).json({ status: 'not_in_line' });
  return res.status(404).json({ reason: 'drop_not_found' });
});

/**
 * Click "Buy" → try to HOLD an item.
 * One Redis call, no MongoDB at all, so this stays fast under a stampede.
 */
dropsRouter.post('/:dropId/reserve', ipLimit, userLimit('reserve'), requireUser, async (req, res) => {
  const result = await dropOps.reserve(req.params.dropId, req.body.userId);

  if (result > 0) return res.json({ ok: true, expiresAt: result });
  if (result === 0) return res.status(409).json({ ok: false, reason: 'sold_out' });
  if (result === -1) return res.status(409).json({ ok: false, reason: 'already_reserved' });
  if (result === -3) return res.status(403).json({ ok: false, reason: 'not_admitted' });
  return res.status(404).json({ ok: false, reason: 'drop_not_found' });
});

/**
 * "Pay" → lock in the sale, then hand the slow work to the queue.
 *
 * 1. Redis confirms atomically (and records the user in the "paid" set)
 * 2. We drop a job on the queue
 * 3. We answer immediately with 202 Accepted: "got it, processing"
 *
 * The API never waits for MongoDB, payment or email, so it stays fast
 * no matter how slow those are. Payment is faked for now.
 */
dropsRouter.post('/:dropId/pay', ipLimit, userLimit('pay'), requireUser, async (req, res) => {
  const { dropId } = req.params;
  const { userId } = req.body;

  const result = await dropOps.confirm(dropId, userId);

  if (result === 0) return res.status(409).json({ ok: false, reason: 'no_active_hold' });
  if (result === -1) return res.status(410).json({ ok: false, reason: 'hold_expired' });

  // If we crash between the line above and this one, the reconciler
  // will notice "paid but no order" and queue it for us.
  await enqueueOrder(dropId, userId);
  res.status(202).json({ ok: true, status: 'processing' });
});

/**
 * "Where's my order?" — the frontend can poll this after paying.
 *   confirmed  = saved in MongoDB, all done
 *   processing = paid, worker hasn't finished yet
 *   none       = this user hasn't paid
 */
dropsRouter.get('/:dropId/orders/:userId', ipLimit, async (req, res) => {
  const { dropId, userId } = req.params;

  if (await Order.exists({ productId: dropId, userId })) return res.json({ status: 'confirmed' });
  if (await redis.sismember(dropKeys(dropId).paid, userId)) return res.json({ status: 'processing' });
  res.status(404).json({ status: 'none' });
});

dropsRouter.get('/:dropId/stats', async (req, res) => {
  const stats = await getDropStats(req.params.dropId);
  if (!stats) return res.status(404).json({ error: 'not_found' });
  res.json(stats);
});
