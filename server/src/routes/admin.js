import { Router } from 'express';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { createDrop } from '../services/drops.js';
import { redis, dropKeys } from '../redis.js';

export const adminRouter = Router();

// Start a fresh drop (used by the step-1 stampede script).
adminRouter.post('/reset', async (req, res) => {
  const stock = Number(req.body.stock ?? 100);
  const product = await createDrop({ stock });
  res.json({ productId: product._id, stock });
});

/**
 * 🧪 DEV ONLY: simulate "the API crashed right after confirming payment".
 * Reserves + confirms in Redis exactly like the real routes, but skips
 * adding the queue job. The reconciler should notice and repair it.
 */
adminRouter.post('/simulate-crash/:dropId', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end();

  const { userId } = req.body;
  const k = dropKeys(req.params.dropId);
  const reserved = await redis.reserveItem(k.stock, k.buyers, k.holds, k.holdMs, userId);
  if (reserved <= 0) return res.status(409).json({ ok: false, reason: 'could_not_reserve', code: reserved });

  await redis.confirmItem(k.stock, k.buyers, k.holds, k.paid, userId);
  // 💥 "crash" — no enqueueOrder() call
  res.json({ ok: true, note: 'Paid in Redis, but no job was queued. Wait for the reconciler.' });
});

// The truth: how many did we start with, how many orders exist, did we oversell?
adminRouter.get('/stats/:productId', async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) return res.status(404).json({ error: 'not_found' });

  const orders = await Order.countDocuments({ productId: product._id });

  res.json({
    initialStock: product.initialStock,
    stockLeftInDb: product.stock,
    ordersCreated: orders,
    oversold: Math.max(0, orders - product.initialStock),
  });
});
