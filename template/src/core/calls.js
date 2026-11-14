// kasion framework — voice / video calls over Agora. The Worker only does signalling (ringing, answer, end) and tokens.
// Options: canCall(c, peerUid) throw HttpError to refuse (default: any existing user) · profileOf(c, uid) → { name, photo }
// Needs var AGORA_APP_ID and secret AGORA_APP_CERTIFICATE.
import { HttpError } from './http.js';
import { agoraRtcToken } from './agora.js';
const RING_MS = 45_000;

export const calls = (opts = {}) => (app) => {
  const profileOf = opts.profileOf || (async (c, uid) => { const u = await c.db.prepare('SELECT name, photo FROM users WHERE uid = ?').bind(uid).first(); return u || { name: 'ผู้ใช้', photo: null }; });
  const peer = async (c, uid) => { const p = await profileOf(c, uid); return { uid, name: p.name, photo: p.photo || null }; };
  const get = async (c) => {
    const call = await c.db.prepare('SELECT * FROM calls WHERE id = ?').bind(c.params.id).first();
    if (!call || (call.caller !== c.me && call.callee !== c.me)) throw new HttpError(404, 'call not found');
    return call;
  };
  const out = async (c, call) => ({ id: call.id, channel: call.channel, status: call.status, video: !!call.video, caller: call.caller, callee: call.callee, peer: await peer(c, call.caller === c.me ? call.callee : call.caller) });

  app.post('/api/calls', async (c) => {
    const { to, video } = await c.body();
    if (!to || typeof to !== 'string' || to === c.me) throw new HttpError(400, 'to required');
    if (opts.canCall) await opts.canCall(c, to);
    else if (!(await c.db.prepare('SELECT 1 FROM users WHERE uid = ? AND blocked = 0').bind(to).first())) throw new HttpError(404, 'ไม่พบผู้ใช้นี้');
    await c.rate('SELECT COUNT(*) n FROM calls WHERE caller = ? AND created_at > ?', 60_000, 6);
    const id = crypto.randomUUID(), channel = 'kg-' + id.slice(0, 12);
    await c.db.prepare("INSERT INTO calls (id, caller, callee, channel, status, video, created_at, updated_at) VALUES (?, ?, ?, ?, 'ringing', ?, ?, ?)").bind(id, c.me, to, channel, video ? 1 : 0, c.now, c.now).run();
    const me = await peer(c, c.me);
    // wake the callee: realtime if the app is open, Web Push if it is closed
    await c.notify(to, { type: 'call', id }, { title: me.name || 'สายเรียกเข้า', body: video ? 'วิดีโอคอลเข้า' : 'สายเรียกเข้า', url: '/', tag: 'call' });
    return c.json({ call: { id, channel, status: 'ringing', video: !!video, peer: await peer(c, to) } });
  });
  // Polled by every open page (also keeps users.last_seen fresh = presence).
  app.get('/api/calls/incoming', async (c) => {
    await c.db.batch([
      c.db.prepare("UPDATE calls SET status = 'missed', updated_at = ?1 WHERE status = 'ringing' AND created_at < ?2").bind(c.now, c.now - RING_MS),
      c.db.prepare('UPDATE users SET last_seen = ? WHERE uid = ?').bind(c.now, c.me),
    ]);
    const call = await c.db.prepare("SELECT * FROM calls WHERE callee = ? AND status = 'ringing' AND created_at >= ? ORDER BY created_at DESC LIMIT 1").bind(c.me, c.now - RING_MS).first();
    if (!call) return c.json({ call: null });
    return c.json({ call: { id: call.id, channel: call.channel, status: call.status, video: !!call.video, from: await peer(c, call.caller) } });
  });
  app.get('/api/calls/:id', async (c) => {
    const call = await get(c);
    if (call.status === 'ringing' && c.now - call.created_at > RING_MS) { await c.db.prepare("UPDATE calls SET status = 'missed', updated_at = ? WHERE id = ? AND status = 'ringing'").bind(c.now, call.id).run(); call.status = 'missed'; }
    return c.json({ call: await out(c, call) });
  });
  const act = (action) => async (c) => {
    const call = await get(c);
    let next = call.status;
    if (action === 'answer') {
      if (call.callee !== c.me) throw new HttpError(403, 'only callee can answer');
      if (call.status !== 'ringing') throw new HttpError(409, 'call is ' + call.status);
      next = 'answered';
    } else if (action === 'decline') { if (call.status === 'ringing') next = 'declined'; }
    else if (call.status === 'ringing' || call.status === 'answered') next = 'ended';
    if (next !== call.status) { await c.db.prepare('UPDATE calls SET status = ?, updated_at = ? WHERE id = ?').bind(next, c.now, call.id).run(); call.status = next; }
    return c.json({ call: await out(c, call) });
  };
  app.post('/api/calls/:id/answer', act('answer'));
  app.post('/api/calls/:id/decline', act('decline'));
  app.post('/api/calls/:id/end', act('end'));
  app.get('/api/agora-token', async (c) => {
    const channel = c.url.searchParams.get('channel');
    if (!channel) throw new HttpError(400, 'channel required');
    if (!c.env.AGORA_APP_CERTIFICATE || !c.env.AGORA_APP_ID) return c.json({ token: null, channel });
    const row = await c.db.prepare('SELECT caller, callee FROM calls WHERE channel = ? ORDER BY created_at DESC LIMIT 1').bind(channel).first();
    if (!row || (row.caller !== c.me && row.callee !== c.me)) throw new HttpError(403, 'not a participant');
    return c.json({ token: await agoraRtcToken(c.env.AGORA_APP_ID, c.env.AGORA_APP_CERTIFICATE, channel, '', 3600), channel });
  });
};
