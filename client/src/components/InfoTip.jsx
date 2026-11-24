import { Info } from 'lucide-react';

/**
 * Small (i) button that explains a card in plain English.
 * Works on hover AND keyboard focus / tap (focus-within), not hover only.
 */
export function InfoTip({ children }) {
  return (
    <span className="infotip">
      <button type="button" className="infotip-btn" aria-label="What does this mean?">
        <Info size={15} aria-hidden="true" />
      </button>
      <span role="tooltip" className="infotip-body">{children}</span>
    </span>
  );
}

/** Card heading: icon + plain title + optional tech tag + optional explainer. */
export function CardTitle({ icon: Icon, title, tech, info }) {
  return (
    <div className="card-title">
      {Icon && (
        <span className="icon-tile" aria-hidden="true">
          <Icon size={17} />
        </span>
      )}
      <h2>{title}</h2>
      {tech && <span className="tech-tag">{tech}</span>}
      {info && <InfoTip>{info}</InfoTip>}
    </div>
  );
}
