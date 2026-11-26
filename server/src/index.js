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
import { onShutdown } from './lifecycle.js';
import { requireAdmin } from './middleware/admin.js';
import { cors } from './middleware/cors.js';

const app = express();
app.set('trust proxy', config.trustProxy); // so req.ip is the real client, not the proxy
app.use(cors);
app.use(express.json());
app.use((req, res, next) => {
  res.set('X-Served-By', config.instanceId); // see which server answered (load balancer demo)
  next();
});
app.use(metricsMiddleware);

// yourIp: lets us check the real client IP is detected behind a proxy (Nginx / Render)
app.get('/health', (req, res) => res.json({ ok: true, instance: config.instanceId, yourIp: req.ip }));
app.use('/buy', requireAdmin, buyRouter);     // step-1 demo routes: never public
app.use('/admin', requireAdmin, adminRouter);
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
onShutdown('api', () => new Promise((resolve) => {
  console.log(`[${config.instanceId}] finishing in-flight requests…`);
  server.close(resolve);          // resolves once every in-flight request has finished
  server.closeIdleConnections();  // idle keep-alive sockets: close now
  io.close();                     // drop websockets; dashboards reconnect to another server
}));
