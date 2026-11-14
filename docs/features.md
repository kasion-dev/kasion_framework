# Features (optional modules)

```bash
node ../kasion_framework/bin/kasion.mjs list          # or: npm run kasion -- list
npm run kasion -- add feed rooms                      # inside an app
node bin/create.mjs my_app --with profile,safety,feed # at creation; --with all for everything
npm run kasion -- update                              # refresh src/core, kasion.js, vendor, installed feature servers
npm run kasion -- doctor                              # config sanity check
```

`add` copies `features/<name>/server.js` → `src/features/<name>.js`, the migration → next free number in `migrations/`,
pages → `public/`, registers the plugin in `src/worker.js` (at the `// kasion:` markers), adds a tab while there are
fewer than 5, and records it in `.kasion.json`. Then run `npm run migrate:local` (and `npm run migrate` for production).
Feature pages and migrations belong to the app after install: edit them freely. `update` only replaces server modules.

| Feature | Routes | Pages | Notes |
|---|---|---|---|
| `profile` | `GET/PUT /api/profile`, `GET /api/profiles/:uid` | `/profile`, `/user?id=` | provides `profileOf` + `profileCard`; `/api/me` returns `profile`; setup gate until the name is set. `profile({ required: ['name','photo'] })` |
| `safety` | `POST /api/block {target}`, `DELETE /api/block/:uid`, `GET /api/blocks`, `POST /api/report {target, reason, detail}` | (menu on `/user`) | provides `hidden`: chat, calls, feed, rooms, people hide blocked pairs both ways |
| `feed` | `GET/POST /api/feed`, `DELETE /api/feed/:id`, `POST /api/feed/:id/like`, `GET/POST /api/feed/:id/replies`, `GET /api/public/feed` | `/feed` | channel `feed`; guests can read |
| `rooms` | `GET /api/rooms`, `GET/POST /api/rooms/:id/messages` | `/rooms`, `/room?id=` | channel `room:<id>`; rooms are rows in `rooms` |
| `people` | `GET /api/people`, `POST/DELETE /api/location` | `/people` | distance rounded to coarse steps, coordinates never returned |
| `invites` | (adds `invite`, `invited` to `/api/me`) | — | share `location.origin + '/?ref=' + me.invite` |
| `admin` | `/api/admin/overview`, `users`, `users/:uid/ban`, `reports`, `reports/:id/resolve`, `content`, `content/:kind/:id` | `/admin` | admins = `ADMIN_EMAILS`; lists content of features that call `app.adminContent` |
| `wallet` | `GET /api/wallet`, `POST /api/wallet/topup`, `GET /api/wallet/charge/:id`, `POST …/slip`, `POST /api/admin/wallet/credit` | `/wallet` | needs secret `PAY_API_KEY`; use `spend(c, satang, title)` / `credit(c, uid, satang, title, kind, ref)` in your routes |
| `maps` | — | `maps.js` | client only (Leaflet + OSM + OSRM): `window.kmap` |

## How features talk to each other (and how to write your own)

A feature is `export const name = (opts) => (app) => { … }` in `src/features/`. Extension points on `app`:

- `app.provide('profileOf' | 'hidden' | <any>, fn)` / `app.service(name)` — shared services. In a route use `c.profileOf(uid)`
  (→ `{ name, photo }`) and `c.hidden()` (→ uids to hide for `c.me`); both have safe defaults when nothing provides them.
- `app.allowChannel(async (c, name) => bool)` — let people join a realtime channel.
- `app.onMe(async (c, user) => ({ … }))` — extra fields on `POST /api/me`.
- `app.adminContent({ kind, label, list(c), remove(c, id) })` — show and delete content in `/admin`.

Not verified against live services: wallet top-up through pay.kasion.dev (routes are tested up to the provider call).
