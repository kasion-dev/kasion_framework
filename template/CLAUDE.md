# __APP_TITLE__ — project notes for Claude

Built with kasion_framework (see `src/core/VERSION`). Live at https://__DOMAIN__ · Worker `__WORKER_NAME__` · D1 `__DB_NAME__`.

## Working here

- `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` before any wrangler/npm command (needs Node 22).
- `npm run dev` → http://localhost:8787/?as=alice (fake sign-in, local only; `?as=bob` in a second tab for the other side).
- `npm run check` before every deploy; `npm run deploy` runs it for you. `npm run migrate` applies new migrations to production.
- Confirm before `git commit`. Commit messages never mention Claude (no `Co-Authored-By`, no "Generated with" line).
- Reply in Thai; code and comments in English.

## Layout

- `src/worker.js` — this app's routes. `src/core/` — framework modules; do not edit here (fix in kasion_framework, then copy).
- `migrations/` — `0001_core.sql` is the framework's; add the next free number, never edit applied files.
- `src/features/` — optional modules installed with `npm run kasion -- add <feature>` (`npm run kasion -- list`; installed ones are in `.kasion.json`). Check there before writing profiles, blocks, a feed, rooms, admin or a wallet by hand.
- `public/app.config.js` — name, colours, tabs, feature switches. `public/kasion.js` — framework runtime (do not edit).
- `public/*.html` — screens, written with Vue 3 + Vant 4 (no build; `../kasion_framework/docs/vue.md`). Copy `blank.html` to start one. The `notes` feature (`index.html`, `/api/notes`,
  `0002_app.sql`) is a demo of the patterns: replace it.

## Conventions

- Server decides money, permissions and status changes; the client only asks.
- Thai error messages in `HttpError` (they are shown to users). Times in ms, money in integer satang.
- Nothing returned to other users may contain email or other private fields.
- Guides: `../kasion_framework/docs/` (vue.md, features.md, server.md, recipes.md, gotchas.md; runtime.md for the older DC pages).

## Still to do by the owner (once)

- Firebase Console → Authentication → Authorized domains → add `__DOMAIN__`.
- Optional: `npm run push:keys` (Web Push); calls need `AGORA_APP_ID` + `npx wrangler secret put AGORA_APP_CERTIFICATE`.
