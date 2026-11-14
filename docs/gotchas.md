# Gotchas — mistakes already made once

**Tooling**
- wrangler needs Node 22: `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`. The shell default (18) fails.
- Cloudflare error `10013` on deploy is on their side (check cloudflarestatus.com). Uploading unchanged code fails the same way. Retry later.
- `wrangler dev` rewrites the request host to the route's domain, so "is this localhost?" checks on the server never pass.
  Local-only behaviour is gated on the missing `cf-ray` header instead.
- In zsh, `$VAR` is not word-split and unmatched globs abort the command: quote patterns, use arrays, avoid `--include=*.html`.
- `.dev.vars` values are read literally: `KEY='{"json":…}'` with single quotes, no extra escaping.

**Server**
- A later `const x` in the same function hides an earlier helper named `x` for the whole function (temporal dead zone) → 500s.
- D1: max 100 bound parameters; never mix `?` and `?1` in one statement; `CHECK` constraints reject values you forgot to list.
- Check-then-insert rate limits can be bypassed by parallel requests. Fine against people, not against scripts.
- Counters updated with `+1` drift under double taps — recount from the source table.
- "Delivered" means the recipient's app acknowledged the message, not that the server sent it.
- A socket being open does not mean the user saw anything; Web Push is sent only when no socket is open.
- Realtime broadcasts go to everyone in a channel: pass `skipUids` for blocked pairs, and never include private fields.
- Do not expose precise distance: round to coarse steps or a position can be triangulated.
- Validate targets before acting (`unmatch`, `block`, `delete`): the caller can send any id, including a channel name.

**Client**
- `<sc-for>` inside `<table>`/`<select>` is dropped by the HTML parser.
- `location.href = …` after finishing a flow leaves the old screen in history; use `history.back()` or `location.replace()`.
- Pages restored from the back/forward cache replay old banners unless you clear them on `pagehide` (kasion.js does).
- `auth.ready()`, `getIdToken()` and `fetch` can hang: kasion.js adds timeouts so buttons never spin forever. Always reset a
  busy flag in `catch`.
- A default value in `store.get('cart', {a:1})` becomes real data the moment you write it back. Default to empty.
- File pickers: older browsers never fire `cancel`; kasion.js also resolves on window focus.
- iPhone: system notifications and full-screen mode need the app installed to the home screen; icons must be PNG.
- A website cannot hide Safari/Chrome bars; only an installed PWA runs full screen.

**Process**
- Test with two users (two tabs with `?as=alice` / `?as=bob`) — most bugs only show from the other side.
- Review pass before release: run `npm run check`, then read every page for template names missing from `renderVals`,
  client/server field-name mismatches (camelCase vs snake_case) and leftovers from the app it was copied from.
- What cannot be tested locally and must be said plainly: real Google sign-in, real push on phones, camera/mic calls.
