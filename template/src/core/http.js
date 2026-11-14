// kasion framework — small HTTP helpers shared by every module.
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export async function readBody(req) {
  try { return (await req.json()) || {}; } catch { return {}; }
}
// Trimmed, length-capped string from any input.
export const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
// JSON.parse that never throws.
export const pj = (s, d = null) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };
// Sorted pair, for "a < b" composite keys (friends, matches, threads).
export const pair = (x, y) => (x < y ? [x, y] : [y, x]);
export const dec = (v) => { try { return decodeURIComponent(v); } catch { throw new HttpError(400, 'bad path'); } };
export function b64urlBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
