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
  console.log(`Flashdrop API running on http://localhost:${config.port}`);
});
startLive(server);
