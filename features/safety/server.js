// kasion feature: safety — block and report. Provides the shared 'hidden' service: once installed, chat, calls, feed,
// rooms and people automatically hide blocked pairs from each other (both directions).
import { HttpError, str } from '../core/http.js';

export const safety = () => (app) => {
  app.provide('hidden', async (c) => { const { results } = await c.db.prepare('SELECT uid, target FROM blocks WHERE uid = ?1 OR target = ?1').bind(c.me).all(); return results.map((b) => (b.uid === c.me ? b.target : b.uid)); });
  const target = async (c) => {
    const t = (await c.body()).target;
    if (!t || typeof t !== 'string' || t === c.me) throw new HttpError(400, 'target required');
    if (!(await c.db.prepare('SELECT 1 FROM users WHERE uid = ?').bind(t).first())) throw new HttpError(404, 'ไม่พบผู้ใช้นี้');
    return t;
  };
  app.post('/api/block', async (c) => { const t = await target(c); await c.db.prepare('INSERT OR IGNORE INTO blocks (uid, target, created_at) VALUES (?, ?, ?)').bind(c.me, t, c.now).run(); return c.json({ ok: true }); });
  app.delete('/api/block/:uid', async (c) => { await c.db.prepare('DELETE FROM blocks WHERE uid = ? AND target = ?').bind(c.me, c.params.uid).run(); return c.json({ ok: true }); });
  // people I blocked (so they can be unblocked)
  app.get('/api/blocks', async (c) => {
    const { results } = await c.db.prepare('SELECT b.target uid, b.created_at, u.name, u.photo FROM blocks b LEFT JOIN users u ON u.uid = b.target WHERE b.uid = ? ORDER BY b.created_at DESC LIMIT 200').bind(c.me).all();
    return c.json({ blocks: await Promise.all(results.map(async (r) => { const p = await c.profileOf(r.uid); return { uid: r.uid, name: p.name, photo: p.photo || null, at: r.created_at }; })) });
  });
  // { target, reason, detail } — detail may carry a content reference such as 'post:<id>'
  app.post('/api/report', async (c) => {
    const t = await target(c), b = await c.body(), reason = str(b.reason, 40);
    if (!reason) throw new HttpError(400, 'เลือกเหตุผล');
    await c.rate('SELECT COUNT(*) n FROM reports WHERE uid = ? AND created_at > ?', 3_600_000, 20);
    await c.db.prepare('INSERT INTO reports (id, uid, target, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), c.me, t, reason, str(b.detail, 500) || null, c.now).run();
    return c.json({ ok: true });
  });
};
