// kasion framework — client for pay.kasion.dev (kasion-payment): PromptPay charges with slip checking.
// Needs secret PAY_API_KEY and a merchant registered in kasion-payment for your appId.
// These are plain functions: call them from your own routes and keep your own ledger table
// (see kasion_delivery: credit_charges + wallets for a full top-up flow).
import { HttpError } from './http.js';
const PAY_BASE = 'https://pay.kasion.dev';
const call = async (env, path, body) => {
  if (!env.PAY_API_KEY) throw new HttpError(503, 'ระบบชำระเงินยังไม่เปิด (ยังไม่ได้ตั้ง PAY_API_KEY)');
  const r = await fetch(PAY_BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.PAY_API_KEY }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: d.data || null, error: d.error || null, raw: d };
};
// Create a PromptPay charge. amount in baht. Returns { id, qrPayload, note, promptpayId }.
export async function createCharge(env, { appId, orderRef, userRef, amount, metadata }) {
  const r = await call(env, '/v1/charge', { orderRef, userRef, amount, method: 'promptpay', appId, metadata: metadata || {} });
  const c = r.data;
  if (!r.ok || !c || !c.instructions || !c.instructions.qrPayload) throw new HttpError(502, 'สร้าง QR ไม่สำเร็จ: ' + (r.error || r.status));
  return { id: c.id, qrPayload: c.instructions.qrPayload, note: c.instructions.note || null, promptpayId: c.instructions.promptpayId || null };
}
// Current status of a charge: { status: 'pending' | 'paid' | …, amount }. Always compare amount with your own record before crediting.
export async function getCharge(env, id) {
  const r = await fetch(PAY_BASE + '/v1/charge/' + encodeURIComponent(id));
  const d = await r.json().catch(() => ({}));
  return d.data || null;
}
// Send slip data read in the browser ({ qr, ocr, ocrConfidence, imageHash }) for verification. Returns the service's verdict (status, flags).
export async function inspectSlip(env, id, slip) {
  return (await call(env, '/v1/charge/' + encodeURIComponent(id) + '/inspect-slip', slip)).raw;
}
// Admin override: mark a charge paid by hand.
export async function markPaid(env, id, txnId) {
  return (await call(env, '/v1/charge/' + encodeURIComponent(id) + '/mark-paid', { txnId })).raw;
}
