// App settings read by /kasion.js. Load this first on every page.
window.KASION = {
  name: '__APP_TITLE__',
  // Brand colours → CSS variables --kd-accent, --kd-accent-ink, --kd-accent-soft (plus ink, mute, line, bg)
  theme: { accent: '__ACCENT__', accentInk: '__ACCENT_INK__', accentSoft: '__ACCENT_SOFT__' },
  // Bottom tab bar: [id, label, href, svg path data (24×24, stroked)]
  tabs: [
    ['home', 'หน้าแรก', '/', 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z'],
    ['chat', 'ข้อความ', '/chat', 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'],
    // kasion:tabs (tabs of features added by `kasion add` go above this line — keep it to 5 tabs or fewer)
    ['settings', 'ตั้งค่า', '/settings', 'M12 3l2 3 3.5.5-1 3.4 2 2.9-3 1.8-.5 3.5-3-1.1-3 1.1-.5-3.5-3-1.8 2-2.9-1-3.4L10 6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  ],
  chat: true,   // per-user realtime socket, unread badge on links to /chat, message banners
  calls: true,  // incoming-call watcher on every page
  // Features installed with `kasion add` (pages can check KASION.features.includes('safety')).
  features: [],
  // kasion:config (settings of features added by `kasion add` go above this line)
  // Firebase web config override (defaults to the shared kasion-dev project):
  // firebase: { apiKey: '…', authDomain: '…', projectId: '…', appId: '…' },
};
