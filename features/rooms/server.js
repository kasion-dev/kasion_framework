// kasion feature: rooms — public group chat rooms, realtime on channel 'room:<id>' with a live member count.
// Rooms live in the `rooms` table (seeded with three); hide one with hidden = 1.
// Options: canPost(c) throw HttpError to refuse sending (e.g. unfinished profile)
import { HttpError, str } from '../core/http.js';

export const rooms = (opts = {}) => (app) => {
  const roomOf = async (c, id) => { const r = await c.db.prepare('SELECT * FROM rooms WHERE id = ? AND hidden = 0').bind(id).first(); if (!r) throw new HttpError(404, 'ไม่พบห้องนี้'); return r; };
  app.allowChannel(async (c, name) => name.startsWith('room:') && !!(await c.db.prepare('SELECT 1 FROM rooms WHERE id = ? AND hidden = 0').bind(name.slice(5)).first()));
  const view = async (c, r, me) => { const p = await c.profileOf(r.uid); return { id: r.id, text: r.body, img: r.img || null, at: r.created_at, mine: r.uid === me, author: { uid: r.uid, name: p.name, photo: p.photo || null } }; };

  app.get('/api/rooms', async (c) => {
    const { results } = await c.db.prepare('SELECT * FROM rooms WHERE hidden = 0 ORDER BY sort').all();
    const counts = await Promise.all(results.map((r) => c.channelCount('room:' + r.id)));
    return c.json({ rooms: results.map((r, i) => ({ id: r.id, name: r.name, about: r.about, color: r.color, online: counts[i] })) });
  });
  app.get('/api/rooms/:id/messages', async (c) => {
    const room = await roomOf(c, c.params.id), before = Number(c.url.searchParams.get('before')) || c.now + 1, hid = new Set(await c.hidden());
    const { results } = await c.db.prepare(`SELECT * FROM (SELECT rm.* FROM room_messages rm JOIN users u ON u.uid = rm.uid WHERE rm.room = ? AND rm.created_at < ? AND u.blocked = 0 ORDER BY rm.created_at DESC LIMIT 60) ORDER BY created_at`).bind(room.id, before).all();
    return c.json({ room: { id: room.id, name: room.name, about: room.about, color: room.color }, messages: await Promise.all(results.filter((r) => !hid.has(r.uid)).map((r) => view(c, r, c.me))) });
  });
  app.post('/api/rooms/:id/messages', async (c) => {
    if (opts.canPost) await opts.canPost(c);
    const room = await roomOf(c, c.params.id), b = await c.body(), text = str(b.text, 500), img = b.img ? String(b.img) : null;
    if (img && !/^\/api\/images\/[a-f0-9-]{36}$/.test(img)) throw new HttpError(400, 'invalid image');
    if (!text && !img) throw new HttpError(400, 'พิมพ์ข้อความก่อน');
    await c.rate('SELECT COUNT(*) n FROM room_messages WHERE uid = ? AND created_at > ?', 30_000, 12);
    const row = { id: crypto.randomUUID(), uid: c.me, body: text, img, created_at: c.now };
    await c.db.prepare('INSERT INTO room_messages (id, room, uid, body, img, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(row.id, room.id, c.me, text, img, c.now).run();
    await c.toChannel('room:' + room.id, { type: 'room_msg', room: room.id, message: await view(c, row, null), by: c.me }, await c.hidden());
    return c.json({ message: await view(c, row, c.me) });
  });
  app.adminContent({ kind: 'room', label: 'ข้อความในห้อง',
    list: async (c) => (await c.db.prepare('SELECT rm.id, rm.uid, rm.body text, rm.img, rm.created_at at, rm.room, u.name FROM room_messages rm LEFT JOIN users u ON u.uid = rm.uid ORDER BY rm.created_at DESC LIMIT 80').all()).results,
    remove: async (c, id) => { const r = await c.db.prepare('SELECT room FROM room_messages WHERE id = ?').bind(id).first(); if (!r) return; await c.db.prepare('DELETE FROM room_messages WHERE id = ?').bind(id).run(); await c.toChannel('room:' + r.room, { type: 'room_deleted', id }); } });
};
