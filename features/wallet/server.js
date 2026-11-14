// kasion feature: wallet — an in-app credit balance with a ledger, topped up by PromptPay through pay.kasion.dev.
// Money is integer satang. Every change goes through credit() / spend() so the ledger always explains the balance.
//   import { spend, credit } from './features/wallet.js'
//   await spend(c, 4900, 'ค่าบริการ');        // throws 402 when the balance is too low (atomic)
// Options: appId (pay.kasion.dev merchant app id, required for top-ups), min / max top-up in baht (20 / 20000)
// Needs secret PAY_API_KEY.
import { HttpError, str } from '../core/http.js';
import { createCharge, getCharge, inspectSlip } from '../core/pay.js';

const baht = (s) => Math.round(s) / 100;
const ensure = (c, uid) => c.db.prepare('INSERT OR IGNORE INTO wallets (uid, balance, updated_at) VALUES (?, 0, ?)').bind(uid, c.now).run();
// Add money. `ref` makes it idempotent: the same ref is credited once.
export async function credit(c, uid, satang, title, kind = 'credit', ref = null) {
  if (!Number.isInteger(satang) || satang <= 0) throw new HttpError(400, 'invalid amount');
  await ensure(c, uid);
  const id = crypto.randomUUID();
  const [ins] = await c.db.batch([
    c.db.prepare('INSERT OR IGNORE INTO ledger (id, uid, kind, title, amount, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, uid, kind, str(title, 120), satang, ref, c.now),
    c.db.prepare('UPDATE wallets SET balance = balance + ?1, updated_at = ?2 WHERE uid = ?3 AND changes() > 0').bind(satang, c.now, uid),
  ]);
  return !!(ins.meta && ins.meta.changes);
}
// Take money, only if the balance covers it. Deduction and ledger row happen together.
export async function spend(c, satang, title, kind = 'spend', ref = null) {
  if (!Number.isInteger(satang) || satang <= 0) throw new HttpError(400, 'invalid amount');
  await ensure(c, c.me);
  const [upd] = await c.db.batch([
    c.db.prepare('UPDATE wallets SET balance = balance - ?1, updated_at = ?2 WHERE uid = ?3 AND balance >= ?1').bind(satang, c.now, c.me),
    c.db.prepare('INSERT INTO ledger (id, uid, kind, title, amount, ref, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0').bind(crypto.randomUUID(), c.me, kind, str(title, 120), -satang, ref, c.now),
  ]);
  if (!upd.meta.changes) throw new HttpError(402, 'ยอดเงินไม่พอ');
  return true;
}

export const wallet = (opts = {}) => (app) => {
  const min = opts.min || 20, max = opts.max || 20000;
  const view = async (c) => {
    await ensure(c, c.me);
    const w = await c.db.prepare('SELECT balance FROM wallets WHERE uid = ?').bind(c.me).first();
    const { results } = await c.db.prepare('SELECT id, kind, title, amount, created_at FROM ledger WHERE uid = ? ORDER BY created_at DESC LIMIT 50').bind(c.me).all();
    return { balance: baht(w.balance), history: results.map((r) => ({ id: r.id, kind: r.kind, title: r.title, amount: baht(r.amount), at: r.created_at })) };
  };
  // Ask pay.kasion.dev; when paid (and the amount matches our record) credit once.
  const settle = async (c, row) => {
    if (row.status === 'paid') return true;
    const d = await getCharge(c.env, row.id);
    if (!d || d.status !== 'paid' || Math.round(Number(d.amount) * 100) !== row.amount) return false;
    const upd = await c.db.prepare("UPDATE charges SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'").bind(c.now, row.id).run();
    if (upd.meta && upd.meta.changes) await credit(c, row.uid, row.amount, 'เติมเครดิต (พร้อมเพย์)', 'topup', 'charge:' + row.id);
    const cur = await c.db.prepare('SELECT status FROM charges WHERE id = ?').bind(row.id).first();
    return !!cur && cur.status === 'paid';
  };
  const chargeOf = async (c) => { const r = await c.db.prepare('SELECT * FROM charges WHERE id = ? AND uid = ?').bind(c.params.id, c.me).first(); if (!r) throw new HttpError(404, 'ไม่พบรายการเติมเงิน'); return r; };

  app.get('/api/wallet', async (c) => c.json(await view(c)));
  app.post('/api/wallet/topup', async (c) => {
    if (!opts.appId) throw new HttpError(503, 'ยังไม่ได้ตั้งค่า appId ของระบบชำระเงิน');
    const amount = Number((await c.body()).amount);
    if (!Number.isFinite(amount) || amount < min || amount > max) throw new HttpError(400, `ยอดเติมต้องอยู่ระหว่าง ${min}–${max} บาท`);
    await c.rate('SELECT COUNT(*) n FROM charges WHERE uid = ? AND created_at > ?', 600_000, 10);
    const satang = Math.round(amount * 100);
    const ch = await createCharge(c.env, { appId: opts.appId, orderRef: 'topup-' + c.now.toString(36), userRef: c.me, amount: satang / 100, metadata: { purpose: 'credit_topup' } });
    await c.db.prepare("INSERT INTO charges (id, uid, amount, status, qr_payload, note, created_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)").bind(ch.id, c.me, satang, ch.qrPayload, ch.note, c.now).run();
    return c.json({ charge: { id: ch.id, amount: satang / 100, qrPayload: ch.qrPayload, note: ch.note, status: 'pending' } });
  });
  app.get('/api/wallet/charge/:id', async (c) => {
    const row = await chargeOf(c), paid = await settle(c, row);
    return c.json({ status: paid ? 'paid' : row.status, wallet: paid ? await view(c) : null });
  });
  // slip data read in the browser by https://pay.kasion.dev/sdk/slip-reader.js
  app.post('/api/wallet/charge/:id/slip', async (c) => {
    const row = await chargeOf(c);
    if (row.status === 'paid') return c.json({ status: 'paid', wallet: await view(c) });
    const b = await c.body();
    const verdict = await inspectSlip(c.env, row.id, { qr: b.qr, ocr: b.ocr, ocrConfidence: b.ocrConfidence, imageHash: b.imageHash });
    const paid = await settle(c, row);
    return c.json({ status: paid ? 'paid' : 'pending', flags: (verdict && (verdict.flags || (verdict.data && verdict.data.flags))) || [], wallet: paid ? await view(c) : null });
  });
  // admin: add credit by hand (kept in the ledger with the admin's uid)
  app.post('/api/admin/wallet/credit', async (c) => {
    const b = await c.body(), amount = Number(b.amount), note = str(b.note, 80);
    if (!b.uid || !Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new HttpError(400, 'uid และยอดเงินไม่ถูกต้อง');
    if (!note) throw new HttpError(400, 'ต้องระบุเหตุผล');
    if (!(await c.db.prepare('SELECT 1 FROM users WHERE uid = ?').bind(String(b.uid)).first())) throw new HttpError(404, 'ไม่พบผู้ใช้นี้');
    await credit(c, String(b.uid), Math.round(amount * 100), 'เติมโดยผู้ดูแล: ' + note, 'admin', 'admin:' + c.me + ':' + c.now);
    return c.json({ ok: true });
  }, { admin: true });
};
