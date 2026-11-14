# Server guide

Everything under `src/core/` is shared; your app code lives in `src/worker.js` (split into more files when it grows).

## App and routes

```js
import { createApp, HttpError } from './core/app.js';
export { Hub } from './core/hub.js';           // the Durable Object must be exported from the entry file

const app = createApp({
  firebaseProject: 'kasion-dev',               // Firebase project that issues the ID tokens
  channels: async (c, name) => name === 'feed' || name.startsWith('room:'),   // who may join which realtime channel
  onMe: async (c, user) => ({ profile: … }),   // extra fields for POST /api/me
  adminVar: 'ADMIN_EMAILS',                    // env var with comma-separated admin emails (default shown)
  assets: async (req, env, url) => null,       // optional: return a Response to override static serving (e.g. per-host apps)
});

app.get('/api/things/:id', async (c) => c.json({ id: c.params.id }));
app.post('/api/things', handler);
app.delete('/api/things/:id', handler, { admin: true });
app.get('/api/public/things', handler, { public: true });
export default app;
```

Route options: `{ public: true }` no sign-in · `{ admin: true }` admin emails only · `{ ws: true }` WebSocket (use `app.ws`) ·
`{ noUser: true }` signed in but no `users` row needed.

A route that matches the path with another method answers 405; no match answers 404. Throw `new HttpError(status, 'ข้อความ')`
for expected failures (the message is shown to the user, so write it in Thai); anything else becomes a logged 500.

## The context `c`

| | |
|---|---|
| `c.me`, `c.claims`, `c.user` | uid, token claims, the `users` row (`uid, email, name, photo, blocked`) |
| `c.db`, `c.env`, `c.now` | D1 binding, env, `Date.now()` for this request |
| `c.params`, `c.url`, `c.req` | path params (decoded), URL, Request |
| `await c.body()` | parsed JSON body (never throws; `{}` when empty) |
| `c.json(data, status?)` | JSON response, `no-store` |
| `c.str(v, max)` | trimmed, length-capped string |
| `await c.rate(sql, windowMs, max)` | 429 when `sql` (binds: uid, since) counts ≥ max |
| `c.isAdmin()` | boolean |
| `await c.toUser(uid, payload)` | realtime event to all of that user's open tabs; returns sockets reached |
| `await c.toChannel(name, payload, skipUids?)` | realtime event to a shared channel; `skipUids` do not receive it (blocks) |
| `await c.channelCount(name)` | people connected to a channel |
| `await c.notify(uid, payload, note)` | realtime, and Web Push `{title, body, url, tag, icon}` when the user has no open socket |

## Built-in routes

- `POST /api/me` — call once after sign-in; upserts `users`. The client does this for you (`requireUser`).
- `GET /api/ws?token=` — the user's own socket. `GET /api/live/:chan/ws?token=` — a shared channel.

## Plugins

```js
app.use(images({ folders: /^(avatars|chat(\/[\w-]{1,80})?|uploads)$/ }));
app.use(push());
app.use(chat({
  canMessage: async (c, peer) => { if (await blocked(c, peer)) throw new HttpError(403, '…'); },
  profileOf: async (c, uid) => ({ name, photo }),   // defaults to the users table
  hidden: async (c) => [...uidsIBlockedOrWhoBlockedMe],
  perMinute: 40, chatUrl: '/chat',
}));
app.use(calls({ canCall: async (c, peer) => { … } }));
```

`pay.js` exports functions (`createCharge`, `getCharge`, `inspectSlip`, `markPaid`) — write your own routes and ledger
around them and always compare the paid amount with your own record before crediting.

## Database

- `migrations/0001_core.sql` holds the core tables (`users, images, push_subs, messages, chat_reads, calls`). Do not edit it.
- Your tables go in `0002_*.sql`, `0003_*.sql`, … Apply with `npm run migrate:local` and `npm run migrate`.
- Times are integer milliseconds. Money is integer cents/satang. JSON columns are TEXT parsed with `pj()`.
- Use numbered placeholders (`?1`) when a value repeats. Never mix numbered and anonymous `?` in one statement.
- Atomic updates: `db.batch([...])` with a guard such as `WHERE balance >= ?1` and `changes() > 0` on the dependent statement.
- Recount instead of `+1` for counters people can double-tap (`SET like_n = (SELECT COUNT(*) …)`).

## Config and secrets

`wrangler.jsonc` vars: `ADMIN_EMAILS`, `VAPID_PUBLIC`, `AGORA_APP_ID`, `PUSH_SUBJECT`.
Secrets (`wrangler secret put`): `VAPID_PRIVATE` (via `npm run push:keys`), `AGORA_APP_CERTIFICATE`, `PAY_API_KEY`.
`.dev.vars` (git-ignored): `TEST_AUTH=1` for local fake sign-in — it only works for requests without a `cf-ray` header.
