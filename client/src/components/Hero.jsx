import { Users, DoorOpen, Timer, BadgeCheck, Zap } from 'lucide-react';

const STEPS = [
  { icon: Users, title: 'Join the line', text: 'Everyone gets a fair place in a virtual waiting room. No refresh-spamming.' },
  { icon: DoorOpen, title: 'Get let in', text: 'Small groups are let in, only as many as there are items left.' },
  { icon: Timer, title: 'Item held for you', text: 'Your item is locked for 5 seconds while you pay. Nobody else can take it.' },
  { icon: BadgeCheck, title: 'Paid & saved', text: 'The order is confirmed and safely stored, even if the payment system glitches.' },
];

/**
 * The "what am I looking at?" section, written for anyone:
 * recruiters, juniors, non-technical visitors.
 */
export function Hero({ connected }) {
  return (
    <header className="hero">
      <div className="hero-top">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true"><Zap size={18} /></span>
          Flashdrop
        </span>
        <span className={`connection ${connected ? 'on' : 'off'}`}>
          <i aria-hidden="true" /> {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      <h1>
        5,000 people. 300 items.
        <br />
        <span className="hero-accent">Nobody gets sold the same thing twice.</span>
      </h1>
      <p className="hero-lede">
        Think of concert tickets or sneakers going on sale. Thousands rush in at once, and many
        websites crash or sell the same seat to two people. Flashdrop is a backend built to stay
        fair under that rush. Press the button below to send a crowd of simulated shoppers
        (bots and line-cutters included) and watch it hold up live.
      </p>

      <ol className="steps" aria-label="How a purchase works">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="step-icon" aria-hidden="true"><s.icon size={18} /></span>
            <span className="step-num">Step {i + 1}</span>
            <strong>{s.title}</strong>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
    </header>
  );
}
