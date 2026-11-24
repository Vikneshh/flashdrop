import { fmt } from '../format.js';

/**
 * Horizontal bars with the label and value written out (single series,
 * so no legend).
 *
 *   rows: [{ label, hint, value, icon }]
 */
export function BarList({ rows, emptyText }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.some((r) => r.value > 0)) return <p className="muted">{emptyText}</p>;

  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${fmt(r.value)}`}>
          <div className="barlist-text">
            <span className="barlist-label">
              {r.icon && <r.icon size={15} aria-hidden="true" />}
              {r.label}
              {r.hint && <small>{r.hint}</small>}
            </span>
            <b>{fmt(r.value)}</b>
          </div>
          <div className="barlist-track">
            <div className="barlist-bar" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
