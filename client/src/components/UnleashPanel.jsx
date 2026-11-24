import { useState } from 'react';
import { Users, Package, Flame, Rocket, Loader2 } from 'lucide-react';
import { startSimulation } from '../api.js';
import { fmt } from '../format.js';
import { Narrator } from './Narrator.jsx';

/**
 * The big button. Pick a crowd size and stock, optionally break the
 * payment provider, and let them loose.
 */
export function UnleashPanel({ sim, drop }) {
  const [buyers, setBuyers] = useState(2000);
  const [stock, setStock] = useState(300);
  const [chaos, setChaos] = useState(false);
  const [message, setMessage] = useState(null);
  const [sending, setSending] = useState(false);

  const running = sim && (sim.status === 'queued' || sim.status === 'running');
  const progress = running && sim.buyers ? sim.finishedBuyers / sim.buyers : 0;
  const items = Math.min(stock, buyers);

  async function unleash() {
    setSending(true);
    setMessage(null);
    const res = await startSimulation({ buyers, stock: items, chaos });
    setSending(false);

    if (res.ok) return;
    if (res.reason === 'already_running') setMessage('Someone else just started one. Watch it live below.');
    else if (res.reason === 'cooldown') setMessage(`Cooling down. Try again in ${res.retryAfterSeconds}s.`);
    else if (res.reason === 'rate_limited') setMessage(`Easy there, one run per 30s. Try again in ${Math.ceil(res.retryAfterMs / 1000)}s.`);
    else setMessage('Something went wrong starting the simulation.');
  }

  return (
    <section className="card unleash" aria-labelledby="try-it">
      <div className="unleash-head">
        <h2 id="try-it">Try it yourself</h2>
        <p>
          {fmt(buyers)} shoppers will compete for {fmt(items)} items, about {Math.max(1, Math.round(buyers / items))} people per item.
        </p>
      </div>

      <div className="controls">
        <label className="control">
          <span className="control-label"><Users size={16} aria-hidden="true" /> Shoppers <b>{fmt(buyers)}</b></span>
          <input type="range" min="100" max="5000" step="100" value={buyers} disabled={running}
            onChange={(e) => setBuyers(Number(e.target.value))} />
        </label>
        <label className="control">
          <span className="control-label"><Package size={16} aria-hidden="true" /> Items for sale <b>{fmt(items)}</b></span>
          <input type="range" min="10" max="1000" step="10" value={stock} disabled={running}
            onChange={(e) => setStock(Number(e.target.value))} />
        </label>
        <label className={`control toggle ${chaos ? 'on' : ''}`}>
          <input type="checkbox" checked={chaos} disabled={running} onChange={(e) => setChaos(e.target.checked)} />
          <Flame size={18} aria-hidden="true" className="toggle-icon" />
          <span>
            <b>Chaos mode</b>
            <small>The payment system randomly fails 3 in 10 times. Can it still save every order?</small>
          </span>
        </label>
      </div>

      <button className="unleash-button" onClick={unleash} disabled={running || sending}>
        {running ? (
          <><Loader2 size={20} className="spin" aria-hidden="true" /> {fmt(sim.finishedBuyers)} of {fmt(sim.buyers)} shoppers done</>
        ) : (
          <><Rocket size={20} aria-hidden="true" /> Send {fmt(buyers)} shoppers</>
        )}
        {running && <span className="progress" style={{ transform: `scaleX(${progress})` }} />}
      </button>

      <Narrator drop={drop} sim={sim} />
      {message && <p className="notice" role="alert">{message}</p>}
    </section>
  );
}
