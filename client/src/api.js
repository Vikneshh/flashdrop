// Empty in development (Vite proxies to the backend).
// In production set VITE_API_URL, e.g. https://api.flashdrop.example
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export async function startSimulation({ buyers, stock, chaos }) {
  const res = await fetch(`${API_BASE}/simulations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyers, stock, chaos }),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
