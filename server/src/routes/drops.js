import { Router } from 'express';
import { Order } from '../models/Order.js';
import { redis, dropKeys } from '../redis.js';
import { createDrop, getDropStats } from '../services/drops.js';
import { enqueueOrder } from '../queue.js';

export const dropsRouter = Router();

const requireUser = (req, res, next) =>
  req.body?.userId ? next() : res.status(400).json({ ok: false, reason: 'userId_required' });

// Create a new drop: POST /drops { stock: 100, holdSeconds: 120 }
dropsRouter.post('/', async (req, res) => {
  const product = await createDrop({
    stock: Number(req.body?.stock ?? 100),
    holdSeconds: Number(req.body?.holdSeconds ?? 120),
  });
  res.status(201).json({ dropId: product._id, stock: product.initialStock, holdSeconds: product.holdSeconds });
});

/**
 * Click "Buy" → try to HOLD an item.
 * One Redis call, no MongoDB at all, so this stays fast under a stampede.
 */
dropsRouter.post('/:dropId/reserve', requireUser, async (req, res) => {
  const k = dropKeys(req.params.dropId);
  const result = await redis.reserveItem(k.stock, k.buyers, k.holds, k.holdMs, req.body.userId);

  if (result > 0) return res.json({ ok: true, expiresAt: result });
  if (result === 0) return res.status(409).json({ ok: false, reason: 'sold_out' });
  if (result === -1) return res.status(409).json({ ok: false, reason: 'already_reserved' });
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
dropsRouter.post('/:dropId/pay', requireUser, async (req, res) => {
  const { dropId } = req.params;
  const { userId } = req.body;
  const k = dropKeys(dropId);

  const result = await redis.confirmItem(k.stock, k.buyers, k.holds, k.paid, userId);

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
dropsRouter.get('/:dropId/orders/:userId', async (req, res) => {
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
