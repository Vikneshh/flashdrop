import { Server } from 'socket.io';
import { config } from './config.js';
import { redis, CURRENT_DROP } from './redis.js';
import { getDropStats } from './services/drops.js';
import { getSimulation } from './services/simulations.js';
import { readMetrics } from './metrics.js';

/**
 * LIVE DASHBOARD FEED over Socket.IO.
 *
 * Every 500ms this server pushes a "tick" to every connected dashboard:
 * drop numbers, the last few seconds of request metrics, and the
 * simulation's progress. New dashboards first get the last 60 seconds of
 * history so the charts aren't empty.
 *
 * All the data comes from Redis/MongoDB, not this server's memory, so when
 * we run several API servers (step 6) every dashboard sees the same totals
 * no matter which server it's connected to.
 */
const HISTORY_SECONDS = 60;

const stripHist = ({ hist, ...point }) => point; // the browser doesn't need raw histograms

async function snapshot(metricsSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const dropId = await redis.get(CURRENT_DROP);

  const [drop, sim, metrics] = await Promise.all([
    dropId ? getDropStats(dropId) : null,
    getSimulation(),
    readMetrics(now - metricsSeconds, now - 1), // the current second isn't finished yet
  ]);

  return { ts: Date.now(), drop: drop && { id: dropId, ...drop }, sim, metrics: metrics.map(stripHist) };
}

export function startLive(httpServer) {
  const io = new Server(httpServer, { cors: { origin: config.corsOrigin } });

  io.on('connection', async (socket) => {
    try {
      socket.emit('history', await snapshot(HISTORY_SECONDS));
    } catch (err) {
      console.error('[live] history failed:', err.message);
    }
  });

  let running = false;
  setInterval(async () => {
    if (running || io.engine.clientsCount === 0) return; // nobody watching: do nothing
    running = true;
    try {
      // Last 3 seconds: the browser replaces points it already has, so late
      // metric flushes still correct the chart.
      io.emit('tick', await snapshot(3));
    } catch (err) {
      console.error('[live] tick failed:', err.message);
    } finally {
      running = false;
    }
  }, 500);

  return io;
}
