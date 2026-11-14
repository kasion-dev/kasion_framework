# Recipes

## A realtime feed (posts, notes, orders board)

Server: allow the channel, broadcast on change.
```js
const app = createApp({ channels: async (c, name) => name === 'feed' });
app.post('/api/posts', async (c) => {
  …insert…
  await c.toChannel('feed', { type: 'post', post: view(row, null), by: c.me }, await blockedWith(c));   // skip blocked pairs
  return c.json({ post: view(row, c.me) });
});
```
Client: load once, then merge events; reload when the socket reconnects.
```js
liveChannel('feed', ev => { if (ev.type === 'post' && ev.by !== me.uid && !have(ev.post.id)) prepend(ev.post); },
            again => { if (again) this.load(); });
```
The sender already has their own item from the POST response — ignore events where `ev.by === me.uid`.
If the reader has scrolled down, hold new items behind a "N new" button instead of pushing the page (see kasion_date `index.html`).

## Group chat rooms

One channel per room: `channels: async (c, name) => name.startsWith('room:') && roomExists(c, name.slice(5))`,
`c.toChannel('room:' + id, { type: 'room_msg', … })`, client `liveChannel('room:' + id, …)`. The hub sends
`{ type: 'count', n }` whenever someone joins or leaves. Full example: kasion_date `room.html` + `/api/rooms`.

## Direct messages

`app.use(chat())` + `public/chat.html` are ready. Open a conversation with `/chat?with=m_<uid>`.
Restrict who can talk with `canMessage`; hide blocked people with `hidden`.

## Notify one user

```js
await c.notify(uid, { type: 'order_ready', id }, { title: 'ออเดอร์พร้อมแล้ว', body: '…', url: '/order?id=' + id, tag: 'order' });
```
Open app → `chatLive.on(ev => { if (ev.type === 'order_ready') … })`. Closed app → Web Push (after `npm run push:keys`).

## Image upload

```js
const r = await pickImage('uploads');            // null when cancelled
if (r) await api('/api/things', { method: 'POST', body: { img: r.url } });   // r.url = '/api/images/<id>'
```
Server: accept only `^/api/images/[a-f0-9-]{36}$`. Never accept arbitrary `https://` image URLs from users (IP leak).

## Admin-only page

Route: `app.get('/api/admin/x', handler, { admin: true })`. Page: `const me = await requireUser(); if (!me.admin) …show "no access"`.
Set `ADMIN_EMAILS` in `wrangler.jsonc`. Reference: kasion_date `admin.html` (reports, removal, suspension, stats).

## Onboarding before use

`app.config.js`: `setup: { needed: me => !me.profile || !me.profile.complete, url: '/profile?setup=1' }` and return `profile`
from `onMe`. `requireUser()` then redirects unfinished accounts; the setup page itself is exempt.

## PromptPay top-up (pay.kasion.dev)

`createCharge(env, { appId, orderRef, userRef, amount })` → show the QR → the browser reads the slip → `inspectSlip` →
on `paid`, credit in ONE batch guarded by status: `UPDATE charges SET status='paid' WHERE id=? AND status='pending'`,
then `UPDATE wallets … WHERE changes() > 0`. Reference: kasion_delivery `/api/credit/*`, `topup.html`.

## Several apps on one Worker (customer / rider / merchant hosts)

`createApp({ assets: (req, env, url) => … })`: map `rider.<domain>` to `public/rider/…` and fall back to shared files.
Reference: kasion_delivery `export default` in `src/worker.js`.

## Public pages (no sign-in)

`{ public: true }` route + `softUser()` on the page. Return only safe fields (no uid, email). Cache with
`c.json(data, 200, { 'cache-control': 'public, max-age=20' })`.

## Maps

Not in the core. kasion_delivery `public/maps.js` (Leaflet + OSM + OSRM, region switch) can be copied when needed.
