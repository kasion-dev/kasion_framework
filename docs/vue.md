# Screens with Vue 3 + Vant 4 (recommended)

No build step. Vue and Vant are vendored in `public/vendor/` (versions in `VERSIONS.txt`). Copy `public/blank.html` to start a screen.
`chat.html`, `call.html` and `login.html` still use the older DC runtime (`docs/runtime.md`); leave them as they are.

## Page skeleton

```html
<link rel="stylesheet" href="/vendor/vant.css">
<script src="/app.config.js"></script><script src="/kasion.js"></script>
<script src="/vendor/vue.js"></script><script src="/vendor/vant.js"></script><script src="/kasion.vue.js"></script>
<body>
<div id="app" class="k-app" v-cloak>
  <k-page title="โน้ต" tab="home">
    <van-cell v-for="n in items" :key="n.id" :title="n.text" :label="timeAgo(n.at)"></van-cell>
    <k-empty v-if="!items.length" title="ยังไม่มีโน้ต"></k-empty>
  </k-page>
</div>
<script>
K.page({
  auth: 'required',                       // 'required' (default) | 'optional' (guests allowed, `guest` is true) | 'none'
  route: { tab: 'all', open: { def: '', push: true } },   // state mirrored in the URL; push:true adds a history entry
  setup({ me, user, guest, route }) {
    const items = Vue.ref([]);
    const load = K.onLoad(async () => { items.value = (await api('/api/notes')).notes; });
    K.live('notes', { note(ev) { items.value.unshift(ev.note); } }, load);   // third arg: reload after a reconnect
    return { items };
  },
});
</script>
```

Rules that save time:
- In-DOM templates: always close tags (`<van-cell></van-cell>`, never `<van-cell />`) and use kebab-case props.
- Everything the template uses must be returned from `setup`. Already available: `me, user, guest, route, K, timeAgo, go, appName`.
- `api(path, { method, body })` throws an `Error` with the server's Thai message; wrap user actions in `K.busy(() => api(...))`.

## K helpers

| Call | What it does |
|---|---|
| `K.page(opts)` | signs in, mounts the app on `#app` |
| `K.onLoad(fn)` | run once the page is ready; returns `fn` so you can call it to reload |
| `K.route(defs)` | reactive object synced with the query string (also `opts.route`) |
| `K.back(fallback)` | close something opened with a pushed route key |
| `K.live(channel, handlers, reload)` | shared channel socket → `{ connected, count }` refs; handlers keyed by `ev.type` |
| `K.mine(handlers)` | events on the user's own socket (`c.toUser` on the server) |
| `K.toast / K.ok / K.fail` | Vant toasts |
| `K.confirm(message, title)` | resolves `true` / `false` |
| `K.busy(fn, label)` | loading overlay, shows the error, returns result or `null` |
| `K.pickImage(folder)` | pick + resize + upload → `/api/images/<id>` URL (or `null`) |
| `K.preview(src)` | full-screen image viewer |

## Components

- `<k-page title tab back loading pad>` — shell: nav bar, scroll area, bottom tabs. Slots: `#right`, `#header`, `#footer`.
  `back` = true or a fallback URL. `tab` = id from `KASION.tabs`. Omit `title` for no bar.
- `<k-tabbar active="home">`, `<k-avatar :src :name :size online>`, `<k-empty title text>`.
- All Vant components are registered: https://vant-ui.github.io/vant/#/en-US (v4). Colours follow `KASION.theme.accent`.
- CSS helpers: `.k-card`, `.k-pad`, `.k-center`, `.k-scroll`, `.k-new` (enter animation). Variables: `--kd-accent`, `--kd-ink`, `--kd-mute`, `--kd-line`, `--kd-bg`.
