import { Order } from './models/Order.js';
import { redis, dropKeys, ACTIVE_DROPS } from './redis.js';
import { enqueueOrder, ordersQueue, orderJobId } from './queue.js';

// Job states that mean "this order is still being worked on"
const IN_PROGRESS = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children']);

/**
 * THE RECONCILER — the safety net.
 *
 * There's still one tiny gap: the API confirms payment in Redis, then adds
 * the job to the queue. If the API crashes between those two lines, the
 * user is in the "paid" set but no job exists.
 *
 * Every few seconds this compares "who paid" (Redis) with "whose order is
 * saved" (MongoDB) and re-queues anything that has no order AND no live job.
 * It also revives jobs that used up all 5 retries (e.g. the payment provider
 * was down for a minute). The worker's write is idempotent, so even a
 * duplicate job would be harmless.
 */
export function startReconciler(intervalMs = 5000) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const dropIds = await redis.smembers(ACTIVE_DROPS);

      for (const dropId of dropIds) {
        const paidUsers = await redis.smembers(dropKeys(dropId).paid);
        if (!paidUsers.length) continue;

        const saved = await Order.find({ productId: dropId, userId: { $in: paidUsers } }, { userId: 1 }).lean();
        const savedSet = new Set(saved.map((o) => o.userId));
        const missing = paidUsers.filter((u) => !savedSet.has(u));

        let requeued = 0;
        for (const userId of missing) {
          const job = await ordersQueue.getJob(orderJobId(dropId, userId));
          const state = job ? await job.getState() : null;

          if (IN_PROGRESS.has(state)) continue; // already on its way, leave it alone

          // Our MongoDB snapshot is a few ms old — the job may have finished
          // since. Check again before re-queuing, so we don't redo work.
          if (state === 'completed' || (await Order.exists({ productId: dropId, userId }))) continue;

          if (job) await job.remove(); // it gave up (failed): clear it and start fresh
          await enqueueOrder(dropId, userId);
          requeued++;
        }

        if (requeued) {
          console.log(`[reconciler] drop ${dropId}: ${requeued} paid users had no saved order and no job → re-queued`);
        }
      }
    } catch (err) {
      console.error('[reconciler] failed:', err.message);
    } finally {
      running = false;
    }
  }, intervalMs);
}
