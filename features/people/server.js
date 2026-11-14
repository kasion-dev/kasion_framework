// kasion feature: people — who is online now / recently, optionally with a coarse distance ("near me").
// Presence comes from users.last_seen, which every open page refreshes (the calls watcher or the people page itself).
// Location is optional and coarse: stored rounded to ~1 km, and other users only ever get a distance in rough steps.
import { HttpError } from '../core/http.js';

function distKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const r = (x) => (x * Math.PI) / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  const d = 12742 * Math.asin(Math.sqrt(h));
  // coarse steps (2, 5, 10 … 50, then tens) so a position cannot be triangulated from several fake locations
  return d <= 2 ? 2 : d <= 50 ? Math.max(5, Math.round(d / 5) * 5) : Math.round(d / 10) * 10;
}

export const people = () => (app) => {
  app.get('/api/people', async (c) => {
    await c.db.prepare('UPDATE users SET last_seen = ? WHERE uid = ?').bind(c.now, c.me).run();
    const hid = new Set(await c.hidden());
    const mine = await c.db.prepare('SELECT lat, lng FROM user_locations WHERE uid = ?').bind(c.me).first();
    const { results } = await c.db.prepare(`SELECT u.uid, u.name, u.photo, u.last_seen, l.lat, l.lng FROM users u LEFT JOIN user_locations l ON l.uid = u.uid
      WHERE u.uid != ?1 AND u.blocked = 0 AND u.last_seen > ?2 ORDER BY u.last_seen DESC LIMIT 200`).bind(c.me, c.now - 86_400_000).all();
    const card = app.service('profileCard');
    const all = await Promise.all(results.filter((u) => !hid.has(u.uid)).map(async (u) => {
      const p = (card && (await card(c, u.uid))) || { name: u.name, photo: u.photo, city: '' };
      return { uid: u.uid, name: p.name || u.name || 'ผู้ใช้', photo: p.photo || null, city: p.city || '', online: c.now - u.last_seen < 60_000, lastSeen: u.last_seen, distanceKm: distKm(mine, u) };
    }));
    return c.json({ online: all.filter((x) => x.online), recent: all.filter((x) => !x.online).slice(0, 60), hasLocation: !!mine });
  });
  app.post('/api/location', async (c) => {
    const b = await c.body(); let lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, 'ตำแหน่งไม่ถูกต้อง');
    lat = Math.round(lat * 100) / 100; lng = Math.round(lng * 100) / 100;
    await c.db.prepare('INSERT INTO user_locations (uid, lat, lng, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(uid) DO UPDATE SET lat = ?2, lng = ?3, updated_at = ?4').bind(c.me, lat, lng, c.now).run();
    return c.json({ ok: true, hasLocation: true });
  });
  app.delete('/api/location', async (c) => { await c.db.prepare('DELETE FROM user_locations WHERE uid = ?').bind(c.me).run(); return c.json({ ok: true, hasLocation: false }); });
};
