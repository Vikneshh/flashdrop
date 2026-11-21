import { redis, dropOps, ACTIVE_DROPS } from './redis.js';

/**
 * Every second: let the next batch of people out of the waiting room.
 * Every API server runs this, but admit.lua's lock makes sure only one
 * of them actually admits per second.
 */
export function startGatekeeper(intervalMs = 1000) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const dropIds = await redis.smembers(ACTIVE_DROPS);
      for (const id of dropIds) {
        await dropOps.admit(id);
      }
    } catch (err) {
      console.error('[gatekeeper] failed:', err.message);
    } finally {
      running = false;
    }
  }, intervalMs);
}
