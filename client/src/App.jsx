import {
  LayoutGrid, Activity, Gauge, ShieldCheck, Users, CircleCheck, Ban, PackageX, Clock, Bot,
  ShoppingBag, Hourglass, Undo2, DoorOpen, CircleX, Zap, Lock, ListTodo, Database, Radio, GitBranch, Wrench, Network, Loader2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLiveFeed } from './useLiveFeed.js';
import { Hero } from './components/Hero.jsx';
import { UnleashPanel } from './components/UnleashPanel.jsx';
import { Pipeline } from './components/Pipeline.jsx';
import { InventoryGrid } from './components/InventoryGrid.jsx';
import { LineChart } from './components/LineChart.jsx';
import { BarList } from './components/BarList.jsx';
import { ReportCard } from './components/ReportCard.jsx';
import { CardTitle } from './components/InfoTip.jsx';
import { ServerSplit } from './components/ServerSplit.jsx';
import { fmt, fmtMs } from './format.js';

const REPO_URL = 'https://github.com/Vikneshh/flashdrop';

// Simulator outcome keys → plain English + icon
const OUTCOMES = {
  bought: { label: 'Got their item', icon: ShoppingBag },
  'sold out while in line': { label: 'Sold out before their turn', icon: Hourglass },
  'walked away (hold expired)': { label: "Didn't pay in time, item went back on sale", icon: Undo2 },
  'payment too late': { label: 'Paid after their hold ran out', icon: Clock },
  'admitted, then missed out': { label: 'Let in, but just missed out', icon: DoorOpen },
  'timed out': { label: 'Gave up waiting', icon: Hourglass },
  'lost their turn': { label: 'Lost their turn', icon: Hourglass },
  'bot blocked': { label: 'Bot blocked', icon: Bot },
  'line skipper blocked': { label: 'Line-cutter blocked', icon: Ban },
  'bot got through ❌': { label: 'Bot got through', icon: CircleX },
  'skipper got through ❌': { label: 'Line-cutter got through', icon: CircleX },
};

const UNDER_THE_HOOD = [
  { icon: Zap, name: 'Redis', text: 'A super-fast scoreboard in memory that decides who gets each item.' },
  { icon: Lock, name: 'Lua scripts', text: '"Check stock and take one" happens as one step, so two people can never grab the last item.' },
  { icon: ShieldCheck, name: 'Rate limiting', text: 'Slows down anyone clicking too fast, which is how the bots get blocked.' },
  { icon: ListTodo, name: 'BullMQ', text: 'A to-do list for saving orders. If saving fails, it retries automatically.' },
  { icon: Database, name: 'MongoDB', text: 'The permanent record of every order.' },
  { icon: Network, name: 'Nginx load balancer', text: 'Spreads shoppers across 3 identical servers, and routes around one that crashes.' },
  { icon: Radio, name: 'Socket.IO', text: 'Pushes these live numbers to your screen twice a second.' },
];

