import express from 'express';
import mongoose from 'mongoose';
import { config } from './config.js';
import { buyRouter } from './routes/buy.js';
import { adminRouter } from './routes/admin.js';
import { dropsRouter } from './routes/drops.js';
import { startSweeper } from './sweeper.js';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/buy', buyRouter);
app.use('/admin', adminRouter);
app.use('/drops', dropsRouter);

// Express 5 forwards errors from async handlers here automatically.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, reason: 'server_error' });
});

await mongoose.connect(config.mongoUrl);
console.log('Connected to MongoDB');

startSweeper();
console.log('Hold sweeper started');

app.listen(config.port, () => {
  console.log(`Flashdrop API running on http://localhost:${config.port}`);
});
