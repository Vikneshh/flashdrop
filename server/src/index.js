import express from 'express';
import mongoose from 'mongoose';
import { config } from './config.js';
import { buyRouter } from './routes/buy.js';
import { adminRouter } from './routes/admin.js';
import { dropsRouter } from './routes/drops.js';
import { simulationsRouter } from './routes/simulations.js';
import { startSweeper } from './sweeper.js';
import { startGatekeeper } from './gatekeeper.js';
import { metricsMiddleware, startMetricsFlusher } from './metrics.js';
import { startLive } from './live.js';

const app = express();
app.set('trust proxy', config.trustProxy); // so req.ip is the real client, not the proxy
app.use(express.json());
app.use((req, res, next) => {
  res.set('X-Served-By', config.instanceId); // see which server answered (load balancer demo)
  next();
});
app.use(metricsMiddleware);

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/buy', buyRouter);
app.use('/admin', adminRouter);
app.use('/drops', dropsRouter);
app.use('/simulations', simulationsRouter);

// Express 5 forwards errors from async handlers here automatically.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, reason: 'server_error' });
});

await mongoose.connect(config.mongoUrl);
console.log('Connected to MongoDB');

startSweeper();
startGatekeeper();
startMetricsFlusher();
console.log('Hold sweeper + waiting-room gatekeeper + metrics started');

const server = app.listen(config.port, () => {
  console.log(`Flashdrop API [${config.instanceId}] running on http://localhost:${config.port}`);
});
const io = startLive(server);

/**
 * GRACEFUL SHUTDOWN (step 6).
 * `docker compose stop` / a deploy sends SIGTERM. Instead of dying mid-request:
 *   1. stop accepting new connections (nginx sends new requests to the other servers)
 *   2. let requests already in flight finish
 *   3. then exit
 * A hard crash (SIGKILL) can't be handled. Nginx retries safe requests elsewhere,
 * and our Lua scripts make it safe for a buyer to retry the rest.
 */
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[${config.instanceId}] ${signal}: finishing in-flight requests…`);
  io.close(); // dashboards reconnect, nginx routes them to another server
  server.close(async () => {
    await mongoose.disconnect();
    console.log(`[${config.instanceId}] shut down cleanly`);
    process.exit(0);
  });
  server.closeIdleConnections(); // idle keep-alive sockets from nginx: close now
  setTimeout(() => process.exit(1), 10_000).unref(); // never hang forever
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
