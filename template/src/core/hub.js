// kasion framework — realtime. One Durable Object class (`Hub`) used two ways:
//   • per user:   idFromName(uid)            → that user's open tabs/devices (direct messages, receipts, alerts)
//   • per channel: idFromName('ch:' + name)  → everyone watching a shared feed/room (with a live member count)
// WebSocket hibernation keeps idle sockets free. Bind it as HUB in wrangler.jsonc.
export class Hub {
  constructor(state) {
    this.state = state;
    try { state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch {}
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const [client, server] = Object.values(new WebSocketPair());
      const counted = url.searchParams.get('count') === '1', uid = (url.searchParams.get('uid') || '').slice(0, 200);
      this.state.acceptWebSocket(server, counted ? ['counted'].concat(uid ? ['u:' + uid] : []) : []);
      if (counted) this.count();
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/count') return new Response(String(this.state.getWebSockets().length));
    if (url.pathname === '/push' && req.method === 'POST') {
      const msg = await req.text();
      // x-skip: uids that must not receive this event (people who blocked, or are blocked by, the author)
      const skip = new Set((req.headers.get('x-skip') || '').split(',').filter(Boolean));
      let n = 0;
      for (const ws of this.state.getWebSockets()) {
        if (skip.size && this.state.getTags(ws).some((t) => t.startsWith('u:') && skip.has(t.slice(2)))) continue;
        try { ws.send(msg); n++; } catch {}
      }
      return new Response(String(n));
    }
    return new Response('not found', { status: 404 });
  }
  webSocketMessage() {}
  // Shared channels tell everyone how many people are in the room.
  count(closing) {
    const all = this.state.getWebSockets('counted').filter((w) => w !== closing);
    const msg = JSON.stringify({ type: 'count', n: all.length });
    for (const ws of all) { try { ws.send(msg); } catch {} }
  }
  webSocketClose(ws, code) { try { ws.close(code, 'closed'); } catch {} this.count(ws); }
  webSocketError(ws) { try { ws.close(1011, 'error'); } catch {} this.count(ws); }
}
export async function hubPush(env, uid, payload, skip) {
  if (!env.HUB || !uid) return 0;
  try { const r = await env.HUB.get(env.HUB.idFromName(uid)).fetch('https://hub/push', { method: 'POST', body: JSON.stringify(payload), headers: skip && skip.length ? { 'x-skip': skip.slice(0, 200).join(',') } : {} }); return Number(await r.text()) || 0; } catch (e) { console.error('hubPush', e); return 0; }
}
// How many sockets are connected to a hub (members in a channel).
export async function hubCount(env, name) {
  try { return Number(await (await env.HUB.get(env.HUB.idFromName(name)).fetch('https://hub/count')).text()) || 0; } catch { return 0; }
}
