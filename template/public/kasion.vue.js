// kasion.vue.js — write screens with Vue 3 + Vant 4, no build step. This is the recommended way to build new screens.
//
//   <head>
//     <link rel="stylesheet" href="/vendor/vant.css">
//     <script src="/app.config.js"></script><script src="/kasion.js"></script>
//     <script src="/vendor/vue.js"></script><script src="/vendor/vant.js"></script><script src="/kasion.vue.js"></script>
//   </head>
//   <body>
//     <div id="app" class="k-app" v-cloak>
//       <k-page title="โน้ต" tab="home"> … Vue template, Vant components (van-button, van-field, van-cell…) … </k-page>
//     </div>
//     <script>
//     K.page({
//       auth: 'required',                      // 'required' (default) | 'optional' (guests allowed) | 'none'
//       route: { tab: 'all', open: { def: '', push: true } },   // state mirrored in the URL (?tab=mine)
//       setup({ me, route, guest }) {          // normal Vue 3 composition API; return what the template uses
//         const items = Vue.ref([]);
//         K.onLoad(async () => { items.value = (await api('/api/notes')).notes; });
//         return { items };
//       }
//     });
//     </script>
//   </body>
//
// Inside setup and templates you also have: api(), K.toast, K.confirm, K.live, K.pickImage, timeAgo, go, sfx — see docs/vue.md.
(function () {
  const { createApp, ref, reactive, computed, watch, onMounted, onBeforeUnmount, h } = Vue;
  const cfg = window.KASION || {};

  // Vant follows the app's accent colour.
  const css = getComputedStyle(document.documentElement);
  const accent = (cfg.theme && cfg.theme.accent) || css.getPropertyValue('--kd-accent').trim() || '#00A85A';
  const st = document.createElement('style');
  st.textContent = ':root{--van-primary-color:' + accent + ';--van-font-family:"Noto Sans Thai",sans-serif;--van-nav-bar-icon-color:var(--kd-ink);--van-nav-bar-title-font-size:17px;--van-tabbar-item-active-color:' + accent + ';--van-tabbar-item-icon-size:22px}' +
    '.k-app .van-nav-bar{flex-shrink:0}.k-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}' +
    '.k-pad{padding:12px}.k-center{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:48px 24px;color:var(--kd-mute)}' +
    '.k-avatar{border-radius:50%;background:var(--kd-accent-soft) center/cover;color:var(--kd-accent-ink);font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative}' +
    '.k-avatar i{position:absolute;right:0;bottom:0;width:28%;height:28%;min-width:9px;min-height:9px;border-radius:50%;background:#2FB86A;border:2px solid #fff}' +
    '.k-card{background:#fff;border:1px solid var(--kd-line);border-radius:16px}.k-tabbar.van-tabbar{position:relative;flex-shrink:0}' +
    '.k-new{animation:kNew .3s cubic-bezier(.2,.8,.2,1) both}@keyframes kNew{from{opacity:0;translate:0 -8px}to{opacity:1;translate:0 0}}';
  document.head.appendChild(st);

  const loadFns = [];
  const K = window.K = {
    // ---- feedback (Vant) ----
    toast: (msg) => vant.showToast({ message: String(msg), position: 'bottom' }),
    ok: (msg) => vant.showSuccessToast(String(msg)),
    fail: (msg) => vant.showFailToast(String(msg)),
    // Resolves true / false.
    confirm: (message, title) => vant.showConfirmDialog({ title: title || '', message, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก' }).then(() => true, () => false),
    // Run an async action with a loading overlay; shows the error message on failure. Returns the result or null.
    busy: async (fn, label) => {
      const t = vant.showLoadingToast({ message: label || 'กำลังทำงาน…', forbidClick: true, duration: 0 });
      try { const r = await fn(); t.close(); return r; } catch (e) { t.close(); vant.showFailToast(e.message || 'ไม่สำเร็จ'); return null; }
    },
    pickImage: (folder) => window.pickImage(folder || 'uploads'),
    preview: (src) => window.previewImage(src),

    // ---- lifecycle ----
    // Run when the page is ready (after sign-in). Also the place to (re)load data: returns a function you can call again.
    onLoad(fn) { loadFns.push(fn); return fn; },

    // ---- URL-synced state: K.route({ tab: 'all', open: { def: '', push: true } }) → reactive object ----
    route(defs) {
      const spec = {};
      for (const k in defs) spec[k] = defs[k] && typeof defs[k] === 'object' ? defs[k] : { def: defs[k] };
      const read = () => { const q = new URLSearchParams(location.search), o = {}; for (const k in spec) { const d = spec[k].def, raw = q.get(spec[k].name || k); o[k] = raw == null ? d : typeof d === 'number' ? Number(raw) || 0 : typeof d === 'boolean' ? raw === '1' : raw; } return o; };
      const state = reactive(read());
      let applying = false;
      watch(() => ({ ...state }), (now, old) => {
        if (applying) return;
        const q = new URLSearchParams(location.search); let push = false;
        for (const k in spec) {
          const d = spec[k].def, v = now[k], name = spec[k].name || k;
          const enc = v == null || v === '' || v === false || v === d ? null : v === true ? '1' : String(v);
          if (q.get(name) === enc) continue;
          if (enc == null) q.delete(name); else { q.set(name, enc); if (spec[k].push) push = true; }
        }
        const qs = q.toString(), url = location.pathname + (qs ? '?' + qs : '') + location.hash;
        try { if (push) history.pushState({ kd: 1 }, '', url); else history.replaceState(history.state, '', url); } catch (e) {}
      }, { deep: true });
      window.addEventListener('popstate', () => { applying = true; Object.assign(state, read()); Promise.resolve().then(() => { applying = false; }); });
      return state;
    },
    // Close something opened with a pushed route key: Back if we pushed it, else run the fallback.
    back: (fallback) => window.routeBack(fallback),

    // ---- realtime: K.live('feed', { post(ev) {…}, count(n) {…} }, reload) → { connected, count } (refs) ----
    live(channel, handlers, reload) {
      const connected = ref(false), count = ref(0);
      const ch = window.liveChannel(channel, (ev) => {
        if (ev.type === 'count') { count.value = ev.n; connected.value = true; if (handlers && handlers.count) handlers.count(ev.n); return; }
        const fn = handlers && (handlers[ev.type] || handlers.any);
        if (fn) fn(ev);
      }, (again) => { connected.value = true; if (again && reload) reload(); });
      try { onBeforeUnmount(() => ch.close()); } catch (e) {}
      return { connected, count, close: ch.close };
    },
    // Events on the signed-in user's own socket (messages for other screens, alerts): K.mine({ order_ready(ev) {…} })
    mine(handlers) { return window.chatLive.on((ev) => { const fn = handlers[ev.type]; if (fn) return fn(ev); return false; }); },

    // ---- the page ----
    async page(opts = {}) {
      if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
      let me = null, guest = false;
      const mode = opts.auth || 'required';
      if (mode === 'required') { me = await window.requireUser(); if (!me) return; }
      else if (mode === 'optional') { const r = await window.softUser(); if (r.guest) guest = true; else me = r; }
      const app = createApp({
        setup() {
          const route = opts.route ? K.route(opts.route) : reactive({});
          const out = opts.setup ? opts.setup({ me, guest, route, user: me ? me.user : null }) || {} : {};
          onMounted(() => { loadFns.forEach((f) => Promise.resolve().then(f).catch((e) => { console.error(e); vant.showFailToast(e.message || 'โหลดไม่สำเร็จ'); })); });
          return { me, guest, route, user: me ? me.user : null, K, timeAgo: window.timeAgo, go: window.go, appName: cfg.name, ...out };
        },
      });
      app.use(vant);
      app.config.errorHandler = (e) => { console.error(e); };
      app.component('k-page', KPage); app.component('k-tabbar', KTabbar); app.component('k-avatar', KAvatar); app.component('k-empty', KEmpty);
      if (opts.components) for (const n in opts.components) app.component(n, opts.components[n]);
      K.app = app;
      app.mount(opts.el || '#app');
      return app;
    },
  };

  // <k-avatar :src="u.photo" :name="u.name" :size="44" online />
  const KAvatar = {
    props: { src: String, name: String, size: { type: [Number, String], default: 44 }, online: Boolean },
    setup(p) {
      return () => h('span', { class: 'k-avatar', style: { width: p.size + 'px', height: p.size + 'px', fontSize: Math.round(p.size * 0.4) + 'px', backgroundImage: p.src ? 'url("' + p.src + '")' : 'none' }, role: 'img', 'aria-label': p.name || '' },
        [p.src ? null : String(p.name || '?').slice(0, 1).toUpperCase(), p.online ? h('i') : null]);
    },
  };
  // <k-empty title="ยังไม่มีอะไร" text="…"><van-button>…</van-button></k-empty>
  const KEmpty = { props: { title: String, text: String }, setup(p, { slots }) { return () => h('div', { class: 'k-center' }, [p.title ? h('div', { style: 'font-size:17px;font-weight:800;color:var(--kd-ink)' }, p.title) : null, p.text ? h('div', { style: 'font-size:14px;line-height:1.5' }, p.text) : null, slots.default ? slots.default() : null]); } };
  // <k-tabbar active="home" /> — bottom tabs from KASION.tabs, with the unread badge on the chat tab.
  const KTabbar = {
    props: { active: String },
    setup(p) {
      const unread = ref(window.chatLive ? window.chatLive.total : 0);
      const off = window.chatLive ? window.chatLive.on((ev) => { if (ev.type === 'unread') unread.value = window.chatLive.total; return false; }) : null;
      onBeforeUnmount(() => off && off());
      const tabs = cfg.tabs || [];
      return () => h(vant.Tabbar, { class: 'k-tabbar', modelValue: p.active, fixed: false, safeAreaInsetBottom: true, 'onUpdate:modelValue': () => {} },
        () => tabs.map(([id, label, href, icon]) => h(vant.TabbarItem, { name: id, badge: href === '/chat' && unread.value ? (unread.value > 99 ? '99+' : unread.value) : undefined, onClick: () => { if (id !== p.active) location.href = href; } },
          { default: () => label, icon: () => h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: id === p.active ? 'var(--kd-accent-soft)' : 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, [h('path', { d: icon })]) })));
    },
  };
  // <k-page title="…" tab="home" back loading> content </k-page>
  //   title: nav bar title (omit for no bar) · back: show a back arrow (true = history.back, or a URL to fall back to)
  //   tab: show the bottom tab bar with this tab active · loading: show a spinner instead of the content
  //   slots: #right (nav bar actions), #header (fixed area under the bar), #footer (fixed area above the tabs)
  const KPage = {
    props: { title: String, tab: String, back: { type: [Boolean, String], default: false }, loading: Boolean, pad: { type: Boolean, default: false } },
    emits: ['refresh'],
    setup(p, { slots }) {
      const goBack = () => { if (history.length > 1) history.back(); else location.replace(typeof p.back === 'string' ? p.back : '/'); };
      return () => [
        p.title != null ? h(vant.NavBar, { title: p.title, leftArrow: !!p.back, onClickLeft: goBack, safeAreaInsetTop: false }, slots.right ? { right: slots.right } : undefined) : null,
        slots.header ? slots.header() : null,
        h('main', { class: 'k-scroll' + (p.pad ? ' k-pad' : '') }, p.loading ? [h('div', { class: 'k-center' }, [h(vant.Loading, { size: 28 })])] : slots.default ? slots.default() : null),
        slots.footer ? slots.footer() : null,
        p.tab ? h(KTabbar, { active: p.tab }) : null,
      ];
    },
  };
})();
