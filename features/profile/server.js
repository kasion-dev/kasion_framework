// kasion feature: profile — a public profile per user (display name, bio, city, photos) with an onboarding gate.
// Provides the shared 'profileOf' service, so chat, calls, feed and rooms show the profile name and first photo.
// Options: required: ['name', 'photo']  fields needed before the profile counts as complete (default shown)
import { HttpError, pj, str } from '../core/http.js';

export const profile = (opts = {}) => (app) => {
  const required = opts.required || ['name'];   // profile({ required: ['name', 'photo'] }) to insist on a photo
  const okPhoto = (u) => typeof u === 'string' && u.length <= 500 && /^(\/api\/images\/[a-f0-9-]{36}$|https:\/\/[a-z0-9-]+\.googleusercontent\.com\/)/.test(u);
  const get = (c, uid) => c.db.prepare('SELECT * FROM profiles WHERE uid = ?').bind(uid).first();
  const isComplete = (p) => required.every((f) => (f === 'photo' ? pj(p.photos, []).length > 0 : !!String(p[f] || '').trim()));
  // what other members may see — never email
  const card = (p, lastSeen, now) => { const photos = pj(p.photos, []).filter(okPhoto); return { uid: p.uid, name: p.name, bio: p.bio, city: p.city, photos, photo: photos[0] || null, online: lastSeen != null ? now - lastSeen < 60_000 : false }; };
  const mine = (p) => (p ? { ...card(p, null, 0), complete: !!p.complete } : null);

  app.provide('profileOf', async (c, uid) => { const p = await get(c, uid); if (!p || !p.name) return null; return { name: p.name, photo: pj(p.photos, []).filter(okPhoto)[0] || null }; });
  app.provide('profileCard', async (c, uid) => { const p = await c.db.prepare('SELECT p.*, u.last_seen FROM profiles p JOIN users u ON u.uid = p.uid WHERE p.uid = ?').bind(uid).first(); return p ? card(p, p.last_seen, c.now) : null; });
  // first sign-in: draft profile from the Google name + photo; every /api/me returns { profile }
  app.onMe(async (c, user) => {
    await c.db.prepare('INSERT OR IGNORE INTO profiles (uid, name, photos, updated_at) VALUES (?, ?, ?, ?)').bind(c.me, str(user.name, 40), JSON.stringify(user.photo && okPhoto(user.photo) ? [user.photo] : []), c.now).run();
    const p = await get(c, c.me);
    if (!p.complete && isComplete(p)) { await c.db.prepare('UPDATE profiles SET complete = 1 WHERE uid = ?').bind(c.me).run(); p.complete = 1; }
    return { profile: mine(p) };
  });
  app.get('/api/profile', async (c) => c.json({ profile: mine(await get(c, c.me)) }));
  app.put('/api/profile', async (c) => {
    const b = await c.body(), cur = (await get(c, c.me)) || { uid: c.me, name: '', bio: '', city: '', photos: '[]' };
    const next = { ...cur };
    if (b.name !== undefined) { next.name = str(b.name, 40); if (!next.name) throw new HttpError(400, 'กรอกชื่อที่จะแสดง'); }
    if (b.bio !== undefined) next.bio = str(b.bio, 300);
    if (b.city !== undefined) next.city = str(b.city, 60);
    if (b.photos !== undefined) { if (!Array.isArray(b.photos) || !b.photos.every(okPhoto)) throw new HttpError(400, 'รูปไม่ถูกต้อง'); next.photos = JSON.stringify(b.photos.slice(0, 6)); }
    next.complete = isComplete(next) ? 1 : 0;
    await c.db.prepare(`INSERT INTO profiles (uid, name, bio, city, photos, complete, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(uid) DO UPDATE SET name = ?2, bio = ?3, city = ?4, photos = ?5, complete = ?6, updated_at = ?7`).bind(c.me, next.name, next.bio || '', next.city || '', next.photos || '[]', next.complete, c.now).run();
    await c.db.prepare('UPDATE users SET name = ? WHERE uid = ?').bind(next.name, c.me).run();
    return c.json({ profile: mine(await get(c, c.me)) });
  });
  // someone else's profile
  app.get('/api/profiles/:uid', async (c) => {
    const uid = c.params.uid;
    const p = await c.db.prepare('SELECT p.*, u.last_seen, u.blocked FROM profiles p JOIN users u ON u.uid = p.uid WHERE p.uid = ?').bind(uid).first();
    if (!p || p.blocked || (uid !== c.me && (await c.hidden()).includes(uid))) throw new HttpError(404, 'ไม่พบโปรไฟล์นี้');
    return c.json({ profile: card(p, p.last_seen, c.now), self: uid === c.me });
  });
};
