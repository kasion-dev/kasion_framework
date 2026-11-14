// App settings read by /kasion.js. Load this first on every page.
window.KASION = {
  name: '__APP_TITLE__',
  // Brand colours → CSS variables --kd-accent, --kd-accent-ink, --kd-accent-soft (plus ink, mute, line, bg)
  theme: { accent: '__ACCENT__', accentInk: '__ACCENT_INK__', accentSoft: '__ACCENT_SOFT__' },
  // Bottom tab bar: [id, label, href, svg path data (24×24, stroked)]
  tabs: [
    ['home', 'หน้าแรก', '/', 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z'],
    ['chat', 'ข้อความ', '/chat', 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'],
    ['settings', 'ตั้งค่า', '/settings', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0'],
  ],
  chat: true,   // per-user realtime socket, unread badge on links to /chat, message banners
  calls: true,  // incoming-call watcher on every page
  // Onboarding gate (optional): send unfinished accounts to a setup page.
  // setup: { needed: me => !me.profileDone, url: '/profile?setup=1' },
  // Firebase web config override (defaults to the shared kasion-dev project):
  // firebase: { apiKey: '…', authDomain: '…', projectId: '…', appId: '…' },
};
