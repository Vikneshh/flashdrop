/**
 * THE WORKER — a separate process from the API.
 *
 * The API's job: answer users fast ("payment received, processing").
 * The worker's job: do the slow, failure-prone stuff in the background:
 * capture payment, save the order, send the email.
 *
 * Run as many workers as you like (npm run worker in several terminals).
 * They all pull from the same Redis queue and never process a job twice
 * at the same time.
 */
import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from './config.js';
import { Order } from './models/Order.js';
import { ORDERS_QUEUE, queueConnection } from './queue.js';
import { startReconciler } from './reconciler.js';
import { redis } from './redis.js';
import { CHAOS_FAIL_RATE } from './services/simulations.js';

await mongoose.connect(config.mongoUrl);

/**
 * Chaos mode from the dashboard: the simulator can switch on a flaky
 * "payment provider" for one run. We check the Redis flag every second.
 */
let chaosFailRate = 0;
setInterval(async () => {
  chaosFailRate = Number(await redis.get(CHAOS_FAIL_RATE).catch(() => 0)) || 0;
}, 1000);
const failRate = () => Math.max(config.workerFailRate, chaosFailRate);

const worker = new Worker(
  ORDERS_QUEUE,
  async (job) => {
    const { dropId, userId } = job.data;

    // Pretend we're talking to a payment provider / email service.
    await sleep(config.workerDelayMs);

    // Chaos testing: fail on purpose so we can watch retries happen.
    if (Math.random() < failRate()) {
      throw new Error('Simulated failure: payment provider timed out');
    }

    /**
     * IDEMPOTENT write: "create this order if it doesn't exist yet".
     * A job can run more than once (retry after a crash, the reconciler
     * re-adding it...). Running it twice must give the same result as once,
     * so we upsert instead of insert.
     */
    try {
      await Order.updateOne(
        { productId: dropId, userId },
        { $setOnInsert: { productId: dropId, userId, mode: 'drop' } },
        { upsert: true }
      );
    } catch (err) {
      // Two copies raced and the unique index rejected one: the order exists, which is what we wanted.
      if (err.code !== 11000) throw err;
    }
  },
  {
    connection: queueConnection,
    concurrency: config.workerConcurrency,
    lockDuration: 10_000,  // a job must finish within 10s or it's considered stuck...
    stalledInterval: 5_000, // ...checked every 5s. Stuck jobs (worker crashed) go back to the queue.
  }
);

worker.on('failed', (job, err) => {
  const willRetry = job.attemptsMade < job.opts.attempts;
  console.log(
    `[worker] ${job.data.userId} attempt ${job.attemptsMade}/${job.opts.attempts} failed: ${err.message}` +
      (willRetry ? ' → will retry' : ' → GAVE UP (moved to failed jobs)')
  );
});

worker.on('ready', () => {
  console.log(
    `[worker] ready — concurrency ${config.workerConcurrency}, ` +
      `${config.workerDelayMs}ms per job, fail rate ${config.workerFailRate * 100}%`
  );
});

startReconciler();

/**
 * GRACEFUL SHUTDOWN: on Ctrl+C / deploy, stop taking new jobs and let the
 * current ones finish. (A hard crash is also safe — stuck jobs get retried —
 * but a clean exit avoids the wait.)
 */
const shutdown = async (signal) => {
  console.log(`[worker] ${signal} received, finishing current jobs...`);
  await worker.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
