# __APP_TITLE__ — project notes for Claude

Built with kasion_framework (see `src/core/VERSION`). Live at https://__DOMAIN__ · Worker `__WORKER_NAME__` · D1 `__DB_NAME__`.

## Working here

- `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` before any wrangler/npm command (needs Node 22).
- `npm run dev` → http://localhost:8787/?as=alice (fake sign-in, local only; `?as=bob` in a second tab for the other side).
- `npm run check` before every deploy; `npm run deploy` runs it for you. `npm run migrate` applies new migrations to production.
- Confirm before `git commit`. Reply in Thai; code and comments in English.

## Layout

- `src/worker.js` — this app's routes. `src/core/` — framework modules; do not edit here (fix in kasion_framework, then copy).
- `migrations/` — `0001_core.sql` is the framework's; add `0003_*.sql` and up, never edit applied files.
- `public/app.config.js` — name, colours, tabs, feature switches. `public/kasion.js` — framework runtime (do not edit).
- `public/*.html` — screens. Copy `_blank.html` to start one. The `notes` feature (`index.html`, `/api/notes`,
  `0002_app.sql`) is a demo of the patterns: replace it.

## Conventions

- Server decides money, permissions and status changes; the client only asks.
- Thai error messages in `HttpError` (they are shown to users). Times in ms, money in integer satang.
- Nothing returned to other users may contain email or other private fields.
- Guides: `../kasion_framework/docs/` (server.md, runtime.md, recipes.md, gotchas.md).

## Still to do by the owner (once)

- Firebase Console → Authentication → Authorized domains → add `__DOMAIN__`.
- Optional: `npm run push:keys` (Web Push); calls need `AGORA_APP_ID` + `npx wrangler secret put AGORA_APP_CERTIFICATE`.
