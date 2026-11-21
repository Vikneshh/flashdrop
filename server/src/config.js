// All settings in one place. Values come from environment variables,
// with defaults that work for local development.
export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://localhost:27017/flashdrop',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
};
