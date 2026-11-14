// kasion feature: admin — everything behind { admin: true } (emails in ADMIN_EMAILS): overview numbers, member search and
// suspension, reports (when the safety feature is installed) and removal of content that other features registered
// with app.adminContent().
import { HttpError, str } from '../core/http.js';

export const admin = () => (app) => {
  const A = { admin: true }, day = 86_400_000;
  const has = async (c, table) => !!(await c.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first());

  app.get('/api/admin/overview', async (c) => {
    const q = (sql, ...b) => c.db.prepare(sql).bind(...b);
    const r = await c.db.batch([
      q('SELECT COUNT(*) n FROM users'), q('SELECT COUNT(*) n FROM users WHERE created_at > ?', c.now - day), q('SELECT COUNT(*) n FROM users WHERE created_at > ?', c.now - 7 * day),
      q('SELECT COUNT(*) n FROM users WHERE last_seen > ?', c.now - 60_000), q('SELECT COUNT(*) n FROM users WHERE last_seen > ?', c.now - day),
      q('SELECT COUNT(*) n FROM messages WHERE created_at > ?', c.now - day), q('SELECT COUNT(*) n FROM push_subs'),
      // next-day return: joined 24–48 h ago and seen again at least 20 h after joining
      q('SELECT COUNT(*) total, SUM(CASE WHEN last_seen > created_at + ? THEN 1 ELSE 0 END) back FROM users WHERE created_at > ? AND created_at <= ?', 20 * 3_600_000, c.now - 2 * day, c.now - day),
      q(`SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', '+7 hours') d, COUNT(*) n FROM users WHERE created_at > ? GROUP BY d ORDER BY d`, c.now - 14 * day),
    ]);
    const n = (i) => (r[i].results[0] && r[i].results[0].n) || 0, ret = r[7].results[0] || {};
    const openReports = (await has(c, 'reports')) ? (await c.db.prepare('SELECT COUNT(*) n FROM reports WHERE resolved_at IS NULL').first()).n : null;
    return c.json({ users: n(0), newToday: n(1), new7d: n(2), onlineNow: n(3), active24h: n(4), dms24h: n(5), pushDevices: n(6), returnTotal: ret.total || 0, returnBack: ret.back || 0, signups: r[8].results, openReports,
      contentKinds: app.adminContents().map((k) => ({ kind: k.kind, label: k.label })) });
  }, A);
  app.get('/api/admin/users', async (c) => {
    const qq = '%' + str(c.url.searchParams.get('q'), 60).toLowerCase() + '%';
    const { results } = await c.db.prepare(`SELECT uid, email, name, photo, blocked, last_seen, created_at FROM users WHERE lower(COALESCE(name, '')) LIKE ?1 OR lower(COALESCE(email, '')) LIKE ?1 ORDER BY created_at DESC LIMIT 100`).bind(qq).all();
    return c.json({ users: results.map((u) => ({ uid: u.uid, email: u.email, name: u.name, photo: u.photo, blocked: !!u.blocked, lastSeen: u.last_seen, createdAt: u.created_at })) });
  }, A);
  app.post('/api/admin/users/:uid/ban', async (c) => {
    if (c.params.uid === c.me) throw new HttpError(400, 'ระงับบัญชีตัวเองไม่ได้');
    const on = !!(await c.body()).blocked;
    const r = await c.db.prepare('UPDATE users SET blocked = ? WHERE uid = ?').bind(on ? 1 : 0, c.params.uid).run();
    if (!r.meta.changes) throw new HttpError(404, 'ไม่พบผู้ใช้นี้');
    if (on) await c.db.prepare('DELETE FROM push_subs WHERE uid = ?').bind(c.params.uid).run();
    return c.json({ ok: true, blocked: on });
  }, A);
  app.get('/api/admin/reports', async (c) => {
    if (!(await has(c, 'reports'))) return c.json({ reports: [], installed: false });
    const { results } = await c.db.prepare(`SELECT r.*, ub.name by_name, ut.name target_name, ut.blocked target_blocked FROM reports r LEFT JOIN users ub ON ub.uid = r.uid LEFT JOIN users ut ON ut.uid = r.target
      WHERE (?1 = 1 OR r.resolved_at IS NULL) ORDER BY r.created_at DESC LIMIT 200`).bind(c.url.searchParams.get('all') === '1' ? 1 : 0).all();
    return c.json({ installed: true, reports: results.map((r) => ({ id: r.id, at: r.created_at, reason: r.reason, detail: r.detail, by: { uid: r.uid, name: r.by_name }, target: { uid: r.target, name: r.target_name, blocked: !!r.target_blocked }, resolved: !!r.resolved_at })) });
  }, A);
  app.post('/api/admin/reports/:id/resolve', async (c) => { await c.db.prepare('UPDATE reports SET resolved_at = ? WHERE id = ?').bind(c.now, c.params.id).run(); return c.json({ ok: true }); }, A);
  // content registered by other features: { kind, label, items: [{ id, uid, name, text, img, at, … }] }
  app.get('/api/admin/content', async (c) => c.json({ groups: await Promise.all(app.adminContents().map(async (k) => ({ kind: k.kind, label: k.label, items: await k.list(c) }))) }), A);
  app.delete('/api/admin/content/:kind/:id', async (c) => {
    const k = app.adminContents().find((x) => x.kind === c.params.kind);
    if (!k) throw new HttpError(404, 'unknown content kind');
    await k.remove(c, c.params.id);
    return c.json({ ok: true });
  }, A);
};