export default function App() {
  const { connected, drop, sim, metrics } = useLiveFeed();

  // Free hosting puts the server to sleep when idle. If we can't connect quickly, say why.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (connected) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(t);
  }, [connected]);

  const rps = metrics.map((p) => ({ t: p.t, value: p.rps }));
  const p95 = metrics.map((p) => ({ t: p.t, value: p.p95 }));
  const latest = metrics.at(-1);

  const r = sim?.responses ?? {};
  const responseRows = [
    { icon: CircleCheck, label: 'Answered normally', hint: '200', value: (r['200'] ?? 0) + (r['202'] ?? 0) },
    { icon: Gauge, label: 'Told to slow down', hint: '429', value: r['429'] ?? 0 },
    { icon: Ban, label: 'Tried to cut the line', hint: '403', value: r['403'] ?? 0 },
    { icon: PackageX, label: 'Sold out or already has one', hint: '409', value: r['409'] ?? 0 },
    { icon: Clock, label: 'Paid after the 5s hold', hint: '410', value: r['410'] ?? 0 },
  ];

  const outcomeRows = Object.entries(sim?.outcomes ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ label: OUTCOMES[key]?.label ?? key, icon: OUTCOMES[key]?.icon, value }));

  const clean = drop && drop.balanced && drop.oversold === 0;

  return (
    <div className="page">
      <Hero connected={connected} />
      {slow && (
        <p className="waking" role="status">
          <Loader2 size={18} className="spin" aria-hidden="true" />
          <span>
            <b>Waking up the server…</b> It runs on free hosting, which sleeps when nobody's using it.
            This takes up to a minute, and the page connects by itself.
          </span>
        </p>
      )}

      <UnleashPanel sim={sim} drop={drop} />
      <ReportCard sim={sim} />

      <Pipeline drop={drop} />

      <div className="grid">
        <section className="card">
          <div className="card-head">
            <CardTitle
              icon={LayoutGrid}
              title="Every item, one square each"
              info="Each square is one item for sale. Orange means someone is paying for it right now (they have 5 seconds). Blue means sold. A square can only be blue once, so nothing gets sold twice."
            />
            {drop && (
              <span className={`status ${clean ? 'good' : 'critical'}`}>
                {clean ? <ShieldCheck size={14} aria-hidden="true" /> : <CircleX size={14} aria-hidden="true" />}
                {clean ? 'Nothing sold twice' : `${fmt(drop.oversold)} oversold`}
              </span>
            )}
          </div>
          <InventoryGrid drop={drop} />
          {drop && (
            <p className="muted">
              Check: {fmt(drop.available)} available + {fmt(drop.onHold)} being paid for + {fmt(drop.paid)} sold ={' '}
              <b>{fmt(drop.available + drop.onHold + drop.paid)}</b> of {fmt(drop.initialStock)}. The numbers always add up.
            </p>
          )}
        </section>

        <div className="charts">
          <section className="card">
            <div className="card-head">
              <CardTitle
                icon={Activity}
                title="Traffic"
                tech="requests / sec"
                info="How many times per second the shoppers' browsers talk to the server: joining the line, checking their place, holding an item, paying. Higher means a bigger rush."
              />
              <span className="big-number">{fmt(latest?.rps ?? 0)}</span>
            </div>
            <LineChart points={rps} format={(v) => fmt(Math.round(v))} label="Requests per second over the last 60 seconds" />
          </section>
          <section className="card">
            <div className="card-head">
              <CardTitle
                icon={Gauge}
                title="Speed"
                tech="p95 latency"
                info="How long the slowest shoppers waited for an answer: 95 out of 100 requests were answered within this time. Lower is better. Under 300ms feels instant."
              />
              <span className="big-number">{fmtMs(latest?.p95 ?? 0)}</span>
            </div>
            <LineChart points={p95} format={(v) => fmtMs(Math.round(v))} label="95th percentile response time over the last 60 seconds" />
          </section>
        </div>
      </div>

      <ServerSplit metrics={metrics} />

      <div className="grid two">
        <section className="card">
          <CardTitle
            icon={ShieldCheck}
            title="How the server answered"
            tech="HTTP status"
            info="Every request gets an answer. Most are normal. The rest show the protections working: slowing bots down, stopping line-cutters, and refusing to sell what's already gone."
          />
          <BarList rows={responseRows} emptyText="Answers appear here during a run." />
        </section>
        <section className="card">
          <CardTitle
            icon={Users}
            title="How each shopper's story ended"
            info="One row per kind of ending. Most of the crowd is normal shoppers, 5% are bots spamming the buy button, and 5% try to skip the line."
          />
          <BarList rows={outcomeRows} emptyText="Shopper stories appear here during a run." />
        </section>
      </div>

      <section className="card hood" aria-labelledby="hood">
        <CardTitle icon={Wrench} title={<span id="hood">What's under the hood</span>} />
        <ul className="hood-list">
          {UNDER_THE_HOOD.map((h) => (
            <li key={h.name}>
              <span className="icon-tile" aria-hidden="true"><h.icon size={17} /></span>
              <div>
                <strong>{h.name}</strong>
                <p>{h.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="footer">
        <p>Built with Node.js, Express, Redis, BullMQ, MongoDB, Socket.IO, Nginx, Docker and React.</p>
        <a className="repo-link" href={REPO_URL} target="_blank" rel="noreferrer">
          <GitBranch size={16} aria-hidden="true" /> Read the code on GitHub
        </a>
      </footer>
    </div>
  );
}
