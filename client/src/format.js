const nf = new Intl.NumberFormat('en-US');

export const fmt = (n) => (n == null || Number.isNaN(n) ? '—' : nf.format(n));

export const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${fmt(ms)}ms`);

/** Round a max value up to a "nice" axis top: 1, 2, 5 × 10^n */
export function niceMax(value) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}
