import { readFileSync } from 'node:fs';
import Redis from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl);

const lua = (name) => readFileSync(new URL(`./lua/${name}.lua`, import.meta.url), 'utf8');

// Register our Lua scripts as custom commands: redis.reserve(...), etc.
// ioredis sends each script to Redis once and then calls it by its hash.
redis.defineCommand('reserveItem', { numberOfKeys: 4, lua: lua('reserve') });
redis.defineCommand('confirmItem', { numberOfKeys: 4, lua: lua('confirm') });
redis.defineCommand('sweepHolds', { numberOfKeys: 3, lua: lua('sweep') });

/**
 * All Redis keys for one drop.
 * The {curly braces} are a Redis Cluster "hash tag": they make sure all
 * keys of a drop live on the same Redis node, which Lua scripts require
 * if we ever scale Redis out to a cluster.
 */
export const dropKeys = (dropId) => ({
  stock: `drop:{${dropId}}:stock`,
  buyers: `drop:{${dropId}}:buyers`,
  holds: `drop:{${dropId}}:holds`,
  paid: `drop:{${dropId}}:paid`, // users who paid (source of truth until MongoDB catches up)
  holdMs: `drop:{${dropId}}:holdMs`,
});

export const ACTIVE_DROPS = 'drops:active';
