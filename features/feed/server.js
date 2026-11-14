// kasion feature: feed — a public board: posts (text + photo), likes, replies, realtime updates on channel 'feed'.
// Options: publicRead: true  also serve GET /api/public/feed to signed-out visitors (default true)
//          canPost(c)        throw HttpError to refuse posting / replying (e.g. unfinished profile)
import { HttpError, str } from '../core/http.js';

export const feed = (opts = {}) => (app) => {
  app.allowChannel((c, name) => name === 'feed');
  const author = async (c, uid, seen) => { const p = await c.profileOf(uid); return { uid, name: p.name, photo: p.photo || null, online: seen != null ? c.now - seen < 60_000 : false }; };
  const view = async (c, r, me) => ({ id: r.id, text: r.body, img: r.img || null, at: r.created_at, likes: r.like_n, replies: r.reply_n, liked: !!r.liked, mine: r.uid === me, author: await author(c, r.uid, r.last_seen) });
  const visible = async (c, rows) => { const hid = new Set(await c.hidden()); return rows.filter((r) => !hid.has(r.uid)); };
  const allowed = async (c) => { if (opts.canPost) await opts.canPost(c); };
  const postOf = async (c, id) => { const p = await c.db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first(); if (!p) throw new HttpError(404, 'ไม่พบโพสต์นี้'); if ((await c.hidden()).includes(p.uid)) throw new HttpError(403, 'ทำรายการกับโพสต์นี้ไม่ได้'); return p; };

  app.get('/api/feed', async (c) => {
    const before = Number(c.url.searchParams.get('before')) || c.now + 1;
    const { results } = await c.db.prepare(`SELECT po.*, u.last_seen, (SELECT 1 FROM post_likes l WHERE l.post_id = po.id AND l.uid = ?1) liked
      FROM posts po JOIN users u ON u.uid = po.uid WHERE po.created_at < ?2 AND u.blocked = 0 ORDER BY po.created_at DESC LIMIT 40`).bind(c.me, before).all();
    const rows = (await visible(c, results)).slice(0, 30);
    return c.json({ posts: await Promise.all(rows.map((r) => view(c, r, c.me))), more: results.length >= 40 });
  });
  if (opts.publicRead !== false) app.get('/api/public/feed', async (c) => {
    const { results } = await c.db.prepare('SELECT po.*, u.name, u.photo FROM posts po JOIN users u ON u.uid = po.uid WHERE u.blocked = 0 ORDER BY po.created_at DESC LIMIT 20').all();
    const prof = app.service('profileOf');
    return c.json({ posts: await Promise.all(results.map(async (r) => { const p = (prof && (await prof(c, r.uid))) || { name: r.name, photo: r.photo }; return { id: r.id, text: r.body, img: r.img || null, at: r.created_at, likes: r.like_n, replies: r.reply_n, author: { name: p.name || 'สมาชิก', photo: p.photo || null } }; })) }, 200, { 'cache-control': 'public, max-age=20' });
  }, { public: true });
  app.post('/api/feed', async (c) => {
    await allowed(c);
    const b = await c.body(), text = str(b.text, 500), img = b.img ? String(b.img) : null;
    if (img && !/^\/api\/images\/[a-f0-9-]{36}$/.test(img)) throw new HttpError(400, 'invalid image');
    if (!text && !img) throw new HttpError(400, 'พิมพ์ข้อความก่อนโพสต์');
    await c.rate('SELECT COUNT(*) n FROM posts WHERE uid = ? AND created_at > ?', 60_000, 4);
    const row = { id: crypto.randomUUID(), uid: c.me, body: text, img, like_n: 0, reply_n: 0, created_at: c.now, last_seen: c.now };
    await c.db.prepare('INSERT INTO posts (id, uid, body, img, created_at) VALUES (?, ?, ?, ?, ?)').bind(row.id, c.me, text, img, c.now).run();
    await c.toChannel('feed', { type: 'post', post: await view(c, row, null), by: c.me }, await c.hidden());
    return c.json({ post: await view(c, row, c.me) });
  });
  app.delete('/api/feed/:id', async (c) => {
    const r = await c.db.prepare('DELETE FROM posts WHERE id = ? AND uid = ?').bind(c.params.id, c.me).run();
    if (!r.meta.changes) throw new HttpError(404, 'ไม่พบโพสต์นี้');
    await remove(c, c.params.id, true);
    return c.json({ ok: true });
  });
  const remove = async (c, id, already) => {
    await c.db.batch([...(already ? [] : [c.db.prepare('DELETE FROM posts WHERE id = ?').bind(id)]), c.db.prepare('DELETE FROM post_likes WHERE post_id = ?').bind(id), c.db.prepare('DELETE FROM post_replies WHERE post_id = ?').bind(id)]);
    await c.toChannel('feed', { type: 'post_deleted', id });
  };
  app.post('/api/feed/:id/like', async (c) => {
    const id = c.params.id; await postOf(c, id);
    const had = await c.db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND uid = ?').bind(id, c.me).first();
    await c.db.batch([   // recount: two quick taps cannot drift the number
      had ? c.db.prepare('DELETE FROM post_likes WHERE post_id = ? AND uid = ?').bind(id, c.me) : c.db.prepare('INSERT OR IGNORE INTO post_likes (post_id, uid, created_at) VALUES (?, ?, ?)').bind(id, c.me, c.now),
      c.db.prepare('UPDATE posts SET like_n = (SELECT COUNT(*) FROM post_likes WHERE post_id = ?1) WHERE id = ?1').bind(id),
    ]);
    const po = await c.db.prepare('SELECT like_n FROM posts WHERE id = ?').bind(id).first();
    await c.toChannel('feed', { type: 'post_like', id, likes: po.like_n });
    return c.json({ liked: !had, likes: po.like_n });
  });
  const replyView = async (c, r, me) => ({ id: r.id, text: r.body, at: r.created_at, mine: r.uid === me, author: await author(c, r.uid, null) });
  app.get('/api/feed/:id/replies', async (c) => {
    const { results } = await c.db.prepare('SELECT r.* FROM post_replies r JOIN users u ON u.uid = r.uid WHERE r.post_id = ? AND u.blocked = 0 ORDER BY r.created_at LIMIT 100').bind(c.params.id).all();
    return c.json({ replies: await Promise.all((await visible(c, results)).map((r) => replyView(c, r, c.me))) });
  });
  app.post('/api/feed/:id/replies', async (c) => {
    await allowed(c);
    const id = c.params.id, text = str((await c.body()).text, 300);
    if (!text) throw new HttpError(400, 'พิมพ์ข้อความก่อน');
    await postOf(c, id);
    await c.rate('SELECT COUNT(*) n FROM post_replies WHERE uid = ? AND created_at > ?', 60_000, 10);
    const row = { id: crypto.randomUUID(), uid: c.me, body: text, created_at: c.now };
    await c.db.batch([
      c.db.prepare('INSERT INTO post_replies (id, post_id, uid, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(row.id, id, c.me, text, c.now),
      c.db.prepare('UPDATE posts SET reply_n = (SELECT COUNT(*) FROM post_replies WHERE post_id = ?1) WHERE id = ?1').bind(id),
    ]);
    const po = await c.db.prepare('SELECT reply_n FROM posts WHERE id = ?').bind(id).first();
    await c.toChannel('feed', { type: 'post_reply', id, replies: po.reply_n, reply: await replyView(c, row, null), by: c.me }, await c.hidden());
    return c.json({ reply: await replyView(c, row, c.me), replies: po.reply_n });
  });
  // shows up in the admin "content" tab
  app.adminContent({ kind: 'post', label: 'โพสต์',
    list: async (c) => (await c.db.prepare('SELECT po.id, po.uid, po.body text, po.img, po.created_at at, u.name FROM posts po LEFT JOIN users u ON u.uid = po.uid ORDER BY po.created_at DESC LIMIT 60').all()).results,
    remove: (c, id) => remove(c, id, false) });
};
