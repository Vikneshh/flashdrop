/**
 * Shared helpers for the demo scripts.
 *
 * Real buyers come from different IP addresses. Our scripts all run on one
 * machine, so we give each fake buyer its own fake IP via X-Forwarded-For
 * (the API only trusts that header from localhost — see config.trustProxy).
 */
export function fakeIp(userId = 'anon') {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `10.${(h >> 16) & 255}.${(h >> 8) & 255}.${h & 255}`;
}

export function apiClient(baseUrl) {
  const request = (method, path, body, ip) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': ip ?? fakeIp(body?.userId ?? path),
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ httpStatus: r.status, ...(await r.json().catch(() => ({}))) }));

  return {
    post: (path, body, ip) => request('POST', path, body, ip),
    get: (path, ip) => request('GET', path, undefined, ip),
  };
}
