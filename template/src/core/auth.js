// kasion framework — authentication: Firebase ID tokens (Google sign-in), verified with Google's public keys.
import { HttpError, b64urlBytes, b64urlJson } from './http.js';
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// ---- Firebase ID token verification ----
let jwkCache = { keys: null, exp: 0 };

async function getKeys() {
  if (jwkCache.keys && Date.now() < jwkCache.exp) return jwkCache.keys;
  const r = await fetch(JWK_URL);
  if (!r.ok) throw new HttpError(503, 'auth keys unavailable');
  const { keys } = await r.json();
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  const maxAge = m ? Number(m[1]) : 3600;
  const map = {};
  for (const k of keys) {
    map[k.kid] = await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  jwkCache = { keys: map, exp: Date.now() + maxAge * 1000 };
  return map;
}


async function verifyFirebase(req, projectId) {
  const ISSUER = 'https://securetoken.google.com/' + projectId;
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) throw new HttpError(401, 'missing token');
  const parts = m[1].trim().split('.');
  if (parts.length !== 3) throw new HttpError(401, 'invalid token');
  let header, payload, sig;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); sig = b64urlBytes(parts[2]); }
  catch { throw new HttpError(401, 'invalid token'); }
  if (header.alg !== 'RS256' || !header.kid) throw new HttpError(401, 'invalid token');
  const keys = await getKeys();
  let key = keys[header.kid];
  if (!key) { jwkCache.exp = 0; key = (await getKeys())[header.kid]; } // key rotation
  if (!key) throw new HttpError(401, 'invalid token');
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new HttpError(401, 'invalid token');
  const now = Math.floor(Date.now() / 1000);
  const skew = 60;
  if (payload.iss !== ISSUER || payload.aud !== projectId) throw new HttpError(401, 'invalid token');
  if (typeof payload.exp !== 'number' || payload.exp + skew < now) throw new HttpError(401, 'token expired');
  if (typeof payload.iat !== 'number' || payload.iat - skew > now) throw new HttpError(401, 'invalid token');
  if (typeof payload.auth_time !== 'number' || payload.auth_time - skew > now) throw new HttpError(401, 'invalid token');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new HttpError(401, 'invalid token');
  return payload;
}

// Local testing only: "Authorization: Bearer test:<uid>[:name]" signs in as that uid without Firebase when BOTH hold:
//   • TEST_AUTH="1" — put it in .dev.vars (git-ignored), never in wrangler.jsonc
//   • the request did not come through Cloudflare's edge (no cf-ray header) — true for `wrangler dev --local`,
//     never true in production, so a stray TEST_AUTH var cannot open a deployed app.
function testClaims(req, env) {
  if (!env || env.TEST_AUTH !== '1' || req.headers.get('cf-ray')) return null;
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!t.startsWith('test:')) return null;
  const [, uid, name] = t.split(':');
  return uid ? { sub: uid, email: uid + '@test.local', email_verified: true, name: name || uid } : null;
}
export async function authenticate(req, env, url, projectId) {
  return testClaims(req, env) || verifyFirebase(req, projectId);
}
// Token from ?token= (browsers cannot set headers on a WebSocket).
export function authenticateQuery(req, env, url, projectId) {
  const h = new Headers(req.headers); h.set('authorization', 'Bearer ' + (url.searchParams.get('token') || ''));
  return authenticate(new Request(req.url, { headers: h }), env, url, projectId);
}
export const isAdmin = (env, claims, varName = 'ADMIN_EMAILS') => !!claims && !!claims.email && claims.email_verified !== false &&
  String(env[varName] || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean).includes(String(claims.email).toLowerCase());
