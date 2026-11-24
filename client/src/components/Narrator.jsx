import { Sparkles, Loader2, PartyPopper, CircleAlert } from 'lucide-react';
import { fmt } from '../format.js';

/**
 * One plain-English sentence describing what is happening right now.
 * This is the line a non-technical viewer actually reads.
 */
export function Narrator({ drop, sim }) {
  const running = sim && (sim.status === 'queued' || sim.status === 'running');
  const done = sim?.status === 'done';
  const sold = drop?.paid ?? 0;
  const total = drop?.initialStock ?? 0;
  const inLine = drop?.waitingRoom?.inLine ?? 0;
  const oversold = drop?.oversold ?? 0;

  let Icon = Sparkles;
  let tone = 'idle';
  let text = 'Ready. Pick how many shoppers to send, then press the button.';

  if (oversold > 0) {
    Icon = CircleAlert;
    tone = 'bad';
    text = `Something went wrong: ${fmt(oversold)} items were sold more than once.`;
  } else if (running && sim.status === 'queued') {
    Icon = Loader2;
    tone = 'busy';
    text = 'Getting the crowd ready…';
  } else if (running) {
    Icon = Loader2;
    tone = 'busy';
    text =
      sold === 0
        ? `${fmt(sim.buyers)} shoppers are rushing in. ${fmt(inLine)} are waiting in line right now.`
        : sold >= total
          ? `Sold out! All ${fmt(total)} items went to ${fmt(total)} different people. Wrapping up the stragglers…`
          : `${fmt(sold)} of ${fmt(total)} items sold so far, each to a different person. ${fmt(inLine)} still waiting in line.`;
  } else if (done) {
    Icon = PartyPopper;
    tone = 'good';
    text = `Done. ${fmt(sim.report?.sold ?? sold)} items sold, zero sold twice. Run it again with a bigger crowd?`;
  }

  return (
    <p className={`narrator ${tone}`} role="status" aria-live="polite">
      <Icon size={18} aria-hidden="true" className={tone === 'busy' ? 'spin' : undefined} />
      <span>{text}</span>
    </p>
  );
}
