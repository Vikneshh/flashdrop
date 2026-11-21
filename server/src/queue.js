import { Queue } from 'bullmq';
import { config } from './config.js';

/**
 * The "orders" queue lives in Redis. Once a job is added, it survives
 * crashes of the API *and* the workers. Nothing in memory can lose it.
 */
const url = new URL(config.redisUrl);
export const queueConnection = {
  host: url.hostname,
  port: Number(url.port || 6379),
  username: url.username || undefined,
  password: url.password || undefined,
  maxRetriesPerRequest: null, // required by BullMQ: keep retrying Redis instead of erroring
};

export const ORDERS_QUEUE = 'orders';

export const ordersQueue = new Queue(ORDERS_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 5,                                   // try up to 5 times...
    backoff: { type: 'exponential', delay: 500 },  // ...waiting 0.5s, 1s, 2s, 4s between tries
    removeOnComplete: 1000,                        // keep the last 1000 finished jobs for inspection
    removeOnFail: 5000,                            // keep failed jobs longer so we can debug them
  },
});

/**
 * Queue "save this order" for a paid user.
 *
 * jobId is built from dropId + userId, so adding the same order twice
 * while it's still in the queue does nothing: BullMQ ignores duplicates.
 */
export const orderJobId = (dropId, userId) => `order_${dropId}_${userId}`;

export function enqueueOrder(dropId, userId) {
  return ordersQueue.add('finalize-order', { dropId, userId }, { jobId: orderJobId(dropId, userId) });
}
