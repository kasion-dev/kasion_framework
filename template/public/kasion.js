// kasion.js — the kasion framework client runtime. Load it in <head> after /app.config.js:
//   <script src="/app.config.js"></script><script src="/kasion.js"></script>
// It gives every page: the screen runtime ({{holes}}, <sc-for>, <sc-if>, on* handlers, class Component extends DCLogic,
// DOM morphing, URL routeKeys), Firebase sign-in + api(), image upload, realtime (chatLive, liveChannel), Web Push,
// sounds, image viewer, PWA install hint, toast and small helpers. Everything is documented in docs/runtime.md.
(function () {
  const K = window.KASION = Object.assign({ name: 'kasion app', theme: {}, tabs: [], chat: true, calls: true }, window.KASION || {});
  const TH = Object.assign({ accent: '#00A85A', accentInk: '#00804A', accentSoft: '#E6F4EC', ink: '#1A1F1C', mute: '#5B6660', line: '#E3E8E5', bg: '#F4F6F5' }, K.theme || {});
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // Zoom locked (owner request): no pinch, no double-tap, no ctrl+wheel / ctrl +/- zoom.
  document.write('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover">' +
    '<style>html,body{touch-action:pan-x pan-y;}button,a,[role=button],input,label{touch-action:manipulation}html,body{-webkit-text-size-adjust:100%;text-size-adjust:100%}input,textarea,select{font-size:16px}</style>' +
    // Installable app: on the home screen it opens full screen (no Safari bottom bar / Chrome address bar).
    '<meta name="theme-color" content="' + TH.accent + '"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg">' +
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">' +
    '<meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="' + String(K.name).replace(/"/g, '') + '">' +
    '<style>x-dc{display:none}@page{size:390px 844px;margin:0}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    // App-shell layout: the page itself never scrolls; each screen root fills the viewport (max 844px on desktop)
    // and only its inner overflow-y:auto areas scroll, so bottom bars/buttons always stay visible.
    'html{background:#E9ECEA;height:100%;overflow:hidden;overscroll-behavior:none}' +
    // Safe area: keep every screen below the status bar / notch (installed app, landscape) on every page.
    'body{margin:0;height:100%;overflow:hidden;overscroll-behavior:none;display:flex;justify-content:center;align-items:center;box-sizing:border-box;padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)}' +
    '@media (max-width:520px){html{background:var(--app-safe,#fff)}}' +
    '.dc-host{box-shadow:0 10px 40px rgba(0,0,0,.12);background:#fff;height:min(844px,calc(100dvh - env(safe-area-inset-top)));max-width:100%;display:flex}' +
    // The screen root scrolls when its content is taller than the viewport (pages designed as one long scroll);
    // screens with their own inner scroll areas never overflow the root, so they behave as before.
    '.dc-host>div{height:100%!important;max-height:100%;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}' +
    // screens designed as a scrolling page (min-height:100vh) scroll inside the shell; their sticky header/footer keep working
    '.dc-host>div[style*="min-height: 100vh"]{overflow-y:auto!important;overscroll-behavior:contain}' +
    '.dc-host [style*="overflow-y: auto"]>*{flex-shrink:0}' +
    // scroll areas must be allowed to shrink inside the fixed-height screen, otherwise they push bottom bars off-screen
    '.dc-host [style*="overflow-y: auto"],.dc-host [style*="overflow-y:auto"],.dc-host [style*="overflow: auto"]{min-height:0}' +
    '.dc-host [style*="overflow-y: auto"]{overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding-bottom:calc(var(--kd-navh,0px) + max(16px,env(safe-area-inset-bottom)));scroll-padding-bottom:24px}' +
    // --kd-navh = height of a fixed bottom tab bar (measured at runtime) so content can scroll clear of it
    '.dc-host>div{padding-bottom:var(--kd-navh,0px)!important;box-sizing:border-box}' +
    '@media (min-width:500px) and (min-height:860px){.dc-host{border-radius:28px;overflow:hidden}}' +
    '@media (max-width:499px){.dc-host{width:100vw;height:100dvh;box-shadow:none}.dc-host>div{width:100%!important}' +
    '.dc-host>div>:last-child:not([style*="overflow-y: auto"]){padding-bottom:env(safe-area-inset-bottom)}}</style>');
  const keepFocusVisible = () => { const el = document.activeElement; if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120); };
  if (window.visualViewport) window.visualViewport.addEventListener('resize', keepFocusVisible);
  document.addEventListener('focusin', keepFocusVisible);
  // ---- Shared UI kit (borders, motion) — use these classes in screens for a consistent look ----
  document.write('<style>' +
    '' + ':root{--kd-accent:' + TH.accent + ';--kd-accent-ink:' + TH.accentInk + ';--kd-accent-soft:' + TH.accentSoft + ';--kd-ink:' + TH.ink + ';--kd-mute:' + TH.mute + ';--kd-line:' + TH.line + ';--kd-bg:' + TH.bg + ';--kd-radius:16px;--kd-ease:cubic-bezier(.2,.8,.2,1)}' +
    '.kd-card{background:#fff;border:1px solid var(--kd-line);border-radius:var(--kd-radius);box-shadow:0 1px 2px rgba(16,24,20,.04)}' +
    '.kd-press{transition:transform .12s var(--kd-ease),box-shadow .2s var(--kd-ease),background-color .2s}.kd-press:active{transform:scale(.97)}' +
    '.kd-lift{transition:transform .2s var(--kd-ease),box-shadow .2s var(--kd-ease)}.kd-lift:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(16,24,20,.08)}' +
    // Keyframes animate the individual translate/scale properties (not transform) so they never override
    // centering transforms like translateX(-50%) on fixed dialogs.
    // Entrance animations run only on the first render (host gets .kd-ready afterwards); re-renders rebuild the DOM and would
    // otherwise restart them on every setState, leaving content faded.
    '@keyframes kdIn{from{opacity:0;translate:0 8px}to{opacity:1;translate:0 0}}.dc-host:not(.kd-ready) .kd-in{animation:kdIn .35s var(--kd-ease) both}' +
    '.dc-host:not(.kd-ready) .kd-stagger>*{animation:kdIn .35s var(--kd-ease) both}.dc-host:not(.kd-ready) .kd-stagger>*:nth-child(2){animation-delay:.04s}.dc-host:not(.kd-ready) .kd-stagger>*:nth-child(3){animation-delay:.08s}.dc-host:not(.kd-ready) .kd-stagger>*:nth-child(4){animation-delay:.12s}.dc-host:not(.kd-ready) .kd-stagger>*:nth-child(5){animation-delay:.16s}.dc-host:not(.kd-ready) .kd-stagger>*:nth-child(n+6){animation-delay:.2s}' +
    '@keyframes kdPop{0%{scale:.8;opacity:0}60%{scale:1.05}100%{scale:1;opacity:1}}.kd-pop{animation:kdPop .35s var(--kd-ease) both}' +
    '@keyframes kdSheet{from{translate:0 100%}to{translate:0 0}}.kd-sheet{animation:kdSheet .3s var(--kd-ease) both}' +
    '@keyframes kdShimmer{to{background-position:-200% 0}}.kd-skel{background:linear-gradient(90deg,#EEF1EF 25%,#F7F9F8 50%,#EEF1EF 75%);background-size:200% 100%;animation:kdShimmer 1.2s linear infinite;border-radius:10px}' +
    '@keyframes kdPulse{0%{box-shadow:0 0 0 0 rgba(0,168,90,.45)}100%{box-shadow:0 0 0 14px rgba(0,168,90,0)}}.kd-pulse{animation:kdPulse 1.6s ease-out infinite}' +
    '.dc-host:not(.kd-ready)>div{animation:kdIn .28s var(--kd-ease) both}' +
    '@media (prefers-reduced-motion:reduce){.kd-in,.kd-stagger>*,.kd-pop,.kd-sheet,.kd-pulse,.dc-host>div{animation:none!important}.kd-press,.kd-lift{transition:none}}' +
    '</style>');
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // Double-tap zoom is already disabled by touch-action + the viewport meta; no touchend guard, so rapid taps (e.g. +/+/+) all register.
  window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '0'].includes(e.key)) e.preventDefault(); });

  // ---- Images: compress in the browser, store through the Worker (/api/images → D1) ----
  // Firebase web config (public identifiers). Override per app with KASION.firebase.
  const FIREBASE = Object.assign({
    apiKey: 'AIzaSyAfcV2cuPS5WXOEkNJX6ycN7STxinCdrH0',
    authDomain: 'kasion-dev.firebaseapp.com', projectId: 'kasion-dev',
    storageBucket: 'kasion-dev.firebasestorage.app', appId: '1:265232097586:web:263e94e62908675583f72b'
  }, K.firebase || {});
  // Resize to fit maxDim and re-encode (WebP when supported, else JPEG). Returns { blob, dataUrl, width, height, before, after }.
  window.compressImage = async function (file, maxDim = 1280, quality = 0.78) {
    const bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('เปิดรูปไม่ได้')); img.src = URL.createObjectURL(file); });
    const s = Math.min(1, maxDim / Math.max(bmp.naturalWidth, bmp.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.naturalWidth * s); c.height = Math.round(bmp.naturalHeight * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    URL.revokeObjectURL(bmp.src);
    let type = 'image/webp';
    let blob = await new Promise(r => c.toBlob(r, type, quality));
    if (!blob || blob.type !== 'image/webp') { type = 'image/jpeg'; blob = await new Promise(r => c.toBlob(r, type, quality)); }
    const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    return { blob, dataUrl, type, width: c.width, height: c.height, before: file.size, after: blob.size };
  };
  // Compress then upload. Resolves { url: '/api/images/<id>', width, height, before, after }. Throws when the upload fails.
  window.uploadImage = async function (file, folder = 'uploads') {
    const small = /^chat/.test(folder || '');
    let c = await window.compressImage(file, small ? 960 : 1280, small ? 0.7 : 0.78);
    if (c.after > 700 * 1024) c = await window.compressImage(file, 960, 0.6);
    const d = await window.api('/api/images', { method: 'POST', body: { dataUrl: c.dataUrl, folder: folder || 'uploads' } });
    return Object.assign({ url: d.url, uploaded: true }, c);
  };
  // Opens the file picker (or camera on phones) and resolves with uploadImage()'s result, or null if cancelled.
  window.pickImage = function (folder, capture) {
    return new Promise(res => {
      // The input must be in the DOM: iOS Safari does not fire `change` for a detached file input.
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; if (capture) i.capture = 'environment';
      i.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(i);
      const done = v => { i.remove(); res(v); };
      i.onchange = () => i.files && i.files[0] ? window.uploadImage(i.files[0], folder).then(done, e => { window.toast('อัปโหลดไม่สำเร็จ: ' + e.message); done(null); }) : done(null);
      i.addEventListener('cancel', () => done(null));
      // Older Safari / Chrome never fire `cancel`: when the page gets focus back with no file chosen, treat it as cancelled.
      window.addEventListener('focus', () => setTimeout(() => { if (i.isConnected && !(i.files && i.files.length)) done(null); }, 800), { once: true });
      i.click();
    });
  };

  // ---- Auth (Firebase Google sign-in) + API client for the Worker backend (/api/*) ----
  let fbAuth = null;
  async function authMod() {
    if (fbAuth) return fbAuth;
    const cfg = FIREBASE;
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const m = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(cfg);
    const a = m.getAuth(app);
    await m.setPersistence(a, m.browserLocalPersistence);
    fbAuth = { a, m };
    return fbAuth;
  }
  // ?ref=CODE on any page is remembered and sent with the first sign-in (who invited this member).
  try { const rf = new URLSearchParams(location.search).get('ref'); if (rf && /^[a-z0-9]{4,16}$/i.test(rf)) localStorage.setItem('kd_ref', rf.toLowerCase()); } catch (e) {}
  window.meCall = function () { let ref = ''; try { ref = localStorage.getItem('kd_ref') || ''; } catch (e) {} return window.api('/api/me', { method: 'POST', body: ref ? { ref } : {} }); };
  // Local testing: on localhost, ?as=<uid> signs in as a fake user (the Worker must run with TEST_AUTH=1 in .dev.vars).
  // ?as= (empty) signs out. Never active on a real domain.
  let TEST_USER = '';
  if (LOCAL) { try { const q = new URLSearchParams(location.search); if (q.has('as')) sessionStorage.setItem('kd_test_user', q.get('as') || ''); TEST_USER = sessionStorage.getItem('kd_test_user') || ''; } catch (e) {} }
  window.auth = TEST_USER ? {
    user: { uid: TEST_USER, email: TEST_USER + '@test.local', displayName: TEST_USER, photoURL: '' }, test: true,
    ready() { if (!this._me) this._me = window.meCall().catch(() => {}); return this._me.then(() => this.user); },
    async signIn() { await window.meCall(); return this.user; },
    async signOut() { try { sessionStorage.removeItem('kd_test_user'); } catch (e) {} this.user = null; },
    async token() { return this.user ? 'test:' + TEST_USER + ':' + TEST_USER : null; }
  } : {
    user: null,
    // Resolves with the signed-in user (or null) once Firebase has restored the session.
    ready() {
      if (this._ready) return this._ready;
      this._ready = authMod().then(({ a, m }) => new Promise(res => {
        const off = m.onAuthStateChanged(a, u => { off(); window.auth.user = u; res(u); if (u) window.meCall().catch(() => {}); });
      }));
      // Never hang callers forever if Firebase can't restore the session (blocked storage, flaky network).
      const r = this._ready;
      return Promise.race([r, new Promise(res => setTimeout(() => res(window.auth.user || null), 8000))]);
    },
    async signIn() {
      const { a, m } = await authMod();
      const p = new m.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      const r = await m.signInWithPopup(a, p);
      this.user = r.user;
      await window.meCall();
      return r.user;
    },
    async signOut() { const { a, m } = await authMod(); await m.signOut(a); this.user = null; },
    async token() { await this.ready(); if (!this.user) return null; return Promise.race([this.user.getIdToken(), new Promise((_, rej) => setTimeout(() => rej(new Error('หมดเวลายืนยันตัวตน ลองใหม่')), 10000))]); }
  };
  // fetch wrapper: adds the Firebase ID token, parses JSON, throws Error(message) on non-2xx.
  window.api = async function (path, opts = {}) {
    const t = await window.auth.token();
    const headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});
    if (t) headers.authorization = 'Bearer ' + t;
    // 20s timeout so a stalled request surfaces an error instead of an endless spinner.
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 20000);
    let r;
    try { r = await fetch(path, Object.assign({ signal: ac.signal }, opts, { headers, body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body })); }
    catch (err) { const e = new Error(err.name === 'AbortError' ? 'หมดเวลาเชื่อมต่อ ลองใหม่' : 'เชื่อมต่อไม่ได้'); e.status = 0; throw e; }
    finally { clearTimeout(to); }
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && /api\/me first/.test(data.error || '') && !opts._retried) { await window.meCall(); return window.api(path, Object.assign({}, opts, { _retried: true })); }
    if (!r.ok) { const e = new Error(data.error || ('HTTP ' + r.status)); e.status = r.status; e.data = data; throw e; }
    return data;
  };
  // Incoming-call watcher: while signed in, polls /api/calls/incoming every 3s on every screen except /call
  // and shows a ringing overlay with accept / decline.
  async function watchCalls() {
    if (location.pathname.startsWith('/call') || location.pathname.startsWith('/login') || window.self !== window.top) return;
    const u = await window.auth.ready().catch(() => null);
    if (!u) return;
    let shown = null;
    const poll = async () => {
      try {
        const r = await window.api('/api/calls/incoming');
        const c = r.call;
        if (c && (!shown || shown.id !== c.id || !document.getElementById('kd-ring'))) { shown = c; showRing(c); }
        if (!c && shown) { hideRing(); shown = null; }
      } catch (e) {}
      setTimeout(poll, 3000);
    };
    poll();
  }
  // ---- Tones (WebAudio, no files): incoming ringtone + outgoing ringback. Unlocked on the first user gesture. ----
  let actx = null;
  const unlockAudio = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} };
  ['pointerdown', 'keydown', 'touchstart'].forEach(t => document.addEventListener(t, unlockAudio, { capture: true, passive: true }));
  window.tone = {
    _t: null,
    _beep(freqs, ms, vol) {
      if (!actx) unlockAudio();
      if (!actx || actx.state !== 'running') return;
      const now = actx.currentTime, g = actx.createGain();
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + 0.02); g.gain.setValueAtTime(vol, now + ms / 1000 - 0.05); g.gain.linearRampToValueAtTime(0, now + ms / 1000);
      g.connect(actx.destination);
      freqs.forEach(f => { const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(now); o.stop(now + ms / 1000); });
    },
    // Incoming: two quick rings every 2s (with vibration on phones).
    ring() { this.stop(); const play = () => { this._beep([880, 1320], 350, 0.18); setTimeout(() => this._beep([880, 1320], 350, 0.18), 450); if (navigator.vibrate) navigator.vibrate([350, 100, 350]); }; play(); this._t = setInterval(play, 2000); },
    // Outgoing: classic ringback 1s on / 2s off.
    ringback() { this.stop(); const play = () => this._beep([440, 480], 1000, 0.08); play(); this._t = setInterval(play, 3000); },
    stop() { clearInterval(this._t); this._t = null; if (navigator.vibrate) navigator.vibrate(0); }
  };
  function hideRing() { window.tone.stop(); const o = document.getElementById('kd-ring'); if (o) o.remove(); }
  function showRing(c) {
    hideRing();
    const o = document.createElement('div'); o.id = 'kd-ring'; o.setAttribute('role', 'alertdialog'); o.setAttribute('aria-label', 'สายเรียกเข้า');
    o.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);width:min(358px,calc(100vw - 32px));background:#0A1F16;color:#fff;border-radius:20px;padding:14px;display:flex;align-items:center;gap:12px;z-index:100;box-shadow:0 12px 40px rgba(0,0,0,.35);font-family:"Noto Sans Thai",sans-serif';
    const name = (c.from && c.from.name) || 'ผู้ใช้';
    o.innerHTML = '<div style="width:48px;height:48px;border-radius:24px;background:#CDE8D6;color:#00804A;font-weight:800;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto"></div>' +
      '<div style="flex:1;min-width:0"><div style="font-size:12px;color:#9FE0BD">' + (c.video ? 'วิดีโอคอลเข้า' : 'สายเรียกเข้า') + ' · ' + String(K.name).replace(/[<&]/g, '') + '</div><div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div></div>' +
      '<button aria-label="ปฏิเสธ" style="width:48px;height:48px;border-radius:24px;border:0;background:#E5484D;color:#fff;font-weight:800">✕</button>' +
      '<button aria-label="รับสาย" style="width:48px;height:48px;border-radius:24px;border:0;background:#00A85A;color:#fff;font-weight:800">✓</button>';
    const av = o.children[0];
    if (c.from && c.from.photo) { const im = document.createElement('img'); im.src = c.from.photo; im.alt = ''; im.style.cssText = 'width:100%;height:100%;object-fit:cover'; av.appendChild(im); } else av.textContent = name.slice(0, 2);
    o.children[1].children[1].textContent = name;
    o.children[2].onclick = async () => { hideRing(); try { await window.api('/api/calls/' + c.id + '/decline', { method: 'POST' }); } catch (e) {} };
    o.children[3].onclick = async () => {
      try { await window.api('/api/calls/' + c.id + '/answer', { method: 'POST' }); } catch (e) {}
      window.store.set('call', { id: c.id, channel: c.channel, name, photo: c.from && c.from.photo, back: location.pathname + location.search, video: !!c.video });
      location.href = '/call?id=' + encodeURIComponent(c.id);
    };
    document.body.appendChild(o);
    window.tone.ring();
  }
  // ---- Sound effects (public/sounds/*.wav, generated by scripts/gen_sfx.py). Mute with localStorage kd_sfx = "0". ----
  window.sfx = {
    _buf: {},
    on() { try { return localStorage.getItem('kd_sfx') !== '0'; } catch (e) { return true; } },
    set(on) { try { localStorage.setItem('kd_sfx', on ? '1' : '0'); } catch (e) {} },
    async play(name, vol = 1) {
      if (!this.on()) return;
      try {
        unlockAudio();
        if (!actx) { const a = new Audio('/sounds/' + name + '.wav'); a.volume = vol; await a.play(); return; }
        if (!this._buf[name]) this._buf[name] = fetch('/sounds/' + name + '.wav').then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b));
        const buf = await this._buf[name];
        const src = actx.createBufferSource(), g = actx.createGain();
        g.gain.value = vol; src.buffer = buf; src.connect(g).connect(actx.destination); src.start();
      } catch (e) {}
    }
  };
  // ---- Push notifications (app closed): service worker + Web Push subscription stored on the server. ----
  window.pushSetup = {
    supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; },
    state() { return !this.supported() ? 'unsupported' : Notification.permission; },
    async reg() { if (!this._reg) this._reg = navigator.serviceWorker.register('/sw.js'); return this._reg; },
    // Subscribe this device (needs permission already granted). Safe to call repeatedly.
    async subscribe() {
      if (!this.supported() || Notification.permission !== 'granted') return false;
      try {
        const reg = await this.reg(); await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const r = await fetch('/api/public/push-key').then(x => x.json());
          if (!r.key) return false;
          const raw = atob(r.key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - r.key.length % 4) % 4));
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
        }
        const j = sub.toJSON();
        await window.api('/api/push/subscribe', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys } });
        return true;
      } catch (e) { console.warn('push subscribe', e); return false; }
    },
    // Ask for permission (must run inside a tap) and subscribe.
    async enable() {
      if (!this.supported()) return 'unsupported';
      let p = Notification.permission;
      if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) {} }
      if (p === 'granted') return (await this.subscribe()) ? 'granted' : 'error';
      return p;
    }
  };
  // ---- Install hint: browsers only hide their own bars for an installed (home-screen) app, so offer that once. ----
  window.installApp = {
    standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || (window.matchMedia && matchMedia('(display-mode: fullscreen)').matches) || navigator.standalone === true; },
    ios() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
    snoozed() { try { return Date.now() < Number(localStorage.getItem('kd_install_snooze') || 0); } catch (e) { return false; } },
    snooze(days) { try { localStorage.setItem('kd_install_snooze', String(Date.now() + days * 86400000)); } catch (e) {} },
    show(html, onYes) {
      if (document.getElementById('kd-install') || window.self !== window.top) return;
      const el = document.createElement('div'); el.id = 'kd-install'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'ติดตั้งแอป');
      el.style.cssText = 'position:fixed;left:50%;bottom:calc(12px + env(safe-area-inset-bottom));translate:-50% 0;width:min(370px,calc(100vw - 20px));background:#0A1F16;color:#fff;border-radius:18px;padding:14px;z-index:110;box-shadow:0 12px 32px rgba(0,0,0,.3);font-family:"Noto Sans Thai",sans-serif;display:flex;gap:12px;align-items:center';
      el.innerHTML = '<img src="' + (document.querySelector('link[rel=apple-touch-icon]') || {}).href + '" alt="" width="44" height="44" style="border-radius:11px;flex-shrink:0">' +
        '<div style="flex:1;min-width:0;font-size:13px;line-height:1.45">' + html + '</div>' +
        (onYes ? '<button data-yes style="height:38px;padding:0 14px;border-radius:19px;border:0;background:#00A85A;color:#fff;font:inherit;font-weight:800;flex-shrink:0">ติดตั้ง</button>' : '') +
        '<button data-no aria-label="ปิด" style="width:32px;height:32px;border-radius:16px;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:16px;flex-shrink:0">✕</button>';
      el.querySelector('[data-no]').onclick = () => { this.snooze(7); el.remove(); };
      if (onYes) el.querySelector('[data-yes]').onclick = () => { el.remove(); onYes(); };
      document.body.appendChild(el);
    },
    init() {
      if (this.standalone() || this.snoozed() || /^\/(call|login)/.test(location.pathname)) return;
      const mobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
      if (!mobile) return;
      // Android / Chrome: the browser offers a real install prompt.
      window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        setTimeout(() => this.show('<b style="font-size:14px">ติดตั้ง ' + String(K.name).replace(/[<&]/g, '') + '</b><br>เปิดเต็มจอ ไม่มีแถบที่อยู่ด้านบน', async () => { e.prompt(); try { const r = await e.userChoice; if (r.outcome !== 'accepted') this.snooze(7); } catch (x) {} }), 2500);
      });
      // iPhone Safari has no prompt: explain Share → Add to Home Screen.
      if (this.ios()) setTimeout(() => this.show('<b style="font-size:14px">เปิดแบบเต็มจอ</b><br>แตะ <svg width="14" height="16" viewBox="0 0 14 18" fill="none" stroke="#9FE0BD" stroke-width="1.8" style="vertical-align:-2px"><path d="M7 1v11M3 5l4-4 4 4M1 9v8h12V9"/></svg> แชร์ แล้วเลือก <b>"เพิ่มไปยังหน้าจอโฮม"</b>'), 2500);
    }
  };
  document.addEventListener('DOMContentLoaded', () => window.installApp.init());
  // Back/forward cache: a page restored from history must not replay old banners, rings or toasts.
  const clearTransient = () => ['kd-msgbanner', 'kd-ring', 'kd-toast', 'kd-topup', 'kd-install', 'kd-lightbox'].forEach(id => { const n = document.getElementById(id); if (n) n.remove(); });
  window.addEventListener('pagehide', () => { clearTransient(); try { window.tone && window.tone.stop(); } catch (e) {} });
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    clearTransient();
    document.body.style.overflow = '';
    // The socket was closed while the page sat in the cache: reconnect and re-read unread counts.
    try { const c = window.chatLive; if (c && c._started) { c._ws = null; c.connected = false; c.connect(); c.refresh(); } } catch (x) {}
  });
  // ---- Image preview: tap any <img data-preview> → full-screen viewer (tap/double-tap zoom, pinch, drag, swipe down or Esc to close). ----
  window.previewImage = function (src, alt) {
    if (!src) return;
    let ov = document.getElementById('kd-lightbox');
    if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'kd-lightbox';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', alt || 'ดูรูปภาพ');
    ov.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(10,12,11,.94);display:flex;align-items:center;justify-content:center;touch-action:none;opacity:0;transition:opacity .2s';
    const img = document.createElement('img');
    img.src = src; img.alt = alt || ''; img.draggable = false;
    img.style.cssText = 'max-width:100vw;max-height:100vh;object-fit:contain;user-select:none;-webkit-user-select:none;transition:transform .2s;transform-origin:center;will-change:transform';
    const btn = (label, svg, css) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label); b.innerHTML = svg; b.style.cssText = 'position:absolute;top:calc(12px + env(safe-area-inset-top));width:44px;height:44px;border-radius:22px;border:0;background:rgba(255,255,255,.16);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;' + css; b.dataset.bound = '1'; return b; };
    const close = btn('ปิด', '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>', 'right:12px');
    const save = btn('เปิดรูปขนาดเต็ม', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>', 'right:64px');
    ov.append(img, close, save);
    document.body.appendChild(ov);
    const prevFocus = document.activeElement, prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => { ov.style.opacity = '1'; close.focus({ preventScroll: true }); });
    let s = 1, x = 0, y = 0;
    const apply = (anim) => { img.style.transition = anim ? 'transform .2s' : 'none'; img.style.transform = `translate(${x}px,${y}px) scale(${s})`; };
    const done = () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = prevOverflow; ov.style.opacity = '0'; setTimeout(() => ov.remove(), 200); try { prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); } catch (e) {} };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); done(); } };
    document.addEventListener('keydown', onKey, true);
    close.onclick = e => { e.stopPropagation(); done(); };
    save.onclick = e => { e.stopPropagation(); window.open(src, '_blank', 'noopener'); };
    // Pointer gestures: one finger pans (or swipes down to close at 1x), two fingers pinch.
    const pts = new Map(); let start = null, moved = false, lastTap = 0;
    ov.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; ov.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
      const p = [...pts.values()];
      start = p.length === 2 ? { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), s } : { x: e.clientX - x, y: e.clientY - y, y0: e.clientY }; });
    ov.addEventListener('pointermove', e => { if (!pts.has(e.pointerId) || !start) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); const p = [...pts.values()];
      if (p.length === 2 && start.d) { s = Math.min(5, Math.max(1, start.s * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / start.d)); moved = true; apply(false); return; }
      if (p.length === 1 && start.x != null) { const nx = e.clientX - start.x, ny = e.clientY - start.y; if (Math.abs(nx - x) + Math.abs(ny - y) > 3) moved = true;
        if (s > 1) { x = nx; y = ny; } else { x = 0; y = Math.max(0, e.clientY - start.y0); ov.style.background = 'rgba(10,12,11,' + Math.max(.3, .94 - y / 500) + ')'; } apply(false); } });
    const end = e => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (pts.size) { const q = [...pts.values()][0]; start = { x: q.x - x, y: q.y - y, y0: q.y }; return; }
      start = null;
      if (s <= 1 && y > 110) { done(); return; }
      if (s <= 1) { s = 1; x = 0; y = 0; ov.style.background = 'rgba(10,12,11,.94)'; apply(true); }
      if (!moved && e.type === 'pointerup') {
        const now = Date.now();
        if (now - lastTap < 300 || e.pointerType === 'mouse') { if (s > 1) { s = 1; x = 0; y = 0; } else { s = 2.5; const r = img.getBoundingClientRect(); x = (r.left + r.width / 2 - e.clientX) * 1.5; y = (r.top + r.height / 2 - e.clientY) * 1.5; } apply(true); lastTap = 0; }
        else { lastTap = now; if (e.target === ov) setTimeout(() => { if (lastTap === now && s === 1) done(); }, 300); }
      } };
    ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
    ov.addEventListener('wheel', e => { e.preventDefault(); s = Math.min(5, Math.max(1, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); if (s === 1) { x = 0; y = 0; } apply(true); }, { passive: false });
  };
  document.addEventListener('click', e => {
    const im = e.target && e.target.closest && e.target.closest('img[data-preview]');
    if (!im || !im.src) return;
    e.preventDefault(); e.stopPropagation();
    window.previewImage(im.currentSrc || im.src, im.alt);
  }, true);
  // ---- Realtime chat: one WebSocket per tab to the user's ChatHub, unread badge on /chat links, notifications. ----
  window.chatLive = {
    connected: false, unread: {}, total: 0, _subs: [], _re: [], _ws: null, _try: 0,
    // Page handler: fn(ev) returns true when the page showed the message itself (thread open) → no badge / notification.
    on(fn) { this._subs.push(fn); return () => { this._subs = this._subs.filter(f => f !== fn); }; },
    onReconnect(fn) { this._re.push(fn); },
    async start() {
      if (this._started || window.self !== window.top || /^\/(login|call)/.test(location.pathname)) return;
      const u = await window.auth.ready().catch(() => null);
      if (!u) return;
      this._started = true;
      if (window.pushSetup.supported()) { window.pushSetup.reg().catch(() => {}); if (Notification.permission === 'granted') window.pushSetup.subscribe(); }
      this.refresh();
      this.connect();
      document.addEventListener('visibilitychange', () => { if (!document.hidden && !this.connected) this.connect(); });
    },
    async connect() {
      if (this._ws && this._ws.readyState <= 1) return;
      let tok = null; try { tok = await window.auth.token(); } catch (e) {}
      if (!tok) return;
      const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/ws?token=' + encodeURIComponent(tok));
      this._ws = ws;
      ws.onopen = () => {
        const again = this._try > 0 || this._was;
        this.connected = true; this._try = 0; this._was = true;
        clearInterval(this._ping); this._ping = setInterval(() => { try { ws.send('ping'); } catch (e) {} }, 25000);
        if (again) { this.refresh(); this._re.forEach(f => { try { f(); } catch (e) {} }); }
      };
      ws.onmessage = e => { if (e.data === 'pong') return; let ev; try { ev = JSON.parse(e.data); } catch (x) { return; } if (!ev) return; if (ev.type === 'msg') this._got(ev); else this._subs.forEach(f => { try { f(ev); } catch (x) {} }); }; // other event types go straight to page handlers (chatLive.on)
      ws.onclose = () => {
        this.connected = false; clearInterval(this._ping);
        if (this._ws !== ws) return;
        // Back off 1s → 30s; the Firebase token is re-read each time (it expires hourly).
        const d = Math.min(30000, 1000 * Math.pow(2, this._try++));
        clearTimeout(this._rt); this._rt = setTimeout(() => this.connect(), d);
      };
    },
    _got(ev) {
      // Tell the sender this device has the message (→ ✓✓). Skipped for my own messages.
      if (ev.message && !ev.message.mine && ev.message.id) window.api('/api/chat/' + encodeURIComponent(ev.thread) + '/ack', { method: 'POST', body: { id: ev.message.id } }).catch(() => {});
      let shown = false;
      this._subs.forEach(f => { try { if (f(ev)) shown = true; } catch (e) {} });
      if (ev.message && ev.message.mine) return;
      if (shown && !document.hidden) return;
      this.unread[ev.thread] = (this.unread[ev.thread] || 0) + 1;
      this._sum();
      this.notify(ev);
    },
    // Catch up on messages that arrived while this device was offline (marks them delivered on the server).
    async pending() {
      try {
        const r = await window.api('/api/chat/pending');
        const list = r.messages || [];
        list.forEach(m => this._subs.forEach(f => { try { f({ type: 'msg', thread: m.thread, message: m, catchup: true }); } catch (e) {} }));
        return list.length;
      } catch (e) { return 0; }
    },
    async refresh() {
      await this.pending();
      try { const r = await window.api('/api/chat/unread'); this.unread = r.threads || {}; this._sum(); } catch (e) {}
    },
    clear(key) { if (this.unread[key]) { delete this.unread[key]; this._sum(); } },
    _sum() {
      this.total = Object.values(this.unread).reduce((a, b) => a + (Number(b) || 0), 0);
      this.paint();
      try { if (navigator.setAppBadge) this.total ? navigator.setAppBadge(this.total) : navigator.clearAppBadge(); } catch (e) {}
      this._subs.forEach(f => { try { f({ type: 'unread' }); } catch (e) {} });
    },
    // Red count on every link to /chat (customer tab bar); re-applied after each page render.
    paint() {
      document.querySelectorAll('a[href="/chat"], [data-chat-badge]').forEach(a => {
        let b = a.querySelector(':scope > .kd-chat-badge');
        if (!this.total) { if (b) b.remove(); return; }
        if (!b) {
          b = document.createElement('span'); b.className = 'kd-chat-badge'; b.setAttribute('aria-hidden', 'true');
          b.style.cssText = 'position:absolute;top:2px;left:calc(50% + 6px);min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:#E5484D;color:#fff;font:800 11px/18px "Noto Sans Thai",sans-serif;text-align:center;border:2px solid #fff;pointer-events:none';
          if (getComputedStyle(a).position === 'static') a.style.position = 'relative';
          a.appendChild(b);
        }
        b.textContent = this.total > 99 ? '99+' : String(this.total);
        a.setAttribute('aria-label', 'ข้อความ · ยังไม่อ่าน ' + this.total);
      });
    },
    open(ev) { location.href = '/chat?with=' + encodeURIComponent('m_' + ev.thread.slice(2)); },
    notify(ev) {
      const m = ev.message || {}, body = m.img && !m.text ? 'ส่งรูปภาพ' : (m.text || '');
      const title = ev.fromName || 'ข้อความใหม่';
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try { const n = new Notification(title, { body, tag: ev.thread, icon: ev.fromPhoto || '/icon.svg', renotify: true }); n.onclick = () => { window.focus(); n.close(); this.open(ev); }; return; } catch (e) {}
      }
      this.banner(title, body, ev);
      window.sfx.play('notify');
      if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {}
    },
    banner(title, body, ev) {
      let el = document.getElementById('kd-msgbanner');
      if (!el) {
        el = document.createElement('button'); el.id = 'kd-msgbanner'; el.type = 'button';
        el.style.cssText = 'position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top));translate:-50% -140%;width:min(370px,calc(100vw - 20px));display:flex;gap:10px;align-items:center;text-align:left;background:#fff;border:1px solid #E3E8E5;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:10px 12px;z-index:120;font-family:"Noto Sans Thai",sans-serif;color:#1A1F1C;cursor:pointer;transition:translate .3s cubic-bezier(.2,.8,.2,1)';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
      }
      const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      el.innerHTML = '<span style="width:36px;height:36px;border-radius:18px;background:#E6F4EC;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00804A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg></span>' +
        '<span style="flex:1;min-width:0"><span style="display:block;font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(title) + '</span><span style="display:block;font-size:13px;color:#5B6660;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(body) + '</span></span>';
      el.onclick = () => this.open(ev);
      requestAnimationFrame(() => { el.style.translate = '-50% 0'; });
      clearTimeout(el._h); el._h = setTimeout(() => { el.style.translate = '-50% -140%'; }, 4000);
    },
    // Ask for system notifications once, from a real tap (browsers require a user gesture).
    askOnTap() {
      if (!('Notification' in window) || Notification.permission !== 'default') return;
      const ask = () => { document.removeEventListener('pointerup', ask, true); window.pushSetup.enable(); };
      document.addEventListener('pointerup', ask, true);
    }
  };
  document.addEventListener('DOMContentLoaded', () => { if (K.calls !== false) watchCalls(); if (K.chat !== false) window.chatLive.start(); });

  // Shared state across screens (cart, chosen ride, payment method) — kept for this tab only.
  // Catalog requests carry the map test region (Bangkok / CDMX) so demo shops appear near the tester.
  const _fetch = window.fetch.bind(window);
  window.store = {
    get(k, d) { try { const v = sessionStorage.getItem('kd_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { sessionStorage.setItem('kd_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  // Wallet + activity history (demo data, this tab only).
  // Credit wallet (server-side, /api/wallet + /api/orders). Every service is paid with credit; credit is topped up
  // by PromptPay slip on /topup (pay.kasion.dev). All methods are async; screens should `await` them.
  window.toast = function (msg) {
    let t = document.getElementById('kd-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'kd-toast'; t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);max-width:340px;background:#1A1F1C;color:#fff;padding:10px 16px;border-radius:12px;font:600 14px "Noto Sans Thai",sans-serif;z-index:99;opacity:0;transition:opacity .2s;pointer-events:none;text-align:center';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, 1800);
  };
  window.go = (href, set) => { if (set) Object.keys(set).forEach(k => window.store.set(k, set[k])); location.href = href; };
  window.money = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Bottom tab bar from KASION.tabs = [[id, label, href, svgPathData], …]. Use in renderVals: tabs: tabBar('home')
  window.tabBar = function (active) {
    return (K.tabs || []).map(([id, label, href, icon]) => ({ id, label, href, icon, on: id === active, color: id === active ? 'var(--kd-accent)' : '#7A857F', fill: id === active ? 'var(--kd-accent-soft)' : 'none', current: id === active ? 'page' : 'false' }));
  };
  // "5 นาที", "2 ชม." … for feeds and chat lists.
  window.timeAgo = function (ts) {
    const d = Math.max(0, Date.now() - Number(ts || 0)) / 1000;
    if (d < 45) return 'เมื่อกี้';
    if (d < 3600) return Math.round(d / 60) + ' นาที';
    if (d < 86400) return Math.round(d / 3600) + ' ชม.';
    if (d < 7 * 86400) return Math.round(d / 86400) + ' วัน';
    return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };
  // Shared realtime channel ('board' or 'room:<id>'): one WebSocket with auto-reconnect. Returns { close() }.
  window.liveChannel = function (chan, onEvent, onOpen) {
    let ws = null, closed = false, tries = 0, ping = null, rt = null, was = false;
    const connect = async () => {
      if (closed) return;
      let tok = null; try { tok = await window.auth.token(); } catch (e) {}
      if (!tok) { rt = setTimeout(connect, 3000); return; }
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/live/' + encodeURIComponent(chan) + '/ws?token=' + encodeURIComponent(tok));
      ws.onopen = () => { tries = 0; clearInterval(ping); ping = setInterval(() => { try { ws.send('ping'); } catch (e) {} }, 25000); if (onOpen) { try { onOpen(was); } catch (e) {} } was = true; };
      ws.onmessage = e => { if (e.data === 'pong') return; let ev; try { ev = JSON.parse(e.data); } catch (x) { return; } try { onEvent(ev); } catch (x) { console.error(x); } };
      ws.onclose = () => { clearInterval(ping); if (closed) return; rt = setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, tries++))); };
    };
    connect();
    const stop = () => { closed = true; clearTimeout(rt); clearInterval(ping); try { ws && ws.close(); } catch (e) {} };
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', e => { if (e.persisted && closed) { closed = false; connect(); } });
    return { close: stop };
  };
  // Signed-in user or redirect to /login. Resolves the POST /api/me result ({ user, admin, …onMe fields }) or null.
  // KASION.setup = { needed: me => boolean, url: '/profile?setup=1' } sends unfinished accounts to an onboarding page.
  window.requireUser = async function () {
    const u = await window.auth.ready().catch(() => null);
    if (!u) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search)); return null; }
    let r; try { r = await window.meCall(); } catch (e) { window.toast('เชื่อมต่อไม่สำเร็จ: ' + e.message); return null; }
    const st = K.setup;
    if (st && st.needed && st.needed(r) && location.pathname !== st.url.split('?')[0]) { location.replace(st.url); return null; }
    window.me = r;
    return r;
  };
  // Never redirects: { guest: true } when signed out, otherwise the /api/me result. For pages readable before joining.
  window.softUser = async function () {
    const u = await window.auth.ready().catch(() => null);
    if (!u) return { guest: true };
    try { const r = await window.meCall(); window.me = r; return r; } catch (e) { return { guest: true }; }
  };
  // Share a link with the system sheet, or copy it.
  window.shareLink = async function (url, title, text) {
    try { if (navigator.share) { await navigator.share({ url, title, text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); window.toast('คัดลอกลิงก์แล้ว'); } catch (e) { window.toast(url); }
  };
  // Demo shops + menus shared by Main / Food / Shop / Checkout / FoodTrack.
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(s) { this.state = Object.assign({}, this.state, typeof s === 'function' ? s(this.state) : s); this.__render(); }
    forceUpdate() { this.__render(); }
  }
  window.DCLogic = DCLogic;
  // ---- URL routes: a page lists state keys in this.routeKeys = { key: { def, push, name, enc, dec, resolve } } and they
  // live in the query string, so refresh / share / Back restore the same view (open chat, filter, tab, sheet…).
  //   def      default value (omitted from the URL; also gives the type: number / boolean / string)
  //   push     true → a change adds a history entry (Back closes it); otherwise the URL is replaced
  //   enc/dec  custom encode/decode for non-primitive values
  //   resolve  (raw, inst) → value|null for values that need loaded data (e.g. an item id → item); retried each render
  const ROUTE = {
    read(inst, initial) {
      const q = new URLSearchParams(location.search), out = {};
      inst.__routePending = {};
      for (const k in inst.routeKeys) {
        const o = inst.routeKeys[k] || {}, name = o.name || k, raw = q.get(name);
        if (raw == null) { if (!initial) out[k] = 'def' in o ? o.def : null; continue; } // first load: keep the constructor's value
        if (o.resolve) { inst.__routePending[k] = raw; out[k] = 'def' in o ? o.def : null; continue; }
        out[k] = o.dec ? o.dec(raw) : typeof o.def === 'number' ? (Number(raw) || 0) : typeof o.def === 'boolean' ? raw === '1' : raw;
      }
      return out;
    },
    enc(o, v) {
      if (o.enc) v = o.enc(v);
      if (v == null || v === '' || v === false || ('def' in o && v === o.def)) return null;
      return v === true ? '1' : String(v);
    },
    sync(inst) {
      if (!inst.routeKeys || inst.__routeHydrating) return;
      const q = new URLSearchParams(location.search);
      let changed = false, push = false;
      for (const k in inst.routeKeys) {
        if (inst.__routePending && k in inst.__routePending) continue; // still waiting for data; keep the URL value
        const o = inst.routeKeys[k] || {}, name = o.name || k, v = this.enc(o, inst.state[k]);
        if ((q.get(name)) === v) continue;
        if (v == null) q.delete(name); else q.set(name, v);
        changed = true;
        // Opening something pushes; closing it just replaces, so Back does not reopen what the user closed.
        if (o.push && v != null) push = true;
      }
      if (!changed) return;
      const qs = q.toString(), url = location.pathname + (qs ? '?' + qs : '') + location.hash;
      try { if (push) history.pushState({ kd: 1 }, '', url); else history.replaceState(history.state, '', url); } catch (e) {}
    },
    resolve(inst) {
      const pend = inst.__routePending;
      if (!pend) return false;
      let got = false;
      for (const k of Object.keys(pend)) {
        const v = inst.routeKeys[k].resolve(pend[k], inst);
        if (v != null) { inst.state[k] = v; delete pend[k]; got = true; }
      }
      return got;
    }
  };
  window.__ROUTE = ROUTE;
  // Close a pushed view (thread, sheet, detail): go Back if we opened it in this page, else run the fallback.
  window.routeBack = function (fallback) { if (history.state && history.state.kd) history.back(); else if (fallback) fallback(); };
  const BOOL_ATTRS = new Set(['disabled', 'checked', 'selected', 'hidden', 'readonly', 'required', 'multiple', 'open', 'autofocus', 'inert', 'novalidate', 'reversed', 'default', 'loop', 'muted', 'autoplay', 'controls', 'playsinline']);
  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    let v = scope;
    for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
    return v;
  }
  const interp = (s, scope) => s.replace(HOLE, (_, p) => { const v = lookup(p, scope); return v == null ? '' : v; });
  // ---- Event binding + DOM morphing: re-renders patch the live DOM instead of replacing it, so images don't
  // reload, animations don't replay, and focus/caret/scroll survive (no flicker). ----
  function bindEv(el, type, fn) {
    el.__h = el.__h || {};
    if (!(type in el.__h)) el.addEventListener(type, ev => { const f = el.__h[type]; if (f) return f(ev); });
    el.__h[type] = fn;
  }
  const isKeep = n => n.nodeType === 1 && (n.__keep || n.classList.contains('kmap-el') || n.tagName === 'VIDEO' || (n.firstElementChild && n.firstElementChild.classList && n.firstElementChild.classList.contains('kmap-el') && n.style.position === 'absolute'));
  const sameNode = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && (a.id || '') === (b.id || '') && (a.getAttribute('type') || '') === (b.getAttribute('type') || '')));
  function morphAttrs(a, b) {
    for (const at of Array.from(a.attributes)) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
    for (const at of Array.from(b.attributes)) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') {
      const focused = document.activeElement === a;
      if (!focused && b.hasAttribute('value') && a.value !== b.getAttribute('value')) a.value = b.getAttribute('value');
      if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked');
    }
    if (b.__h) for (const t in b.__h) bindEv(a, t, b.__h[t]);
    if (a.__h) for (const t in a.__h) if (!b.__h || !(t in b.__h)) a.__h[t] = null;
  }
  function morphChildren(a, b) {
    const oldKids = Array.from(a.childNodes).filter(n => !isKeep(n));
    const newKids = Array.from(b.childNodes);
    let i = 0;
    for (; i < newKids.length; i++) {
      const nn = newKids[i], on = oldKids[i];
      if (!on) { a.appendChild(nn); continue; }
      if (!sameNode(on, nn)) { a.replaceChild(nn, on); continue; }
      if (on.nodeType === 3 || on.nodeType === 8) { if (on.nodeValue !== nn.nodeValue) on.nodeValue = nn.nodeValue; continue; }
      morphAttrs(on, nn);
      morphChildren(on, nn);
    }
    for (; i < oldKids.length; i++) oldKids[i].remove();
  }
  function render(node, scope, out) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(interp(node.nodeValue, scope))); return; }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'helmet') return;
    if (tag === 'sc-for') {
      const m = WHOLE.exec(node.getAttribute('list') || '');
      const list = (m && lookup(m[1], scope)) || [];
      const as = node.getAttribute('as') || 'item';
      list.forEach((item, i) => {
        const s = Object.assign(Object.create(scope), { [as]: item, $index: i });
        node.childNodes.forEach(c => render(c, s, out));
      });
      return;
    }
    if (tag === 'sc-if') {
      const m = WHOLE.exec(node.getAttribute('value') || '');
      if (m && lookup(m[1], scope)) node.childNodes.forEach(c => render(c, scope, out));
      return;
    }
    const el = node.cloneNode(false);
    for (const a of Array.from(el.attributes)) {
      if (!a.value.includes('{{')) continue;
      const m = WHOLE.exec(a.value);
      if (a.name.startsWith('on')) {
        el.removeAttribute(a.name);
        const fn = m && lookup(m[1], scope);
        if (typeof fn === 'function') { bindEv(el, a.name.slice(2), fn); el.dataset.bound = '1'; }
      } else if (m) {
        // Whole-value hole: false/null/undefined removes the attribute (so disabled="{{busy}}" works); true → empty boolean attr.
        const v = lookup(m[1], scope);
        // Real HTML boolean attributes are toggled by presence; everything else (aria-*, data-*, value…) keeps "true"/"false" text.
        if (BOOL_ATTRS.has(a.name)) { if (v === false || v == null || v === 'false') el.removeAttribute(a.name); else el.setAttribute(a.name, ''); }
        else if (v == null) el.removeAttribute(a.name);
        else el.setAttribute(a.name, String(v));
      } else el.setAttribute(a.name, interp(a.value, scope));
    }
    node.childNodes.forEach(c => render(c, scope, el));
    out.appendChild(el);
  }
  document.addEventListener('DOMContentLoaded', () => {
    const tpl = document.querySelector('x-dc');
    const helmet = tpl.querySelector('helmet');
    if (helmet) Array.from(helmet.children).forEach(c => document.head.appendChild(c.cloneNode(true)));
    const sc = document.querySelector('script[data-dc-script]');
    const decl = JSON.parse(sc.getAttribute('data-props') || '{}');
    const props = {};
    for (const k in decl) if (k[0] !== '$' && 'default' in decl[k]) props[k] = decl[k].default;
    const Component = new Function('DCLogic', sc.textContent + '\n;return Component;')(DCLogic);
    const inst = new Component(props);
    if (inst.routeKeys) {
      Object.assign(inst.state, ROUTE.read(inst, true));
      window.addEventListener('popstate', () => {
        const prev = Object.assign({}, inst.state);
        inst.__routeHydrating = true;
        Object.assign(inst.state, ROUTE.read(inst));
        const keys = Object.keys(inst.routeKeys).filter(k => prev[k] !== inst.state[k]);
        try { if (inst.onRoute) inst.onRoute(keys, prev); } catch (e) { console.error(e); }
        inst.__render();
        inst.__routeHydrating = false;
      });
    }
    const host = document.createElement('div');
    host.className = 'dc-host';
    tpl.after(host);
    // Detach the template so ids/images inside it don't shadow the live DOM (getElementById, stray image requests).
    tpl.remove();
    // Page entrance animation only on the first render, not on every setState.
    setTimeout(() => host.classList.add('kd-ready'), 700);
    inst.__render = () => {
      if (inst.routeKeys && ROUTE.resolve(inst) && inst.onRoute) { try { inst.onRoute(['__resolved']); } catch (e) {} }
      const frag = document.createDocumentFragment();
      const vals = inst.renderVals ? inst.renderVals() : {};
      tpl.childNodes.forEach(c => render(c, vals, frag));
      morphChildren(host, frag);
      // Reserve space for a fixed bottom tab bar (rider/merchant apps) so the last items aren't hidden under it.
      let navh = 0;
      host.querySelectorAll('nav, [class*="tabs"], [class*="foot"], [class*="bar"]').forEach(n => {
        const cs = getComputedStyle(n);
        if (cs.position === 'fixed' && (cs.bottom === '0px') && n.offsetHeight < 260) navh = Math.max(navh, n.offsetHeight);
      });
      if (host._navh !== navh) { host._navh = navh; host.style.setProperty('--kd-navh', navh + 'px'); }
      if (window.chatLive && window.chatLive.total) window.chatLive.paint();
      if (inst.routeKeys) ROUTE.sync(inst);
      // Persistent map nodes are absolutely positioned: re-assert a positioning context on their placeholder after the
      // morph (which resets template-controlled style attributes), otherwise the map would cover the whole screen.
      host.querySelectorAll('.kmap-el').forEach(d => {
        let top = d; while (top.parentElement && top.parentElement.__keep) top = top.parentElement;
        const ph = top.parentElement;
        if (ph && ph !== host && getComputedStyle(ph).position === 'static') ph.style.position = 'relative';
      });
      // Every button reacts: ones without a handler show a demo toast (bindEv replaces, never stacks).
      host.querySelectorAll('button:not([data-bound])').forEach(b => bindEv(b, 'click', () =>
        window.toast((b.getAttribute('aria-label') || b.textContent.trim() || 'ฟีเจอร์นี้') + ' · เดโม เร็ว ๆ นี้')));
    };
    inst.__render();
    if (inst.componentDidMount) inst.componentDidMount();
  });
})();
