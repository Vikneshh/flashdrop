import { Package } from 'lucide-react';
import { fmt } from '../format.js';

/**
 * One square per item in the drop: sold, on hold, or still available.
 * Watching the squares flip colour is the fastest way to "see" a drop.
 */
export function InventoryGrid({ drop }) {
  if (!drop) {
    return (
      <div className="empty">
        <Package size={28} aria-hidden="true" />
        <p>No sale yet. Press <b>Send shoppers</b> to start one.</p>
      </div>
    );
  }

  const { initialStock, paid, onHold, available } = drop;
  const cells = Array.from({ length: initialStock }, (_, i) =>
    i < paid ? 'sold' : i < paid + onHold ? 'held' : 'free'
  );

  return (
    <>
      <div className="legend" aria-hidden="true">
        <span><i className="swatch sold" /> Sold <b>{fmt(paid)}</b></span>
        <span><i className="swatch held" /> Being paid for <b>{fmt(onHold)}</b></span>
        <span><i className="swatch free" /> Still available <b>{fmt(available)}</b></span>
      </div>
      <div
        className={`inventory ${initialStock > 400 ? 'dense' : ''}`}
        role="img"
        aria-label={`${paid} sold, ${onHold} being paid for, ${available} available out of ${initialStock}`}
      >
        {cells.map((state, i) => (
          <span key={i} className={`cell ${state}`} />
        ))}
      </div>
    </>
  );
}
