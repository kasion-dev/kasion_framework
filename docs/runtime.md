# Screen runtime guide (`public/kasion.js`)

A screen is one HTML file in `public/` (served at `/<name>`). No build step. This is the older DC runtime, still used by `chat.html`, `call.html` and `login.html`; write new screens with Vue (`docs/vue.md`). A DC starter is `public/blank_dc.html`.

```html
<script src="/app.config.js"></script><script src="/kasion.js"></script>   <!-- in <head> -->
<x-dc>
  <helmet><style>…page css…</style></helmet>
  <div style="width: 390px; height: 844px; display: flex; flex-direction: column; overflow: hidden; position: relative"> … </div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { loading: true, items: [] }; }
  async componentDidMount() { const me = await requireUser(); if (!me) return; … }
  renderVals() { return { … every value and handler the template reads … }; }
}
</script>
```

The root element is the phone frame: on phones it fills the screen, on desktop it is a centred 390×844 card.
Give the scrolling area `flex: 1; overflow-y: auto`; headers and tab bars stay fixed around it.

## Template syntax

| | |
|---|---|
| `{{name}}`, `{{item.field}}` | value from `renderVals()` (or the loop variable). Works in text and attributes. |
| `<sc-if value="{{flag}}">…</sc-if>` | render when truthy. There is no else: return both `ready` and `notReady`. |
| `<sc-for list="{{items}}" as="it">…</sc-for>` | repeat. Put handlers on each item object: `{ label, pick: () => … }`. |
| `onClick="{{fn}}"`, `onInput`, `onKeydown`, `onPointerdown` … | event handlers; the value must be a function from `renderVals()`. |
| `<img sc-src="{{url}}">` | use `sc-src` for dynamic image URLs — a plain `src="{{url}}"` makes the browser request the literal `{{url}}` (a 404) before the runtime runs. |
| `aria-pressed="{{on}}"`, `disabled="{{busy}}"` | pass strings `'true'`/`'false'` for ARIA; booleans for boolean attributes. |

Rules that bite:
- **Never put `<sc-for>`/`<sc-if>` directly inside `<table>`, `<tbody>`, `<tr>` or `<select>`** — the HTML parser moves or drops
  them. Use `div` grids and button chips instead.
- A button with no handler shows a "demo" toast, so a missing handler is visible.
- Do not `setState` on every keystroke: keep drafts in `this.draft` and read them on submit. The runtime keeps a focused
  input's value across re-renders; `<textarea>` content is only set on first render.
- The DOM is morphed, not rebuilt. Nodes you add yourself survive only if you set `el.__keep = true` (maps, video).
  Inline styles on template elements are reset on each render — put dynamic styles in the template via `{{…}}`.
- Use `translate` / `scale` / `rotate` properties in keyframes, not `transform`, so animations do not fight centred layouts.

## State, URL and navigation

- `this.setState({...})` re-renders; `this.forceUpdate()` re-renders after mutating instance fields.
- **routeKeys** mirror state into the query string so refresh, share and Back restore the view:

```js
this.routeKeys = {
  tab:  { def: 'all' },                                   // ?tab=mine (omitted when it equals def)
  open: { name: 'with', push: true },                     // opening pushes history; close with routeBack(fallback)
  sel:  { name: 'item', push: true, enc: v => v && v.id,  // objects: encode an id…
          resolve: (id, i) => i.state.loading ? null : (i.state.list.find(x => x.id === id) || false) },  // …and resolve once data is loaded
};
onRoute(keys) { if (keys.includes('tab')) this.load(); }   // called on Back/Forward
```
- Close a pushed view with `routeBack(() => this.setState({ open: null }))` so the in-app back button and the browser's agree.
- `go(href, { key: value })` navigates after stashing values in `store` (sessionStorage wrapper: `store.get/set`).

## Helpers (all global)

| | |
|---|---|
| `requireUser()` | signed-in user or redirect to `/login`; resolves the `/api/me` result (`{ user, admin, …onMe }`) |
| `softUser()` | never redirects; `{ guest: true }` when signed out (pages readable before joining) |
| `api(path, { method, body })` | fetch with the ID token; throws `Error` with `.status` and `.data`; 20 s timeout |
| `auth` | `ready()`, `signIn()`, `signOut()`, `token()`, `user` |
| `toast(msg)` | short message |
| `tabBar(activeId)` | tab items from `KASION.tabs` for the shared nav markup |
| `timeAgo(ts)` | "5 นาที", "2 ชม." |
| `pickImage(folder)` | file picker → compressed upload → `{ url }` or `null` |
| `previewImage(src)` / `<img data-preview="1">` | full-screen viewer with zoom |
| `liveChannel(name, onEvent, onOpen)` | shared realtime channel with auto-reconnect; `onOpen(again)` — reload when `again` |
| `chatLive` | the user's own socket: `on(fn)`, `onReconnect(fn)`, `unread`, `total`, `clear(key)`; paints badges on links to `/chat` |
| `pushSetup` | `state()`, `enable()` (call from a tap), `subscribe()` |
| `sfx.play(name)` | `send, receive, notify, order, success, error, tap`; `sfx.set(false)` mutes |
| `shareLink(url, title, text)` | system share sheet or copy |
| `installApp` | shows the "install" hint on phones (automatic) |
| `routeBack(fallback)` | see above |

Local testing: on localhost `?as=alice` signs in as a fake user (needs `TEST_AUTH=1` in `.dev.vars`); `?as=` signs out.

## Styling

CSS variables from `KASION.theme`: `--kd-accent`, `--kd-accent-ink`, `--kd-accent-soft`, `--kd-ink`, `--kd-mute`, `--kd-line`,
`--kd-bg`, `--kd-radius`, `--kd-ease`. Utility classes: `kd-card`, `kd-press` (tap feedback), `kd-pop`, `kd-in`, `kd-sheet`,
`kd-pulse`, `kd-stagger`, `hs` (hide scrollbar). Font: Noto Sans Thai. Touch targets ≥ 40 px; inputs 16 px (no iOS zoom).
Grids that must not overflow: `grid-template-columns: repeat(2, minmax(0, 1fr))`.
