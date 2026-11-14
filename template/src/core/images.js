// Image storage in D1. Images arrive already compressed by the browser (WebP/JPEG ≤ ~400 KB).
// POST /api/images {dataUrl, folder} (auth) → {id, url}; GET /api/images/:id (public, immutable cache) → bytes.
const MAX_BYTES = 900 * 1024; // D1 rows are limited to ~1–2 MB; keep well below
const DEFAULT_FOLDERS = /^(avatars|profiles|chat(\/[\w-]{1,80})?|uploads)$/;

function decodeDataUrl(s) {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ''));
  if (!m) return null;
  let bin; try { bin = atob(m[2]); } catch { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes };
}

// Public read; called before auth. Returns a Response or null when the path isn't an image route.
export async function serveImage(req, env, path) {
  const m = /^\/api\/images\/([a-f0-9-]{36})$/.exec(path);
  if (!m || req.method !== 'GET') return null;
  const row = await env.DB.prepare('SELECT mime, data FROM images WHERE id = ?').bind(m[1]).first();
  if (!row) return new Response('not found', { status: 404 });
  const body = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data).buffer;
  return new Response(body, { headers: { 'content-type': row.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}

// Authenticated upload. `me` = Firebase uid. Returns a Response or null.
export async function uploadImage(req, env, path, me, json, HttpError, FOLDERS = DEFAULT_FOLDERS) {
  if (path !== '/api/images' || req.method !== 'POST') return null;
  let b = {};
  try { b = await req.json(); } catch {}
  const folder = String(b.folder || 'uploads');
  if (!FOLDERS.test(folder)) throw new HttpError(400, 'invalid folder');
  const img = decodeDataUrl(b.dataUrl);
  if (!img) throw new HttpError(400, 'dataUrl must be a base64 webp/jpeg/png image');
  if (img.bytes.length > MAX_BYTES) throw new HttpError(413, 'รูปใหญ่เกินไป');
  // simple per-user rate limit: 60 uploads / 10 min
  const recent = await env.DB.prepare('SELECT COUNT(*) n FROM images WHERE uid = ? AND created_at > ?').bind(me, Date.now() - 600000).first();
  if (recent && recent.n >= 60) throw new HttpError(429, 'อัปโหลดถี่เกินไป ลองใหม่อีกสักครู่');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO images (id, uid, folder, mime, data, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, me, folder, img.mime, img.bytes, img.bytes.length, Date.now()).run();
  return json({ id, url: '/api/images/' + id, size: img.bytes.length });
}

// Plugin: GET /api/images/:id (public, cached forever) and POST /api/images {dataUrl, folder}.
// `folders` = RegExp of allowed folder names.
import { HttpError as _HttpError, json as _json } from './http.js';
export const images = (opts = {}) => (app) => {
  app.get('/api/images/:id', async (c) => (await serveImage(c.req, c.env, c.path)) || new Response('not found', { status: 404 }), { public: true });
  app.post('/api/images', (c) => uploadImage(c.req, c.env, c.path, c.me, _json, _HttpError, opts.folders || DEFAULT_FOLDERS));
};
