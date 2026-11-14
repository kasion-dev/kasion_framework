// __APP_TITLE__ — Worker API. Static screens live in public/ and are served by the assets layer.
// Built with the kasion framework: see src/core/ (do not edit; update it from kasion_framework) and docs in CLAUDE.md.
import { createApp, HttpError } from './core/app.js';
import { images } from './core/images.js';
import { push } from './core/push.js';
import { chat } from './core/chat.js';
import { calls } from './core/calls.js';
// kasion:imports (features added by `kasion add` are imported above this line)
export { Hub } from './core/hub.js';

const app = createApp({
  firebaseProject: 'kasion-dev',
  // Shared realtime channels people may join: return true to allow. ('notes' is the starter demo feed.)
  channels: async (c, name) => name === 'notes',
  // Extra fields returned by POST /api/me (runs after the users row is saved).
  onMe: async (c, user) => ({}),
});

app.use(images());   // /api/images
app.use(push());     // /api/push/*, /api/public/push-key
app.use(chat());     // /api/chat/*   (direct messages + receipts)
app.use(calls());    // /api/calls/*, /api/agora-token
// kasion:plugins (features added by `kasion add` are registered above this line)

// ---- people you can message (starter: everyone who has signed in) ----
app.get('/api/users', async (c) => {
  const { results } = await c.db.prepare('SELECT uid, name, photo, last_seen FROM users WHERE uid != ? AND blocked = 0 ORDER BY last_seen DESC LIMIT 100').bind(c.me).all();
  return c.json({ users: results.map((u) => ({ uid: u.uid, name: u.name, photo: u.photo, online: c.now - u.last_seen < 60_000 })) });
});

// ---- starter feature: a shared notes feed (shows routes, validation, rate limit, realtime) — replace with your own ----
const noteView = (r, me) => ({ id: r.id, text: r.body, at: r.created_at, mine: r.uid === me, author: { uid: r.uid, name: r.name || 'ผู้ใช้', photo: r.photo || null } });
const NOTE_SQL = 'SELECT n.*, u.name, u.photo FROM notes n LEFT JOIN users u ON u.uid = n.uid';
app.get('/api/notes', async (c) => {
  const { results } = await c.db.prepare(`${NOTE_SQL} ORDER BY n.created_at DESC LIMIT 50`).all();
  return c.json({ notes: results.map((r) => noteView(r, c.me)), online: await c.channelCount('notes') });
});
app.post('/api/notes', async (c) => {
  const text = c.str((await c.body()).text, 300);
  if (!text) throw new HttpError(400, 'พิมพ์ข้อความก่อน');
  await c.rate('SELECT COUNT(*) n FROM notes WHERE uid = ? AND created_at > ?', 60_000, 6);
  const id = crypto.randomUUID();
  await c.db.prepare('INSERT INTO notes (id, uid, body, created_at) VALUES (?, ?, ?, ?)').bind(id, c.me, text, c.now).run();
  const row = await c.db.prepare(`${NOTE_SQL} WHERE n.id = ?`).bind(id).first();
  await c.toChannel('notes', { type: 'note', note: noteView(row, null), by: c.me });
  return c.json({ note: noteView(row, c.me) });
});
app.delete('/api/notes/:id', async (c) => {
  const r = await c.db.prepare('DELETE FROM notes WHERE id = ? AND (uid = ? OR ?3 = 1)').bind(c.params.id, c.me, c.isAdmin() ? 1 : 0).run();
  if (!r.meta.changes) throw new HttpError(404, 'ไม่พบโน้ตนี้');
  await c.toChannel('notes', { type: 'note_deleted', id: c.params.id });
  return c.json({ ok: true });
});

// ---- admin example ----
app.get('/api/admin/stats', async (c) => {
  const day = 86_400_000;
  const [u, n, on] = await c.db.batch([
    c.db.prepare('SELECT COUNT(*) n FROM users'),
    c.db.prepare('SELECT COUNT(*) n FROM users WHERE created_at > ?').bind(c.now - day),
    c.db.prepare('SELECT COUNT(*) n FROM users WHERE last_seen > ?').bind(c.now - 60_000),
  ]);
  return c.json({ users: u.results[0].n, newToday: n.results[0].n, onlineNow: on.results[0].n });
}, { admin: true });

export default app;
