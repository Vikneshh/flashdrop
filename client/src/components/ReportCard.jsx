import { ShieldCheck, ShieldAlert, Clock, MousePointerClick, Gauge, Zap, Flame, CircleCheck, Server } from 'lucide-react';
import { fmt, fmtMs } from '../format.js';

/**
 * The scoreboard after a run finishes. This is the screenshot people share.
 */
export function ReportCard({ sim }) {
  if (sim?.status !== 'done' || !sim.report) return null;
  const r = sim.report;
  const clean = r.oversold === 0 && r.balanced;
  const servers = Object.entries(r.servers ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([, n]) => n);
  const serverTotal = servers.reduce((a, b) => a + b, 0) || 1;

  const proofs = [
    `No item was sold to two people, even with ${fmt(r.buyers)} people trying at once.`,
    'Bots and line-cutters were blocked automatically.',
    sim.chaos
      ? 'The payment system failed on purpose, and every order was still saved.'
      : 'Every paid order was saved to the database.',
  ];

  return (
    <section className={`card report ${clean ? '' : 'bad'}`} aria-live="polite">
      <div className="report-hero">
        <span className={`status ${clean ? 'good' : 'critical'}`}>
          {clean ? <ShieldCheck size={15} aria-hidden="true" /> : <ShieldAlert size={15} aria-hidden="true" />}
          {clean ? 'Passed: zero items sold twice' : `${fmt(r.oversold)} items sold twice`}
        </span>
        <h2>
          {fmt(r.buyers)} shoppers fought over {fmt(r.stock)} items.
          <br />
          {fmt(r.sold)} sold, each to exactly one person.
        </h2>
        {clean && (
          <ul className="proofs">
            {proofs.map((p) => (
              <li key={p}><CircleCheck size={16} aria-hidden="true" /> {p}</li>
            ))}
          </ul>
        )}
      </div>
      <dl className="report-stats">
        <Stat icon={Clock} label="Whole sale took" value={`${r.durationSeconds}s`} />
        <Stat icon={MousePointerClick} label="Requests handled" value={fmt(r.totalRequests)} />
        <Stat icon={Zap} label="Busiest second" value={fmt(r.peakRps)} unit=" req/s" />
        <Stat icon={Gauge} label="Typical response" value={`≤ ${fmtMs(r.p50)}`} />
        <Stat icon={Gauge} label="95% answered within" value={`≤ ${fmtMs(r.p95)}`} />
        {servers.length > 1 && (
          <Stat icon={Server} label={`Shared by ${servers.length} servers`} value={servers.map((n) => `${Math.round((n / serverTotal) * 100)}%`).join(' · ')} />
        )}
        {sim.chaos && <Stat icon={Flame} label="Chaos mode" value="on" />}
      </dl>
    </section>
  );
}

function Stat({ icon: Icon, label, value, unit }) {
  return (
    <div>
      <dt><Icon size={14} aria-hidden="true" /> {label}</dt>
      <dd>{value}{unit && <small>{unit}</small>}</dd>
    </div>
  );
}
