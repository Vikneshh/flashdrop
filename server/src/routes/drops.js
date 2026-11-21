import { Router } from 'express';
import { Order } from '../models/Order.js';
import { redis, dropKeys } from '../redis.js';
import { createDrop, getDropStats } from '../services/drops.js';

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
 * "Pay" → turn the hold into a real order.
 * Payment is faked for now; the real payment provider comes later.
 */
dropsRouter.post('/:dropId/pay', requireUser, async (req, res) => {
  const { dropId } = req.params;
  const { userId } = req.body;
  const k = dropKeys(dropId);

  const result = await redis.confirmItem(k.stock, k.buyers, k.holds, userId);

  if (result === 0) return res.status(409).json({ ok: false, reason: 'no_active_hold' });
  if (result === -1) return res.status(410).json({ ok: false, reason: 'hold_expired' });

  // ⚠️ Known gap: if the server crashes right HERE, Redis says "sold" but
  // MongoDB has no order. Step 3 (queues) fixes exactly this.
  await Order.create({ productId: dropId, userId, mode: 'drop' });
  res.json({ ok: true });
});

dropsRouter.get('/:dropId/stats', async (req, res) => {
  const stats = await getDropStats(req.params.dropId);
  if (!stats) return res.status(404).json({ error: 'not_found' });
  res.json(stats);
});
