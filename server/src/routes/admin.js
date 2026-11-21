import { Router } from 'express';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';

export const adminRouter = Router();

// Start a fresh drop: wipe old data and create one product with N items.
adminRouter.post('/reset', async (req, res) => {
  const stock = Number(req.body.stock ?? 100);

  await Promise.all([Product.deleteMany({}), Order.deleteMany({})]);
  const product = await Product.create({
    name: 'Limited Sneakers',
    initialStock: stock,
    stock,
  });

  res.json({ productId: product._id, stock });
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
