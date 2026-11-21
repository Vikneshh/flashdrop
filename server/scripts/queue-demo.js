/**
 * QUEUE DEMO 📬
 * Needs a worker running:  npm run worker
 * For chaos, start the worker with a fail rate, e.g. WORKER_FAIL_RATE=0.3
 *
 *   1. One user's payment "crashes" the API before the job is queued
 *   2. Buyers reserve and pay → the API answers instantly (202)
 *   3. We watch the workers catch up, retrying failures along the way
 *   4. The reconciler repairs the crashed user's missing order
 *
 * Usage: npm run demo:queue -- --stock 200 --buyers 500
 */
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { apiClient } from './lib.js';

const { values } = parseArgs({
  options: {
    stock: { type: 'string', default: '200' },
    buyers: { type: 'string', default: '500' },
    timeout: { type: 'string', default: '90' }, // seconds to wait for workers
    url: { type: 'string', default: 'http://localhost:4000' },
  },
});
const STOCK = Number(values.stock);
const BUYERS = Number(values.buyers);
const API = values.url;

const { post, get } = apiClient(API);

// ─── Start ───────────────────────────────────────────────
const { dropId } = await post('/drops', { stock: STOCK, holdSeconds: 60 });
console.log(`\n🛍️  New drop: ${STOCK} items.`);

// 1. Simulated crash
const crash = await post(`/admin/simulate-crash/${dropId}`, { userId: 'unlucky-uma' });
console.log(`\n1️⃣  unlucky-uma pays, but the API "crashes" before queueing her order → ${crash.ok ? 'paid in Redis, NO job 💥' : crash.reason}`);

// 2. Reserve + pay, timing how long "pay" takes to answer
console.log(`\n2️⃣  ${BUYERS} buyers reserve; every winner pays immediately...`);
const ids = Array.from({ length: BUYERS }, (_, i) => `buyer-${i + 1}`);
const reserves = await Promise.all(ids.map((userId) => post(`/drops/${dropId}/reserve`, { userId })));
const winners = ids.filter((_, i) => reserves[i].ok);

const payTimes = [];
await Promise.all(
  winners.map(async (userId) => {
    const t = performance.now();
    await post(`/drops/${dropId}/pay`, { userId });
    payTimes.push(performance.now() - t);
  })
);
payTimes.sort((a, b) => a - b);
console.log(`   ${winners.length} payments accepted. API answered in median ${Math.round(payTimes[payTimes.length >> 1])}ms (it doesn't wait for the slow work).`);

// 3. Watch workers catch up
console.log('\n3️⃣  Workers processing in the background:');
const deadline = Date.now() + Number(values.timeout) * 1000;
let s;
let lastLine = '';
while (Date.now() < deadline) {
  s = await get(`/drops/${dropId}/stats`);
  const q = s.queue;
  const line = `   saved ${String(s.ordersSaved).padStart(4)}/${s.paid} | waiting ${q.waiting} | processing ${q.active} | waiting to retry ${q.delayed} | gave up ${q.failed}`;
  if (line !== lastLine) console.log(line);
  lastLine = line;
  if (s.allOrdersSaved) break;
  await sleep(500);
}

// 4. Did the reconciler save Uma?
const uma = await get(`/drops/${dropId}/orders/unlucky-uma`);
console.log(`\n4️⃣  unlucky-uma's order status → ${uma.status}${uma.status === 'confirmed' ? ' ✅ (the reconciler repaired it)' : ''}`);

console.log('\n📊 Final result');
console.table({
  'Paid (Redis)': s.paid,
  'Orders saved (MongoDB)': s.ordersSaved,
  Oversold: s.oversold,
  'available + hold + paid = stock?': s.balanced ? '✅ yes' : '❌ NO',
  'Every paid user has an order?': s.allOrdersSaved ? '✅ yes' : '❌ NO',
});
