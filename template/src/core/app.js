// kasion framework — the app: a tiny router with auth, the users table, realtime sockets and plugins.
//
//   const app = createApp({ firebaseProject: 'kasion-dev' });
//   app.use(images()); app.use(push()); app.use(chat());
//   app.get('/api/notes', async (c) => c.json({ notes: … }));
//   app.post('/api/admin/purge', handler, { admin: true });
//   export default app;  export { Hub } from './core/hub.js';
//
// Route options: { public: true } no sign-in · { admin: true } email must be in ADMIN_EMAILS · { ws: true } WebSocket (token in ?token=)
//                { noUser: true } signed in but the users row is not required (used by POST /api/me)
import { HttpError, json, readBody, str, dec } from './http.js';
import { authenticate, authenticateQuery, isAdmin } from './auth.js';
import { hubPush, hubCount } from './hub.js';
import { pushUser } from './push.js';

export function createApp(cfg = {}) {
  const project = cfg.firebaseProject || 'kasion-dev';
  const routes = [];
  // Things features share with each other without importing one another:
  const services = {};        // name → fn, e.g. 'profileOf', 'hidden'
  const channelRules = [];    // (c, name) → true to allow joining a realtime channel
  const meHooks = [];         // (c, user) → extra fields for POST /api/me
  const adminContent = [];    // { kind, label, list(c), remove(c, id) } shown in the admin "content" tab
  const add = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:[a-zA-Z_]+/g, (k) => { keys.push(k.slice(1)); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler, opts });
    return app;
  };
  const app = {
    cfg,
    get: (p, h, o) => add('GET', p, h, o), post: (p, h, o) => add('POST', p, h, o), put: (p, h, o) => add('PUT', p, h, o),
    patch: (p, h, o) => add('PATCH', p, h, o), delete: (p, h, o) => add('DELETE', p, h, o),
    // WebSocket route: handler(c) must return a Response (usually a Hub fetch).
    ws: (p, h, o) => add('GET', p, h, { ...o, ws: true }),
    use(plugin) { plugin(app, cfg); return app; },
    // Feature wiring ---------------------------------------------------------------------------------------------
    // provide('profileOf', async (c, uid) => ({ name, photo })) — later providers replace earlier ones.
    provide(name, fn) { services[name] = fn; return app; },
    // service('hidden') → the registered fn, or the given default.
    service(name, fallback) { return services[name] || fallback; },
    // allowChannel((c, name) => name === 'feed') — who may open /api/live/<name>/ws
    allowChannel(fn) { channelRules.push(fn); return app; },
    // onMe(async (c, user) => ({ profile })) — merged into the POST /api/me response
    onMe(fn) { meHooks.push(fn); return app; },
    // adminContent({ kind: 'post', label: 'โพสต์', list: async (c) => [{ id, uid, name, text, img, at }], remove: async (c, id) => {} })
    adminContent(def) { adminContent.push(def); return app; },
    adminContents: () => adminContent,

    async fetch(req, env, ctx) {
      const url = new URL(req.url);
      if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
        if (cfg.assets) { const r = await cfg.assets(req, env, url); if (r) return r; }
        return env.ASSETS.fetch(req);
      }
      try { return await handle(req, env, ctx, url); }
      catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        console.error(e);
        return json({ error: 'server error' }, 500);
      }
    },
  };

  async function handle(req, env, ctx, url) {
    const path = url.pathname.replace(/\/+$/, '');
    let route = null, match = null, seen = false;
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      seen = true;
      if (r.method === req.method) { route = r; match = m; break; }
    }
    if (!route) throw new HttpError(seen ? 405 : 404, seen ? 'method not allowed' : 'not found');
    const now = Date.now(), db = env.DB;
    const c = {
      req, env, ctx, url, path, method: req.method, db, now, params: {},
      json, str,
      // parsed JSON body (cached)
      body: async () => (c._body ||= await readBody(req)),
      // throw 429 when `sql` (binds: me, since) counts `max` or more rows in the last `windowMs`
      rate: async (sql, windowMs, max) => { const r = await db.prepare(sql).bind(c.me, now - windowMs).first(); if (r && r.n >= max) throw new HttpError(429, 'ส่งถี่เกินไป รอสักครู่แล้วลองใหม่'); },
      // realtime: to one user's devices, or to a shared channel ('ch:' is added for you). Returns sockets reached.
      toUser: (uid, payload) => hubPush(env, uid, payload),
      toChannel: (name, payload, skipUids) => hubPush(env, 'ch:' + name, payload, skipUids),
      channelCount: (name) => hubCount(env, 'ch:' + name),
      // realtime first, Web Push when that user has no open socket (app closed). note = { title, body, url, tag, icon }
      notify: async (uid, payload, note) => { const n = await hubPush(env, uid, payload); if (!n && note) await pushUser(env, uid, note); return n; },
      isAdmin: () => isAdmin(env, c.claims, cfg.adminVar),
      // shared services with safe defaults
      profileOf: async (uid) => { const f = services.profileOf; if (f) { const p = await f(c, uid); if (p) return p; } const u = await db.prepare('SELECT name, photo FROM users WHERE uid = ?').bind(uid).first(); return u || { name: 'ผู้ใช้', photo: null }; },
      // uids whose content I must not see and who must not see mine (blocks). [] when no safety feature is installed.
      hidden: async () => (c._hidden ||= services.hidden ? await services.hidden(c) : []),
      service: (name, fallback) => services[name] || fallback,
    };
    route.keys.forEach((k, i) => { c.params[k] = dec(match[i + 1]); });
    const o = route.opts;
    if (o.ws && req.headers.get('upgrade') !== 'websocket') throw new HttpError(426, 'websocket required');
    if (!o.public) {
      c.claims = o.ws ? await authenticateQuery(req, env, url, project) : await authenticate(req, env, url, project);
      c.me = c.claims.sub;
      if (!o.noUser) {
        c.user = await db.prepare('SELECT uid, email, name, photo, blocked FROM users WHERE uid = ?').bind(c.me).first();
        if (!c.user) throw new HttpError(401, 'call POST /api/me first');
        if (c.user.blocked) throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
      }
      if (o.admin && !c.isAdmin()) throw new HttpError(403, 'admin only');
    }
    return route.handler(c);
  }

  // ---- built in: account row, personal socket, shared channels ----
  // POST /api/me — call once after sign-in: creates/updates the users row. cfg.onMe(c, user) may return extra fields.
  app.post('/api/me', async (c) => {
    const cl = c.claims, email = cl.email ? String(cl.email).toLowerCase() : null;
    const name = str(cl.name || (email ? email.split('@')[0] : 'ผู้ใช้'), 60);
    const photo = typeof cl.picture === 'string' && cl.picture.startsWith('https://') ? cl.picture.slice(0, 500) : null;
    if (email) await c.db.prepare('UPDATE users SET email = NULL WHERE email = ? AND uid != ?').bind(email, c.me).run();
    await c.db.prepare(`INSERT INTO users (uid, email, name, photo, last_seen, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
      ON CONFLICT(uid) DO UPDATE SET email = excluded.email, name = excluded.name, photo = excluded.photo, last_seen = excluded.last_seen`)
      .bind(c.me, email, name, photo, c.now).run();
    const u = await c.db.prepare('SELECT * FROM users WHERE uid = ?').bind(c.me).first();
    if (u.blocked) throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
    c.user = u;
    let extra = cfg.onMe ? (await cfg.onMe(c, u)) || {} : {};
    for (const h of meHooks) extra = { ...extra, ...((await h(c, u)) || {}) };
    return c.json({ user: { uid: u.uid, name: u.name, email: u.email, photo: u.photo }, admin: c.isAdmin(), ...extra });
  }, { noUser: true });
  // The signed-in user's own socket (all their tabs/devices).
  app.ws('/api/ws', (c) => env_hub(c.env, c.me).fetch(new Request('https://hub/ws', c.req)));
  // Shared channel socket. cfg.channels(c, name) decides who may join which channel (default: nobody).
  app.ws('/api/live/:chan/ws', async (c) => {
    const name = c.params.chan;
    let allowed = /^[a-z0-9:_-]{1,40}$/.test(name) && !!cfg.channels && !!(await cfg.channels(c, name));
    if (!allowed && /^[a-z0-9:_-]{1,40}$/.test(name)) for (const rule of channelRules) { if (await rule(c, name)) { allowed = true; break; } }
    if (!allowed) throw new HttpError(404, 'channel not found');
    return env_hub(c.env, 'ch:' + name).fetch(new Request('https://hub/ws?count=1&uid=' + encodeURIComponent(c.me), c.req));
  });
  const env_hub = (env, name) => env.HUB.get(env.HUB.idFromName(name));
  return app;
}
export { HttpError, json, str } from './http.js';
