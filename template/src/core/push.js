// kasion framework — Web Push (RFC 8291 aes128gcm + VAPID) for devices with no open socket (app closed).
// Needs var VAPID_PUBLIC + secret VAPID_PRIVATE (JWK). Generate both with: node scripts/gen_vapid.mjs
import { HttpError, b64urlBytes } from './http.js';

const wpB64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const wpCat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
async function wpHkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
async function wpSend(env, sub, payload) {
  const te = new TextEncoder();
  const ua = b64urlBytes(sub.p256dh), authSecret = b64urlBytes(sub.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await wpHkdf(authSecret, shared, wpCat(te.encode('WebPush: info\0'), ua, localPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await wpHkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await wpHkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, wpCat(te.encode(JSON.stringify(payload)), new Uint8Array([2]))));
  const bodyBytes = wpCat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([65]), localPub, ct);
  // VAPID JWT (ES256)
  const jwk = JSON.parse(env.VAPID_PRIVATE);
  const signKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = wpB64(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = wpB64(te.encode(JSON.stringify({ aud: new URL(sub.endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.PUSH_SUBJECT || 'https://kasion.dev' })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signKey, te.encode(head + '.' + claims)));
  return fetch(sub.endpoint, { method: 'POST', body: bodyBytes, headers: {
    'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'high',
    authorization: 'vapid t=' + head + '.' + claims + '.' + wpB64(sig) + ', k=' + env.VAPID_PUBLIC } });
}
// Push to every device of `uid`; drops subscriptions the push service says are gone.
export async function pushUser(env, uid, payload) {
  if (!env.VAPID_PRIVATE || !env.VAPID_PUBLIC) return;
  try {
    const { results } = await env.DB.prepare('SELECT * FROM push_subs WHERE uid = ? LIMIT 5').bind(uid).all();
    await Promise.all(results.map(async (sub) => {
      try { const r = await wpSend(env, sub, payload); if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run(); }
      catch (e) { console.error('push', e); }
    }));
  } catch (e) { console.error('pushUser', e); }
}

// Plugin: device subscription routes + the public key.
export const push = () => (app) => {
  app.get('/api/public/push-key', (c) => c.json({ key: c.env.VAPID_PUBLIC || null }), { public: true });
  app.post('/api/push/subscribe', async (c) => {
    const b = await c.body(), ep = String(b.endpoint || ''), k = b.keys || {};
    if (!/^https:\/\/[a-z0-9.-]+\//i.test(ep) || ep.length > 1000 || !k.p256dh || !k.auth) throw new HttpError(400, 'invalid subscription');
    await c.db.prepare('INSERT INTO push_subs (endpoint, uid, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET uid = excluded.uid, p256dh = excluded.p256dh, auth = excluded.auth')
      .bind(ep, c.me, String(k.p256dh).slice(0, 200), String(k.auth).slice(0, 100), c.now).run();
    return c.json({ ok: true });
  });
  app.post('/api/push/unsubscribe', async (c) => {
    await c.db.prepare('DELETE FROM push_subs WHERE endpoint = ? AND uid = ?').bind(String((await c.body()).endpoint || ''), c.me).run();
    return c.json({ ok: true });
  });
};
