import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { redis, dropKeys, ACTIVE_DROPS, CURRENT_DROP } from '../redis.js';
import { ordersQueue } from '../queue.js';

/**
 * Start a new drop.
 * MongoDB gets the permanent product record.
 * Redis gets the live counters that buyers will hammer.
 *
 * (For now we run one drop at a time, so this wipes the previous one.)
 *
 * waitingRoom: true  → buyers must join the line and be admitted before reserving
 * admitRate          → how many people to let in per second
 * admitWindowSeconds → how long an admitted person has to reserve before losing their turn
 */
export async function createDrop({
  stock = 100,
  holdSeconds = 120,
  waitingRoom = false,
  admitRate = 100,
  admitWindowSeconds = 60,
} = {}) {
  // Clean up old drops
  const oldIds = await redis.smembers(ACTIVE_DROPS);
  const oldKeys = oldIds.flatMap((id) => Object.values(dropKeys(id)));
  if (oldKeys.length) await redis.del(...oldKeys);
  await redis.del(ACTIVE_DROPS);
  await ordersQueue.obliterate({ force: true }); // throw away jobs from the old drop
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
    .hset(k.config, {
      holdMs: holdSeconds * 1000,
      gated: waitingRoom ? 1 : 0,
      admitRate,
      admitWindowMs: admitWindowSeconds * 1000,
    })
    .sadd(ACTIVE_DROPS, id)
    .set(CURRENT_DROP, id)
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
  const [available, onHold, paid, ordersSaved, queue, inLine, admitted] = await Promise.all([
    redis.get(k.stock).then(Number),
    redis.zcard(k.holds),
    redis.scard(k.paid), // paid according to Redis (instant)
    Order.countDocuments({ productId: product._id, mode: 'drop' }), // saved by workers (catches up)
    ordersQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
    redis.zcard(k.waiting),  // people in the waiting room
    redis.zcard(k.admitted), // people let in, allowed to reserve
  ]);

  return {
    initialStock: product.initialStock,
    waitingRoom: { inLine, admitted },
    available,
    onHold,
    paid,
    ordersSaved,
    queue, // waiting = not started, active = being processed, delayed = waiting to retry, failed = gave up
    oversold: Math.max(0, paid - product.initialStock),
    balanced: available + onHold + paid === product.initialStock,
    allOrdersSaved: ordersSaved === paid,
  };
}
