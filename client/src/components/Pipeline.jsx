import { Users, UserX, DoorOpen, Timer, CreditCard, Database } from 'lucide-react';
import { fmt } from '../format.js';

/**
 * The journey of a buyer, left to right, with live counts at each stage.
 * Plain label first, the engineering term underneath.
 */
export function Pipeline({ drop }) {
  const d = drop ?? {};
  // Once everything is sold, whoever is still in line was turned away. Say so instead of "waiting".
  const soldOut = drop && d.available === 0 && d.onHold === 0;
  const stages = [
    soldOut
      ? { icon: UserX, label: 'Turned away, sold out', value: d.waitingRoom?.inLine, tech: 'line closed' }
      : { icon: Users, label: 'Waiting in line', value: d.waitingRoom?.inLine, tech: 'Redis sorted set' },
    { icon: DoorOpen, label: 'Let in to shop', value: d.waitingRoom?.admitted, tech: 'admission control' },
    { icon: Timer, label: 'Holding an item', value: d.onHold, tech: '5s reservation (TTL)' },
    { icon: CreditCard, label: 'Paid', value: d.paid, tech: 'atomic Lua script' },
    { icon: Database, label: 'Order saved', value: d.ordersSaved, tech: 'BullMQ → MongoDB' },
  ];

  return (
    <section aria-labelledby="journey">
      <h2 id="journey" className="section-title">The shopper journey, live</h2>
      <ol className="pipeline">
        {stages.map((s) => (
          <li key={s.label}>
            <span className="pipeline-label"><s.icon size={15} aria-hidden="true" /> {s.label}</span>
            <span className="pipeline-value">{fmt(s.value ?? 0)}</span>
            <span className="pipeline-hint">{s.tech}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
