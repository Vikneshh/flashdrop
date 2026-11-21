// All settings in one place. Values come from environment variables,
// with defaults that work for local development.
export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://localhost:27017/flashdrop',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  // Worker settings (step 3)
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 10), // jobs processed in parallel per worker
  workerDelayMs: Number(process.env.WORKER_DELAY_MS ?? 100),       // pretend "payment capture + email" takes this long
  workerFailRate: Number(process.env.WORKER_FAIL_RATE ?? 0),       // 0.3 = 30% of attempts fail on purpose (chaos testing)
};
