// kasion framework — direct messages between two users with WhatsApp-style receipts.
// Client thread key: 'm:<peerUid>'. Stored thread id: 'm:<uidA>:<uidB>' (sorted).
//   sent ✓  → saved on the server
//   delivered ✓✓ → the recipient's app acknowledged it (POST …/ack) or fetched it (/api/chat/pending)
//   read ✓✓ (green) → the recipient opened the thread
// Options:
//   canMessage(c, peerUid)  throw HttpError to refuse (default: peer must exist and not be suspended)
//   profileOf(c, uid)       → { name, photo } shown in lists / notifications (default: users table)
//   hidden(c)               → array of uids whose messages must not count or show (blocks). Default: none.
//   onMessage(c, { thread, peer, message })  hook after a message is saved
import { HttpError, pair, str } from './http.js';

export const chat = (opts = {}) => (app) => {
  const profileOf = opts.profileOf || (async (c, uid) => { const u = await c.db.prepare('SELECT name, photo FROM users WHERE uid = ?').bind(uid).first(); return u || { name: 'ผู้ใช้', photo: null }; });
  const hiddenOf = async (c) => new Set(opts.hidden ? await opts.hidden(c) : []);
  const MINE = "(m.thread LIKE 'm:' || ?1 || ':%' OR m.thread LIKE 'm:%:' || ?1)";
  const peerOfThread = (t, me) => { const [, a, b] = t.split(':'); return a === me ? b : a; };

  const thread = async (c, raw) => {
    if (!raw.startsWith('m:')) throw new HttpError(400, 'invalid thread');
    const peer = raw.slice(2);
    if (!peer || peer === c.me || peer.includes(':')) throw new HttpError(400, 'invalid thread');
    if (opts.canMessage) await opts.canMessage(c, peer);
    else { const u = await c.db.prepare('SELECT blocked FROM users WHERE uid = ?').bind(peer).first(); if (!u || u.blocked) throw new HttpError(404, 'ไม่พบผู้ใช้นี้'); }
    const [a, b] = pair(c.me, peer);
    return { id: 'm:' + a + ':' + b, peer };
  };
  const markRead = async (c, t) => {
    const [, upd] = await c.db.batch([
      c.db.prepare('INSERT INTO chat_reads (uid, thread, read_at) VALUES (?, ?, ?) ON CONFLICT(uid, thread) DO UPDATE SET read_at = excluded.read_at').bind(c.me, t.id, c.now),
      c.db.prepare('UPDATE messages SET read_at = ?1, delivered_at = COALESCE(delivered_at, ?1) WHERE thread = ?2 AND sender_uid != ?3 AND read_at IS NULL').bind(c.now, t.id, c.me),
    ]);
    if (upd.meta && upd.meta.changes) await c.toUser(t.peer, { type: 'receipt', thread: 'm:' + c.me, status: 'read', upTo: c.now });
  };
  const view = (x, viewer) => ({ id: x.id, mine: x.sender_uid === viewer, text: x.body || '', img: x.img || null, at: x.created_at,
    status: x.sender_uid === viewer ? (x.read_at ? 'read' : x.delivered_at ? 'delivered' : 'sent') : undefined });

  // Unread counts per thread: { total, threads: { 'm:<peer>': n } }
  app.get('/api/chat/unread', async (c) => {
    const hid = await hiddenOf(c);
    const { results } = await c.db.prepare(`SELECT m.thread, m.sender_uid, COUNT(*) n FROM messages m LEFT JOIN chat_reads r ON r.uid = ?1 AND r.thread = m.thread
      WHERE m.sender_uid != ?1 AND m.created_at > COALESCE(r.read_at, 0) AND ${MINE} GROUP BY m.thread`).bind(c.me).all();
    const threads = {}; let total = 0;
    for (const r of results) { if (hid.has(r.sender_uid)) continue; threads['m:' + peerOfThread(r.thread, c.me)] = r.n; total += r.n; }
    return c.json({ total, threads });
  });
  // Messages my devices never received: returned with data and marked delivered (call on app start / reconnect).
  app.get('/api/chat/pending', async (c) => {
    const hid = await hiddenOf(c);
    const all = await c.db.prepare(`SELECT m.* FROM messages m WHERE m.delivered_at IS NULL AND m.sender_uid != ?1 AND ${MINE} ORDER BY m.created_at LIMIT 90`).bind(c.me).all();
    const results = all.results.filter((r) => !hid.has(r.sender_uid));
    if (results.length) {
      await c.db.prepare(`UPDATE messages SET delivered_at = ? WHERE delivered_at IS NULL AND id IN (${results.map(() => '?').join(',')})`).bind(c.now, ...results.map((r) => r.id)).run();
      await Promise.all([...new Set(results.map((r) => r.sender_uid))].map((s) => c.toUser(s, { type: 'receipt', thread: 'm:' + c.me, status: 'delivered', upTo: c.now })));
    }
    return c.json({ messages: results.map((x) => ({ id: x.id, thread: 'm:' + peerOfThread(x.thread, c.me), mine: false, text: x.body || '', img: x.img || null, at: x.created_at })) });
  });
  // My conversations, newest first: [{ uid, name, photo, last, lastMine, lastAt, unread }]
  app.get('/api/chat/list', async (c) => {
    const hid = await hiddenOf(c);
    const th = await c.db.prepare(`SELECT m.thread, MAX(m.created_at) last_at FROM messages m WHERE ${MINE} GROUP BY m.thread ORDER BY last_at DESC LIMIT 90`).bind(c.me).all();
    const rows = th.results.map((r) => ({ thread: r.thread, peer: peerOfThread(r.thread, c.me) })).filter((r) => !hid.has(r.peer));
    if (!rows.length) return c.json({ chats: [] });
    const q = rows.map(() => '?').join(',');
    const last = await c.db.prepare(`SELECT m.thread, m.body, m.img, m.sender_uid, m.created_at FROM messages m WHERE m.thread IN (${q}) AND m.created_at = (SELECT MAX(x.created_at) FROM messages x WHERE x.thread = m.thread)`).bind(...rows.map((r) => r.thread)).all();
    const lastBy = new Map(last.results.map((r) => [r.thread, r]));
    const un = await c.db.prepare(`SELECT m.thread, COUNT(*) n FROM messages m LEFT JOIN chat_reads r ON r.uid = ?1 AND r.thread = m.thread
      WHERE m.sender_uid != ?1 AND m.created_at > COALESCE(r.read_at, 0) AND ${MINE} GROUP BY m.thread`).bind(c.me).all();
    const unBy = new Map(un.results.map((r) => [r.thread, r.n]));
    const seen = await c.db.prepare(`SELECT uid, last_seen FROM users WHERE uid IN (${q})`).bind(...rows.map((r) => r.peer)).all();
    const seenBy = new Map(seen.results.map((r) => [r.uid, r.last_seen]));
    const chats = await Promise.all(rows.map(async (r) => {
      const p = await profileOf(c, r.peer), l = lastBy.get(r.thread);
      return { uid: r.peer, name: p.name, photo: p.photo || null, online: c.now - (seenBy.get(r.peer) || 0) < 60_000,
        last: l ? (l.img && !l.body ? '[รูปภาพ]' : l.body) : null, lastMine: l ? l.sender_uid === c.me : false, lastAt: l ? l.created_at : null, unread: unBy.get(r.thread) || 0 };
    }));
    return c.json({ chats });
  });
  app.post('/api/chat/:thread/read', async (c) => { await markRead(c, await thread(c, c.params.thread)); return c.json({ ok: true }); });
  app.post('/api/chat/:thread/ack', async (c) => {
    const t = await thread(c, c.params.thread);
    const r = await c.db.prepare('UPDATE messages SET delivered_at = ? WHERE id = ? AND thread = ? AND sender_uid != ? AND delivered_at IS NULL').bind(c.now, String((await c.body()).id || ''), t.id, c.me).run();
    if (r.meta && r.meta.changes) await c.toUser(t.peer, { type: 'receipt', thread: 'm:' + c.me, status: 'delivered', upTo: c.now });
    return c.json({ ok: true });
  });
  app.get('/api/chat/:thread/messages', async (c) => {
    const t = await thread(c, c.params.thread);
    const after = Number(c.url.searchParams.get('after')) || 0;
    const { results } = after
      ? await c.db.prepare('SELECT * FROM messages WHERE thread = ? AND created_at >= ? ORDER BY created_at LIMIT 200').bind(t.id, after).all()
      : await c.db.prepare('SELECT * FROM (SELECT * FROM messages WHERE thread = ? ORDER BY created_at DESC LIMIT 100) ORDER BY created_at').bind(t.id).all();
    if (c.url.searchParams.get('read') !== '0') await markRead(c, t);
    return c.json({ messages: results.map((x) => view(x, c.me)) });
  });
  app.post('/api/chat/:thread/messages', async (c) => {
    const t = await thread(c, c.params.thread);
    const b = await c.body(), text = str(b.text, 1000), img = b.img ? String(b.img) : null;
    if (img && !/^\/api\/images\/[a-f0-9-]{36}$/.test(img)) throw new HttpError(400, 'invalid image');
    if (!text && !img) throw new HttpError(400, 'text required');
    await c.rate('SELECT COUNT(*) n FROM messages WHERE sender_uid = ? AND created_at > ?', 60_000, opts.perMinute || 40);
    const row = { id: crypto.randomUUID(), sender_uid: c.me, body: text, img, created_at: c.now };
    await c.db.prepare('INSERT INTO messages (id, thread, sender_uid, body, img, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(row.id, t.id, c.me, text, img, c.now).run();
    await markRead(c, t);
    const me = await profileOf(c, c.me);
    const ev = (viewer, key) => ({ type: 'msg', thread: key, fromName: me.name, fromPhoto: me.photo || null, message: view(row, viewer) });
    // realtime to the other person; Web Push if their app is closed; then my own other devices
    await c.notify(t.peer, ev(t.peer, 'm:' + c.me), { title: me.name || 'ข้อความใหม่', body: img && !text ? 'ส่งรูปภาพ' : text.slice(0, 120), url: (opts.chatUrl || '/chat') + '?with=m_' + c.me, tag: 'm:' + c.me, icon: me.photo || null });
    await c.toUser(c.me, ev(c.me, 'm:' + t.peer));
    if (opts.onMessage) await opts.onMessage(c, { thread: t.id, peer: t.peer, message: row });
    return c.json({ message: view(row, c.me) });
  });
};
