# kasion_framework — instructions for Claude

This repo is the starter kit for kasion apps. When Kasidit asks for a new app (or a feature that an existing kasion app
needs), start here instead of writing infrastructure again.

## Starting a new app

1. `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` (wrangler needs Node 22; the default shell Node is 18).
2. `node bin/create.mjs <snake_case_name> --title "…" --domain <sub>.kasion.dev --accent "#RRGGBB" --admin kasidit.wans@gmail.com --provision`
   - Names are always snake_case (`kasion_notes`), never kebab-case. The Worker name is derived (`kasion-notes`).
   - `--provision` creates the D1 database and applies migrations. Creating cloud resources is fine when he asked for the app.
3. Build the feature in the new project: tables in `migrations/0002_*.sql`+, routes in `src/worker.js`, screens in `public/*.html`.
4. Verify locally (below), then `npm run deploy`. Ask before `git commit` unless he already said to commit/push.
5. Tell him the two things only he can do: add the domain to Firebase Authorized domains; paste secrets
   (`AGORA_APP_CERTIFICATE`, `PAY_API_KEY`) into `wrangler secret put` himself — never ask for secret values in chat.

## Rules that come from real incidents

- **No auto-commit.** Confirm before every commit. Deploys during a requested task are fine.
- **Never edit an applied migration.** Add a new numbered file.
- **Never put secrets or TEST_AUTH in `wrangler.jsonc`.** Secrets go through `wrangler secret put`; `TEST_AUTH=1` lives only in `.dev.vars`.
- **Reply in Thai**; code, comments and identifiers in English.
- **Do not edit `src/core/` or `public/kasion.js` inside an app** to add app behaviour. Use the plugin options and hooks
  (`canMessage`, `profileOf`, `hidden`, `channels`, `onMe`). If the core is wrong, fix it here, run `npm test`, then copy it into the app.
- **A variable declared with `const`/`let` later in the same function shadows earlier uses** — this caused a production 500
  (`const pub` hiding a helper). Name locals distinctly.
- **D1 allows 100 bound parameters per statement.** Cap `IN (…)` lists at 90.
- **Money, age and permission checks belong on the server.** Never trust an amount or a status sent by the client.
- **Anything returned to another user must not contain email, exact birth date or coordinates.**

## Verifying work (do this instead of asking him to test)

- `npm run check` — syntax of every page script and Worker module, plus a hint for template names missing from `renderVals`.
- `npm run dev` then open `http://localhost:8787/?as=alice` (and `?as=bob` in another tab): fake sign-in, local only.
  With curl: `-H "authorization: Bearer test:alice"`. Call `POST /api/me` once per test user first.
- Realtime: post as one user with curl while a page is open as another; the page must update without reload.
- In this repo: `npm test` runs the whole smoke suite against a freshly generated app.
- Say plainly what was not tested (real Google sign-in, real phones, calls with camera/mic need real devices).

## Where things are

- `template/src/core/` server modules · `template/public/kasion.js` client runtime · `template/public/*.html` starter screens
- `docs/server.md`, `docs/runtime.md`, `docs/recipes.md`, `docs/gotchas.md` — read the relevant one before writing code
- Reference apps built on the same pieces: `../kasion_date` (community + dating: board, rooms, admin, invites, location)
  and `../kasion_delivery` (customer / rider / merchant / admin, maps, wallet + pay.kasion.dev top-ups, host-based routing)

## Changing the framework

Edit `template/`, bump `version` in `package.json`, run `npm test` (must pass), update the docs that describe what changed.
