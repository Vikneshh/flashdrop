/**
 * Run one "Unleash" simulation from the command line and print the report.
 *
 *   node scripts/bench.js [baseUrl] [buyers] [stock] [--chaos]
 *   node scripts/bench.js http://localhost:8080 3000 400
 *
 * Used in step 6 to compare 1 API server vs 3 behind Nginx.
 */
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const chaos = args.includes('--chaos');
const [base = 'http://localhost:8080', buyers = '3000', stock = '400'] = args.filter((a) => !a.startsWith('--'));

async function start() {
  for (;;) {
    const res = await fetch(`${base}/simulations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ buyers: Number(buyers), stock: Number(stock), chaos }),
    });
    const body = await res.json();
    if (res.ok) return body.simulationId;

    // cooldown / rate limit / another run in progress → wait and retry
    const waitMs = body.retryAfterMs ?? (body.retryAfterSeconds ?? 5) * 1000;
    console.log(`  waiting ${Math.ceil(waitMs / 1000)}s (${body.reason})…`);
    await sleep(waitMs + 250);
  }
}

console.log(`▶ ${buyers} buyers, ${stock} items, chaos ${chaos ? 'on' : 'off'} → ${base}`);
const id = await start();

for (;;) {
  await sleep(1000);
  const sim = await fetch(`${base}/simulations/current`).then((r) => r.json());
  if (sim?.id !== id) continue;
  process.stdout.write(`\r  ${sim.finishedBuyers ?? 0} / ${buyers} buyers done`);
  if (sim.status === 'done' || sim.status === 'failed') {
    console.log('\n');
    const r = sim.report ?? {};
    const total = Object.values(r.servers ?? {}).reduce((a, b) => a + b, 0) || 1;
    console.table({
      sold: r.sold,
      oversold: r.oversold,
      balanced: r.balanced,
      'duration (s)': r.durationSeconds,
      requests: r.totalRequests,
      'peak req/s': r.peakRps,
      'p50 (ms ≤)': r.p50,
      'p95 (ms ≤)': r.p95,
    });
    for (const [srv, n] of Object.entries(r.servers ?? {}).sort()) {
      console.log(`  ${srv.padEnd(8)} ${String(n).padStart(7)} requests  (${Math.round((n / total) * 100)}%)`);
    }
    process.exit(sim.status === 'done' ? 0 : 1);
  }
}
