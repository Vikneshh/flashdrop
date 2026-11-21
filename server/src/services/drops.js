import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { redis, dropKeys, ACTIVE_DROPS } from '../redis.js';

/**
 * Start a new drop.
 * MongoDB gets the permanent product record.
 * Redis gets the live counters that buyers will hammer.
 *
 * (For now we run one drop at a time, so this wipes the previous one.)
 */
export async function createDrop({ stock = 100, holdSeconds = 120 } = {}) {
  // Clean up old drops
  const oldIds = await redis.smembers(ACTIVE_DROPS);
  const oldKeys = oldIds.flatMap((id) => Object.values(dropKeys(id)));
  if (oldKeys.length) await redis.del(...oldKeys);
  await redis.del(ACTIVE_DROPS);
  await Promise.all([Product.deleteMany({}), Order.deleteMany({})]);

  const product = await Product.create({
    name: 'Limited Sneakers',
    initialStock: stock,
    stock,
    holdSeconds,
  });

  const id = product._id.toString();
  const k = dropKeys(id);

  // MULTI = send these together so they're applied as one batch
  await redis
    .multi()
    .set(k.stock, stock)
    .set(k.holdMs, holdSeconds * 1000)
    .sadd(ACTIVE_DROPS, id)
    .exec();

  return product;
}

/**
 * The health check for a drop. Every item must be in exactly one place:
 *   available + on hold + paid  ===  initial stock
 * If that ever breaks, we've lost or duplicated an item.
 */
export async function getDropStats(dropId) {
  const product = await Product.findById(dropId);
  if (!product) return null;

  const k = dropKeys(dropId);
  const [available, onHold, paid] = await Promise.all([
    redis.get(k.stock).then(Number),
    redis.zcard(k.holds),
    Order.countDocuments({ productId: product._id, mode: 'drop' }),
  ]);

  return {
    initialStock: product.initialStock,
    available,
    onHold,
    paid,
    oversold: Math.max(0, paid - product.initialStock),
    balanced: available + onHold + paid === product.initialStock,
  };
}
