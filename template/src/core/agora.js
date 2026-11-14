// kasion framework — Agora RTC tokens for voice / video calls. Needs secret AGORA_APP_CERTIFICATE and var AGORA_APP_ID.
const enc = new TextEncoder();
function bytesCat(parts) { const n = parts.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; }
const u16 = v => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; };
const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; };
const pStr = s => { const b = typeof s === 'string' ? enc.encode(s) : s; return bytesCat([u16(b.length), b]); };
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof msg === 'string' ? enc.encode(msg) : msg));
}
async function deflate(data) {
  const cs = new CompressionStream('deflate');
  const out = new Response(new Blob([data]).stream().pipeThrough(cs));
  return new Uint8Array(await out.arrayBuffer());
}
export async function agoraRtcToken(appId, appCert, channel, uid, expireSecs) {
  const issueTs = Math.floor(Date.now() / 1000);
  const salt = 1 + Math.floor(Math.random() * 99999998);
  // Service RTC (type 1): privileges joinChannel(1), publishAudio(2), publishVideo(3), publishData(4) — values are relative seconds.
  const privs = [1, 2, 3, 4];
  const service = bytesCat([u16(1), u16(privs.length), ...privs.flatMap(p => [u16(p), u32(expireSecs)]), pStr(channel), pStr(uid)]);
  const signingInfo = bytesCat([pStr(appId), u32(issueTs), u32(expireSecs), u32(salt), u16(1), service]);
  let signing = await hmac(u32(issueTs), appCert);
  signing = await hmac(u32(salt), signing);
  const signature = await hmac(signing, signingInfo);
  const content = bytesCat([pStr(signature), signingInfo]);
  const z = await deflate(content);
  let bin = ''; z.forEach(c => { bin += String.fromCharCode(c); });
  return '007' + btoa(bin);
}
