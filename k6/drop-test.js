/**
 * k6 LOAD TEST — an independent check, separate from our own simulator.
 *
 * Every k6 "virtual user" iteration is one buyer:
 *   join the line → wait (polling when the server says to) → reserve → pay
 * Buyers arrive faster and faster (ramping arrival rate), all from different IPs.
 *
 * PASS/FAIL thresholds (k6 exits non-zero if any fails):
 *   - 95% of requests answer in under 300ms
 *   - under 1% server errors (5xx / network). 409 sold out, 429 slow down etc. are
 *     correct answers under a stampede, not failures.
 *   - ZERO items oversold, checked against the server's own stats at the end
 *
 * Run against the docker-compose stack (from the repo root):
 *   docker run --rm -i --network flashdrop_default -v "$PWD/k6:/scripts" \
 *     -e BASE_URL=http://nginx -e ADMIN_TOKEN=local-dev-token grafana/k6 run /scripts/drop-test.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:8080';
const TOKEN = __ENV.ADMIN_TOKEN || 'local-dev-token';
const STOCK = Number(__ENV.STOCK || 1000);
const PEAK = Number(__ENV.PEAK_BUYERS_PER_SEC || 150);

const oversold = new Counter('oversold_items');
const bought = new Counter('buyers_who_bought');
const gotAnswer = new Rate('buyer_got_final_answer'); // bought, or a clear "sold out"

// 4xx are expected answers in a stampede (sold out, rate limited, not admitted yet)
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

export const options = {
  scenarios: {
    stampede: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 800,
      maxVUs: 3000,
      stages: [
        { duration: '10s', target: PEAK }, // the doors open
        { duration: '20s', target: PEAK }, // peak rush
        { duration: '5s', target: 0 },     // crowd thins out
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    oversold_items: ['count==0'],
    buyer_got_final_answer: ['rate>0.95'],
  },
};

const json = (body, extra = {}) => ({ headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });

function fakeIp(n) {
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

export function setup() {
  const res = http.post(
    `${BASE}/drops`,
    JSON.stringify({ stock: STOCK, holdSeconds: 10, waitingRoom: true, admitRate: Math.max(50, STOCK / 10), admitWindowSeconds: 20 }),
    { headers: { 'content-type': 'application/json', 'x-admin-token': TOKEN } }
  );
  if (res.status !== 201) throw new Error(`could not create drop: ${res.status} ${res.body}`);
  return { dropId: res.json('dropId') };
}

export default function ({ dropId }) {
  const n = (__VU << 12) + __ITER; // unique per buyer
  const userId = `k6-${__VU}-${__ITER}`;
  const ip = { 'x-forwarded-for': fakeIp(n) };
  const params = { headers: { 'content-type': 'application/json', ...ip } };

  // 1. Join the line
  let r = http.post(`${BASE}/drops/${dropId}/line`, JSON.stringify({ userId }), { ...params, tags: { step: 'join' } });
  let body = r.json() || {};

  // 2. Wait for our turn, polling when the server tells us to
  const giveUpAt = Date.now() + 30_000;
  while (body.status === 'waiting' && Date.now() < giveUpAt) {
    sleep((body.pollAfterMs || 1000) / 1000);
    r = http.get(`${BASE}/drops/${dropId}/line/${userId}`, { headers: ip, tags: { step: 'poll' } });
    body = r.json() || {};
  }

  if (body.status === 'sold_out') return gotAnswer.add(true);
  if (body.status !== 'admitted') return gotAnswer.add(false);

  // 3. Hold an item
  r = http.post(`${BASE}/drops/${dropId}/reserve`, JSON.stringify({ userId }), { ...params, tags: { step: 'reserve' } });
  if (r.status === 409) return gotAnswer.add(true); // sold out at the last second: still a clear answer
  if (!check(r, { 'reserved an item': (x) => x.status === 200 })) return gotAnswer.add(false);

  // 4. Pay ("typing card details" first)
  sleep(0.3 + Math.random());
  r = http.post(`${BASE}/drops/${dropId}/pay`, JSON.stringify({ userId }), { ...params, tags: { step: 'pay' } });
  const paid = check(r, { 'payment accepted (202)': (x) => x.status === 202 });
  if (paid) bought.add(1);
  gotAnswer.add(paid);
}

export function teardown({ dropId }) {
  sleep(3); // let the queue worker save the last orders
  const s = http.get(`${BASE}/drops/${dropId}/stats`).json();
  console.log(`stock ${s.initialStock} | sold ${s.paid} | saved ${s.ordersSaved} | oversold ${s.oversold} | balanced ${s.balanced}`);
  oversold.add(s.oversold);
  check(s, {
    'no item sold twice': (x) => x.oversold === 0,
    'stock adds up': (x) => x.balanced === true,
  });
}
