/**
 * DROP DEMO 👟
 * Plays out a full drop with holds, payments, and expiry:
 *
 *   1. A greedy user spams "Buy" 20 times      → gets only 1
 *   2. 500 buyers rush in                      → only the remaining stock gets holds
 *   3. Some winners pay, some walk away
 *   4. Holds expire                            → unpaid items return to stock
 *   5. A late payer tries to pay               → rejected
 *   6. A second wave buys the returned items   → sold out, nothing oversold
 *
 * Usage: npm run demo:drop -- --stock 100 --buyers 500 --hold 5
 */
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const { values } = parseArgs({
  options: {
    stock: { type: 'string', default: '100' },
    buyers: { type: 'string', default: '500' },
    hold: { type: 'string', default: '5' }, // seconds (short so the demo is quick)
    url: { type: 'string', default: 'http://localhost:4000' },
  },
});
const STOCK = Number(values.stock);
const BUYERS = Number(values.buyers);
const HOLD = Number(values.hold);
const API = values.url;

const post = (path, body) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const stats = (id) => fetch(`${API}/drops/${id}/stats`).then((r) => r.json());

const showStats = async (id, title) => {
  const s = await stats(id);
  console.log(`\n📊 ${title}`);
  console.table({
    Available: s.available,
    'On hold': s.onHold,
    Paid: s.paid,
    Oversold: s.oversold,
    'available + hold + paid = stock?': s.balanced ? '✅ yes' : '❌ NO',
  });
  return s;
};

const countReasons = (results) =>
  results.reduce((acc, r) => {
    const key = r.ok ? 'got a hold' : r.reason;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

// ─── Start ───────────────────────────────────────────────
const { dropId } = await post('/drops', { stock: STOCK, holdSeconds: HOLD });
console.log(`\n🛍️  New drop ${dropId}: ${STOCK} items, ${HOLD}s to pay after reserving.`);

// 1. Greedy user
console.log('\n1️⃣  "greedy-gary" clicks Buy 20 times at once...');
const greedy = await Promise.all(Array.from({ length: 20 }, () => post(`/drops/${dropId}/reserve`, { userId: 'greedy-gary' })));
console.table(countReasons(greedy));

// 2. The rush
console.log(`\n2️⃣  ${BUYERS} buyers rush in at the same moment...`);
const buyerIds = Array.from({ length: BUYERS }, (_, i) => `buyer-${i + 1}`);
const rush = await Promise.all(buyerIds.map((userId) => post(`/drops/${dropId}/reserve`, { userId })));
console.table(countReasons(rush));

const winners = ['greedy-gary', ...buyerIds.filter((_, i) => rush[i].ok)];

// 3. 60% pay, 40% walk away
const payers = winners.slice(0, Math.floor(winners.length * 0.6));
const walkers = winners.slice(payers.length);
console.log(`\n3️⃣  ${payers.length} winners pay, ${walkers.length} walk away without paying...`);
await Promise.all(payers.map((userId) => post(`/drops/${dropId}/pay`, { userId })));

const doublePay = await post(`/drops/${dropId}/pay`, { userId: payers[0] });
console.log(`   ${payers[0]} tries to pay a second time → ${doublePay.ok ? 'accepted ❌' : `rejected (${doublePay.reason}) ✅`}`);

await showStats(dropId, 'Right after payments (unpaid items are stuck on hold)');

// 4. Wait for holds to expire
console.log(`\n4️⃣  Waiting ${HOLD + 2}s for unpaid holds to expire...`);
await sleep((HOLD + 2) * 1000);
await showStats(dropId, 'After expiry (the sweeper returned unpaid items to stock)');

// 5. Late payer
if (walkers.length) {
  const late = await post(`/drops/${dropId}/pay`, { userId: walkers[0] });
  console.log(`\n5️⃣  ${walkers[0]} finally tries to pay → ${late.ok ? 'accepted ❌' : `rejected (${late.reason}) ✅`}`);
}

// 6. Second wave
console.log(`\n6️⃣  A second wave of ${BUYERS} new buyers rushes in and everyone who gets a hold pays...`);
const wave2Ids = Array.from({ length: BUYERS }, (_, i) => `wave2-${i + 1}`);
const wave2 = await Promise.all(wave2Ids.map((userId) => post(`/drops/${dropId}/reserve`, { userId })));
console.table(countReasons(wave2));
const wave2Winners = wave2Ids.filter((_, i) => wave2[i].ok);
await Promise.all(wave2Winners.map((userId) => post(`/drops/${dropId}/pay`, { userId })));

const final = await showStats(dropId, 'Final result');
console.log(
  final.paid === STOCK && final.oversold === 0 && final.balanced
    ? `\n✅ Every one of the ${STOCK} items sold exactly once. Nothing lost, nothing oversold.\n`
    : '\n❌ Something is off — check the numbers above.\n'
);
