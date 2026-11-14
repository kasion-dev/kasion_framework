// kasion feature: invites — every member gets a personal link (/?ref=CODE). kasion.js remembers ?ref= and sends it with
// the first POST /api/me; that request records who invited the new member. /api/me then returns { invite, invited }.
import { str } from '../core/http.js';

export const invites = () => (app) => {
  app.onMe(async (c, user) => {
    let row = await c.db.prepare('SELECT invite, invited_by, created_at FROM users WHERE uid = ?').bind(c.me).first();
    if (!row.invite) {
      const code = [...crypto.getRandomValues(new Uint8Array(7))].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
      const ref = str((await c.body()).ref, 16).toLowerCase();
      // only a brand-new account (first 10 minutes) can be credited to an inviter
      const by = ref && c.now - row.created_at < 600_000 ? await c.db.prepare('SELECT uid FROM users WHERE invite = ? AND uid != ?').bind(ref, c.me).first() : null;
      await c.db.prepare('UPDATE users SET invite = ?, invited_by = COALESCE(invited_by, ?) WHERE uid = ? AND invite IS NULL').bind(code, by ? by.uid : null, c.me).run();
      row = await c.db.prepare('SELECT invite FROM users WHERE uid = ?').bind(c.me).first();
    }
    const n = await c.db.prepare('SELECT COUNT(*) n FROM users WHERE invited_by = ?').bind(c.me).first();
    return { invite: row.invite, invited: (n && n.n) || 0 };
  });
};
