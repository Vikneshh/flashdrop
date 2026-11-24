import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { redis } from '../redis.js';
import { queueConnection } from '../queue.js';
import { config } from '../config.js';
import { createDrop } from './drops.js';

/**
 * A "simulation" = one press of the Unleash button.
 * Its live state is a Redis hash (sim:<id>) that the simulator process
 * updates and the dashboard reads:
 *   status       queued | running | done | failed
 *   o:<outcome>  how many buyers ended each way (bought, walked away...)
 *   r:<code>     how many responses of each HTTP status the buyers got
 *   report       final JSON summary when done
 */
export const SIM_QUEUE = 'simulations';
export const simQueue = new Queue(SIM_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: 50, removeOnFail: 50 },
});

const LOCK = 'sim:lock';         // only one simulation at a time
const COOLDOWN = 'sim:cooldown'; // short pause between simulations
const CURRENT = 'sim:current';   // id of the latest simulation
export const CHAOS_FAIL_RATE = 'chaos:paymentFailRate'; // read by the order workers

export async function startSimulation({ buyers, stock, chaos }) {
  if (await redis.exists(COOLDOWN)) {
    return { error: 'cooldown', retryAfterSeconds: await redis.ttl(COOLDOWN) };
  }

  const id = randomUUID();
  // NX = only if nobody else holds the lock. EX = auto-release if the simulator dies.
  const locked = await redis.set(LOCK, id, 'EX', config.sim.timeoutSeconds + 30, 'NX');
  if (!locked) return { error: 'already_running' };

  // Admit roughly a tenth of the stock per second, so a drop sells out in ~10–20s
  const admitRate = Math.max(20, Math.ceil(stock / 10));
  const drop = await createDrop({ stock, holdSeconds: 5, waitingRoom: true, admitRate, admitWindowSeconds: 10 });
  const dropId = drop._id.toString();

  // Chaos mode: make the "payment provider" fail 30% of the time for this run
  if (chaos) await redis.set(CHAOS_FAIL_RATE, '0.3', 'EX', config.sim.timeoutSeconds + 30);
  else await redis.del(CHAOS_FAIL_RATE);

  await redis
    .multi()
    .hset(`sim:${id}`, { id, dropId, buyers, stock, admitRate, chaos: chaos ? 1 : 0, status: 'queued', createdAt: Date.now() })
    .expire(`sim:${id}`, 86_400)
    .set(CURRENT, id)
    .exec();

  await simQueue.add('run', { simulationId: id, dropId, buyers, stock });
  return { simulationId: id, dropId };
}

/** Called by the simulator when a run ends (success or failure). */
export async function finishSimulation(id, fields) {
  await redis
    .multi()
    .hset(`sim:${id}`, { ...fields, finishedAt: Date.now() })
    .set(COOLDOWN, '1', 'EX', config.sim.cooldownSeconds)
    .del(CHAOS_FAIL_RATE)
    .exec();
  // Release the lock only if it's still ours
  if ((await redis.get(LOCK)) === id) await redis.del(LOCK);
}

export async function getSimulation(id) {
  id ??= await redis.get(CURRENT);
  if (!id) return null;

  const raw = await redis.hgetall(`sim:${id}`);
  if (!raw.id) return null;

  const outcomes = {};
  const responses = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('o:')) outcomes[k.slice(2)] = Number(v);
    if (k.startsWith('r:')) responses[k.slice(2)] = Number(v);
  }

  return {
    id: raw.id,
    dropId: raw.dropId,
    status: raw.status,
    buyers: Number(raw.buyers),
    stock: Number(raw.stock),
    admitRate: Number(raw.admitRate),
    chaos: raw.chaos === '1',
    createdAt: Number(raw.createdAt),
    startedAt: raw.startedAt ? Number(raw.startedAt) : null,
    finishedAt: raw.finishedAt ? Number(raw.finishedAt) : null,
    finishedBuyers: Number(raw.finishedBuyers ?? 0),
    outcomes,
    responses,
    report: raw.report ? JSON.parse(raw.report) : null,
    error: raw.error ?? null,
  };
}
