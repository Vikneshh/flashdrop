/**
 * THE STAMPEDE 🐂
 * Simulates N buyers clicking "Buy" at the exact same moment.
 *
 * Usage:
 *   npm run stampede -- --mode naive  --buyers 500 --stock 100
 *   npm run stampede -- --mode atomic --buyers 500 --stock 100
 */
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'naive' }, // naive | atomic
    buyers: { type: 'string', default: '500' },
    stock: { type: 'string', default: '100' },
    url: { type: 'string', default: 'http://localhost:4000' },
  },
});

const mode = values.mode;
const buyers = Number(values.buyers);
const stock = Number(values.stock);
const API = values.url;

const post = (path, body) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

// 1. Fresh drop
const { productId } = await post('/admin/reset', { stock });
console.log(`\n🛍️  New drop: ${stock} items. Releasing ${buyers} buyers using the "${mode}" route...\n`);

// 2. Everyone clicks Buy at once
const started = performance.now();
const results = await Promise.all(
  Array.from({ length: buyers }, (_, i) =>
    post(`/buy/${mode}/${productId}`, { userId: `buyer-${i + 1}` }).catch(() => ({ ok: false, reason: 'network_error' }))
  )
);
const ms = Math.round(performance.now() - started);

// 3. What actually happened?
const stats = await fetch(`${API}/admin/stats/${productId}`).then((r) => r.json());
const told = results.filter((r) => r.ok).length;

console.table({
  'Items available': stats.initialStock,
  'Buyers told "you got it"': told,
  'Orders in database': stats.ordersCreated,
  'Stock left in database': stats.stockLeftInDb,
  'OVERSOLD': stats.oversold,
  'Time taken (ms)': ms,
});

console.log(
  stats.oversold > 0
    ? `💥 We sold ${stats.oversold} items that DON'T EXIST. ${stats.oversold} angry customers.\n`
    : '✅ Perfect: every item sold exactly once, zero oversold.\n'
);
