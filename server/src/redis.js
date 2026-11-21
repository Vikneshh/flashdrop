import { readFileSync } from 'node:fs';
import Redis from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl);

const lua = (name) => readFileSync(new URL(`./lua/${name}.lua`, import.meta.url), 'utf8');

// Register our Lua scripts as custom commands.
// ioredis sends each script to Redis once and then calls it by its hash.
redis.defineCommand('reserveItem', { numberOfKeys: 5, lua: lua('reserve') });
redis.defineCommand('confirmItem', { numberOfKeys: 4, lua: lua('confirm') });
redis.defineCommand('sweepHolds', { numberOfKeys: 3, lua: lua('sweep') });
redis.defineCommand('joinLine', { numberOfKeys: 7, lua: lua('join') });
redis.defineCommand('admitBatch', { numberOfKeys: 6, lua: lua('admit') });
redis.defineCommand('lineStatus', { numberOfKeys: 5, lua: lua('queueStatus') });
redis.defineCommand('tokenBucket', { numberOfKeys: 1, lua: lua('tokenBucket') });

/**
 * All Redis keys for one drop.
 * The {curly braces} are a Redis Cluster "hash tag": they make sure all
 * keys of a drop live on the same Redis node, which Lua scripts require
 * if we ever scale Redis out to a cluster.
 */
export const dropKeys = (dropId) => ({
  config: `drop:{${dropId}}:config`,     // hash: holdMs, gated, admitRate, admitWindowMs
  stock: `drop:{${dropId}}:stock`,
  buyers: `drop:{${dropId}}:buyers`,
  holds: `drop:{${dropId}}:holds`,
  paid: `drop:{${dropId}}:paid`,         // users who paid (source of truth until MongoDB catches up)
  waiting: `drop:{${dropId}}:waiting`,   // the waiting room line
  tickets: `drop:{${dropId}}:tickets`,   // next ticket number
  admitted: `drop:{${dropId}}:admitted`, // users allowed to reserve right now
  admitLock: `drop:{${dropId}}:admitLock`,
});

export const ACTIVE_DROPS = 'drops:active';

/**
 * One function per Lua script, so callers never have to remember
 * which keys go in which order.
 */
export const dropOps = {
  reserve(dropId, userId) {
    const k = dropKeys(dropId);
    return redis.reserveItem(k.stock, k.buyers, k.holds, k.config, k.admitted, userId);
  },
  confirm(dropId, userId) {
    const k = dropKeys(dropId);
    return redis.confirmItem(k.stock, k.buyers, k.holds, k.paid, userId);
  },
  sweep(dropId) {
    const k = dropKeys(dropId);
    return redis.sweepHolds(k.stock, k.buyers, k.holds);
  },
  join(dropId, userId) {
    const k = dropKeys(dropId);
    return redis.joinLine(k.waiting, k.tickets, k.admitted, k.stock, k.holds, k.config, k.buyers, userId);
  },
  admit(dropId) {
    const k = dropKeys(dropId);
    return redis.admitBatch(k.waiting, k.admitted, k.stock, k.holds, k.config, k.admitLock);
  },
  status(dropId, userId) {
    const k = dropKeys(dropId);
    return redis.lineStatus(k.waiting, k.admitted, k.stock, k.holds, k.config, userId);
  },
};
