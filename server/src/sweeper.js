import { redis, dropOps, ACTIVE_DROPS } from './redis.js';

/**
 * Every second: give back items whose hold expired without payment.
 * Safe even when many servers run this at once (see sweep.lua).
 */
export function startSweeper(intervalMs = 1000) {
  let running = false; // don't start a new sweep while the last one is still going

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const dropIds = await redis.smembers(ACTIVE_DROPS);
      for (const id of dropIds) {
        const released = await dropOps.sweep(id);
        if (released > 0) console.log(`[sweeper] drop ${id}: released ${released} expired holds`);
      }
    } catch (err) {
      console.error('[sweeper] failed:', err.message);
    } finally {
      running = false;
    }
  }, intervalMs);
}
