/**
 * ONE place that handles shutdown signals.
 *
 * The API, the order worker and the simulator can run as separate processes
 * (Docker) or together in one process (Render's free plan). If each of them
 * called process.exit() on SIGTERM, the first one to finish would kill the
 * others mid-work. Instead each part registers a cleanup hook here, and we
 * exit only after ALL of them are done.
 */
const hooks = [];
let listening = false;
let stopping = false;

export function onShutdown(name, fn) {
  hooks.push({ name, fn });
  if (listening) return;
  listening = true;
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: shutting down ${hooks.map((h) => h.name).join(', ')}…`);
  setTimeout(() => process.exit(1), 10_000).unref(); // never hang forever

  const results = await Promise.allSettled(hooks.map((h) => h.fn()));
  results.forEach((r, i) => r.status === 'rejected' && console.error(`[${hooks[i].name}] shutdown failed:`, r.reason));
  console.log('shut down cleanly');
  process.exit(0);
}
