import { Router } from 'express';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';

export const buyRouter = Router();

/**
 * ❌ NAIVE BUY — the way most of us would write it first.
 *
 * Step 1: READ the product
 * Step 2: CHECK stock in JavaScript
 * Step 3: WRITE the new stock back
 *
 * The bug: between step 1 and step 3, hundreds of other requests can also
 * read "stock = 1", all pass the check, and all create an order.
 */
buyRouter.post('/naive/:productId', async (req, res) => {
  const { userId } = req.body;

  const product = await Product.findById(req.params.productId); // 1. READ

  if (!product || product.stock <= 0) {                          // 2. CHECK
    return res.status(409).json({ ok: false, reason: 'sold_out' });
  }

  product.stock -= 1;                                            // 3. WRITE
  await product.save(); // sends "$set stock = <value WE computed from an old read>"

  await Order.create({ productId: product._id, userId, mode: 'naive' });
  res.json({ ok: true });
});

/**
 * ✅ ATOMIC BUY — check and decrement in ONE database operation.
 *
 * "Find this product ONLY IF stock > 0, and decrease it by 1."
 * MongoDB applies this to a single document atomically, so two requests
 * can never both take the last item. If stock is 0, the filter doesn't
 * match and we get back null.
 */
buyRouter.post('/atomic/:productId', async (req, res) => {
  const { userId } = req.body;

  const product = await Product.findOneAndUpdate(
    { _id: req.params.productId, stock: { $gt: 0 } }, // condition
    { $inc: { stock: -1 } },                         // change (relative, not absolute!)
    { returnDocument: 'after' } // give us the updated document
  );

  if (!product) {
    return res.status(409).json({ ok: false, reason: 'sold_out' });
  }

  await Order.create({ productId: product._id, userId, mode: 'atomic' });
  res.json({ ok: true });
});
