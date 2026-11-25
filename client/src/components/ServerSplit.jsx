import { Server, Network } from 'lucide-react';
import { CardTitle } from './InfoTip.jsx';
import { fmt } from '../format.js';

/**
 * "Which server answered?" Sums requests per API server over the chart window.
 * Even bars = the load balancer is spreading the work.
 */
export function ServerSplit({ metrics }) {
  const totals = {};
  for (const p of metrics) {
    for (const [srv, n] of Object.entries(p.servers ?? {})) totals[srv] = (totals[srv] ?? 0) + n;
  }
  // Servers that answered anything in the last 5 seconds count as "busy now"
  const recent = new Set(metrics.slice(-5).flatMap((p) => Object.keys(p.servers ?? {})));

  const rows = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  const sum = rows.reduce((a, [, n]) => a + n, 0);

  return (
    <section className="card">
      <div className="card-head">
        <CardTitle
          icon={Network}
          title="Which server answered"
          tech="nginx · least_conn"
          info="The shoppers don't all hit one computer. A load balancer (Nginx) hands each request to whichever of the identical servers is least busy. Even bars mean the work is shared fairly. If one server crashes, the others take over."
        />
        {rows.length > 0 && <span className="big-number">{rows.length} <small className="unit">servers</small></span>}
      </div>

      {sum === 0 ? (
        <p className="muted">The split between servers appears here during a run.</p>
      ) : (
        <ul className="servers">
          {rows.map(([srv, n]) => {
            const pct = Math.round((n / sum) * 100);
            return (
              <li key={srv}>
                <span className={`server-icon ${recent.has(srv) ? 'on' : ''}`} aria-hidden="true">
                  <Server size={18} />
                </span>
                <div className="server-body">
                  <div className="barlist-text">
                    <span className="barlist-label">
                      <b>{srv}</b>
                      <small>{recent.has(srv) ? 'busy' : 'idle'}</small>
                    </span>
                    <span><b>{pct}%</b> <span className="server-count">{fmt(n)} requests</span></span>
                  </div>
                  <div className="barlist-track">
                    <div className="barlist-bar" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {sum > 0 && <p className="muted">Last 60 seconds of shopper traffic.</p>}
    </section>
  );
}
