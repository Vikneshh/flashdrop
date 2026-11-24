import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from './api.js';

const WINDOW_SECONDS = 60;

/**
 * Merge new per-second metric points into what we have.
 * The server re-sends the last 3 seconds on every tick (late flushes can
 * change them), so we replace points by timestamp instead of appending.
 */
function mergeMetrics(current, incoming) {
  const byT = new Map(current.map((p) => [p.t, p]));
  for (const p of incoming) byT.set(p.t, p);
  const all = [...byT.values()].sort((a, b) => a.t - b.t);
  const newest = all.at(-1)?.t ?? 0;
  return all.filter((p) => p.t > newest - WINDOW_SECONDS);
}

/**
 * Live dashboard data over Socket.IO.
 * Returns { connected, drop, sim, metrics }.
 */
export function useLiveFeed() {
  const [state, setState] = useState({ connected: false, drop: null, sim: null, metrics: [] });

  useEffect(() => {
    const socket = io(API_BASE || undefined, { transports: ['websocket'] });

    socket.on('connect', () => setState((s) => ({ ...s, connected: true })));
    socket.on('disconnect', () => setState((s) => ({ ...s, connected: false })));

    socket.on('history', (snap) =>
      setState((s) => ({ ...s, drop: snap.drop, sim: snap.sim, metrics: mergeMetrics([], snap.metrics) }))
    );
    socket.on('tick', (snap) =>
      setState((s) => ({ ...s, drop: snap.drop, sim: snap.sim, metrics: mergeMetrics(s.metrics, snap.metrics) }))
    );

    return () => socket.disconnect();
  }, []);

  return state;
}
