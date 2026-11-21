/**
 * WAITING ROOM DEMO 🎟️
 *
 *   1. Someone tries to skip the line and reserve directly   → blocked
 *   2. 1,500 buyers join the line at once                     → get positions 1..1500
 *   3. The gatekeeper lets in 50 people per second; each buyer polls
 *      "where am I?", then reserves when admitted, and most of them pay
 *   4. A spam bot hammers the API                             → rate-limited (429)
 *   5. A bot farm uses 300 fake accounts from one IP          → rate-limited by IP
 *
 * Usage: npm run demo:line -- --stock 300 --buyers 1500 --rate 50
 */
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { apiClient } from './lib.js';

const { values } = parseArgs({
  options: {
    stock: { type: 'string', default: '300' },
    buyers: { type: 'string', default: '1500' },
    rate: { type: 'string', default: '50' },     // admitted per second
    hold: { type: 'string', default: '5' },      // seconds to pay after reserving
    payRate: { type: 'string', default: '0.8' }, // share of winners who actually pay
    url: { type: 'string', default: 'http://localhost:4000' },
  },
});
const STOCK = Number(values.stock);
const BUYERS = Number(values.buyers);
const RATE = Number(values.rate);
const PAY_RATE = Number(values.payRate);
const { post, get } = apiClient(values.url);

const tally = (items) => items.reduce((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});

// ─── Start ───────────────────────────────────────────────
const { dropId } = await post('/drops', {
  stock: STOCK,
  holdSeconds: Number(values.hold),
  waitingRoom: true,
  admitRate: RATE,
  admitWindowSeconds: 10,
});
console.log(`\n🛍️  New drop: ${STOCK} items, waiting room ON, admitting ${RATE} people/second.`);

// 1. Line skipper
const skip = await post(`/drops/${dropId}/reserve`, { userId: 'sneaky-sam' });
console.log(`\n1️⃣  sneaky-sam tries to reserve without joining the line → ${skip.ok ? 'got in ❌' : `blocked (${skip.reason}) ✅`}`);

// 2 + 3. The crowd
console.log(`\n2️⃣  ${BUYERS} buyers join the line at the same moment...`);

const positions = {};
let finished = 0;
let joined = 0;

async function buyer(i) {
  const userId = `buyer-${i}`;
  let r = await post(`/drops/${dropId}/line`, { userId });
  joined++;
  if (r.status === 'waiting') positions[userId] = r.position;

  // Wait in line, polling about once a second like a real browser tab would
  while (r.status !== 'admitted') {
    if (r.status === 'sold_out') return 'sold out while in line';
    if (r.status === 'not_in_line') return 'lost their turn';
    await sleep(r.httpStatus === 429 ? r.retryAfterMs : 800 + Math.random() * 400);
    r = await get(`/drops/${dropId}/line/${userId}`);
  }

  const res = await post(`/drops/${dropId}/reserve`, { userId });
  if (!res.ok) return `admitted, then ${res.reason}`;
  if (Math.random() > PAY_RATE) return 'got a hold, walked away';

  const pay = await post(`/drops/${dropId}/pay`, { userId });
  return pay.ok ? '✅ bought' : `payment failed: ${pay.reason}`;
}

const crowd = Promise.all(
  Array.from({ length: BUYERS }, (_, i) => buyer(i + 1).finally(() => finished++))
);

// Wait until everyone has joined, then show where people ended up
while (joined < BUYERS) await sleep(50);
const ranked = Object.entries(positions).sort((a, b) => a[1] - b[1]);
const [firstId, firstPos] = ranked[0];
const [lastId, lastPos] = ranked[ranked.length - 1];
console.log(`   All in line. ${firstId} is #${firstPos} ... ${lastId} is #${lastPos} (estimated wait ~${Math.ceil(lastPos / RATE)}s)`);

console.log('\n3️⃣  The line moving, second by second:');
const started = Date.now();
while (finished < BUYERS) {
  const s = await get(`/drops/${dropId}/stats`);
  const sec = String(Math.round((Date.now() - started) / 1000)).padStart(3);
  console.log(
    `   ${sec}s | in line ${String(s.waitingRoom.inLine).padStart(4)} | admitted, not yet reserved ${String(s.waitingRoom.admitted).padStart(3)} | ` +
      `available ${String(s.available).padStart(3)} | on hold ${String(s.onHold).padStart(3)} | paid ${String(s.paid).padStart(3)}`
  );
  await sleep(1000);
}
const outcomes = await crowd;
console.log('\n   What happened to the buyers:');
console.table(tally(outcomes));

// 4. Spam bot: one user, one IP, 30 requests at once
const spam = await Promise.all(
  Array.from({ length: 30 }, () => get(`/drops/${dropId}/line/bot-billy`, '6.6.6.1'))
);
const spamBlocked = spam.filter((r) => r.httpStatus === 429).length;
console.log(`\n4️⃣  bot-billy sends 30 requests at once → ${30 - spamBlocked} let through, ${spamBlocked} blocked with 429 ✅`);

// 5. Bot farm: 300 different accounts, all from the same IP
const farm = await Promise.all(
  Array.from({ length: 300 }, (_, i) => post(`/drops/${dropId}/line`, { userId: `farm-bot-${i}` }, '6.6.6.6'))
);
const farmBlocked = farm.filter((r) => r.httpStatus === 429).length;
console.log(`5️⃣  A bot farm sends 300 joins from ONE IP with 300 fake accounts → ${300 - farmBlocked} let through, ${farmBlocked} blocked by the IP limit ✅`);

// Final
const s = await get(`/drops/${dropId}/stats`);
console.log('\n📊 Final result');
console.table({
  'Items': s.initialStock,
  'Paid': s.paid,
  'Oversold': s.oversold,
  'available + hold + paid = stock?': s.balanced ? '✅ yes' : '❌ NO',
});
