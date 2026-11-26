// Empty in development (Vite proxies to the backend).
// In production set VITE_API_URL, e.g. https://api.flashdrop.example
// Render passes a bare hostname ("flashdrop-api.onrender.com"), so add https:// if missing.
const raw = import.meta.env.VITE_API_URL ?? '';
export const API_BASE = raw && !/^https?:\/\//.test(raw) ? `https://${raw}` : raw;

/** Crowd caps set by the server (smaller on the free demo server). */
export async function getLimits() {
  try {
    const res = await fetch(`${API_BASE}/simulations/limits`);
    return res.ok ? await res.json() : null;
  } catch {
    return null; // server asleep / unreachable: keep the defaults
  }
}

export async function startSimulation({ buyers, stock, chaos }) {
  const res = await fetch(`${API_BASE}/simulations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyers, stock, chaos }),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
