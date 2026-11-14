// End-to-end smoke test of the framework itself: create an app from template/ in a temp folder, run it locally with
// TEST_AUTH, and exercise every core route. Run after changing template/src/core or kasion.js:  npm test   (Node 22+)
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn, spawnSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kasion-smoke-'));
const PORT = 8790 + Math.floor(Math.random() * 100), B = 'http://localhost:' + PORT;
let failed = 0, passed = 0, dev = null;
const ok = (name, cond, extra) => { if (cond) { passed++; } else { failed++; console.log('✗ ' + name + (extra ? ' → ' + JSON.stringify(extra).slice(0, 200) : '')); } };
const call = async (method, user, p, body, headers = {}) => {
  const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', ...(user ? { authorization: 'Bearer test:' + user } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data: data || {} };
};
const done = (code) => { try { dev && dev.kill('SIGTERM'); } catch {} fs.rmSync(tmp, { recursive: true, force: true }); process.exit(code); };
process.on('SIGINT', () => done(1));
try {
  const c = spawnSync(process.execPath, [path.join(root, 'bin', 'create.mjs'), 'kasion_smoke', '--dir', tmp, '--admin', 'alice@test.local', '--no-git'], { encoding: 'utf8' });
  if (c.status !== 0) throw new Error('create failed: ' + c.stderr);
  const app = path.join(tmp, 'kasion_smoke');
  const cfg = path.join(app, 'wrangler.jsonc');
  fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace('REPLACE_AFTER_D1_CREATE', '00000000-0000-0000-0000-000000000000'));
  const chk = spawnSync(process.execPath, ['scripts/check.mjs'], { cwd: app, encoding: 'utf8' });
  ok('scripts/check.mjs passes', chk.status === 0, chk.stdout);
  const left = spawnSync('grep', ['-rnE', '__[A-Z_]+__', '.', '--exclude-dir=.wrangler'], { cwd: app, encoding: 'utf8' }).stdout.trim();
  ok('no template placeholders left', !left, left.split('\n').slice(0, 3));
  const mig = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'kasion_smoke', '--local'], { cwd: app, encoding: 'utf8', env: { ...process.env, CI: '1' } });
  if (mig.status !== 0) throw new Error('migrations failed: ' + (mig.stderr || mig.stdout).split('\n').slice(-6).join('\n'));
  dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT)], { cwd: app, stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { await new Promise((r) => setTimeout(r, 1000)); try { up = (await fetch(B + '/icon.svg')).ok; } catch {} }
  if (!up) throw new Error('dev server did not start');

  let r;
  ok('no token → 401', (await call('GET', null, '/api/notes')).status === 401);
  ok('unknown user → 401 until /api/me', (await call('GET', 'zed', '/api/notes')).status === 401);
  r = await call('POST', 'alice:Alice', '/api/me', {}); ok('POST /api/me (admin)', r.status === 200 && r.data.admin === true && r.data.user.uid === 'alice', r);
  r = await call('POST', 'bob:Bob', '/api/me', {}); ok('POST /api/me (not admin)', r.data.admin === false, r);
  ok('test sign-in refused when the request has cf-ray', (await call('GET', 'alice', '/api/notes', null, { 'cf-ray': 'x' })).status === 401);
  r = await call('POST', 'alice', '/api/notes', { text: 'hello' }); ok('create note', r.status === 200 && r.data.note.mine, r); const nid = r.data.note && r.data.note.id;
  ok('empty note → 400', (await call('POST', 'alice', '/api/notes', { text: ' ' })).status === 400);
  r = await call('GET', 'bob', '/api/notes'); ok('list notes', r.data.notes.length === 1 && r.data.notes[0].mine === false && r.data.notes[0].author.name === 'Alice', r);
  ok('delete someone else’s note → 404', (await call('DELETE', 'bob', '/api/notes/' + nid)).status === 404);
  ok('delete own note', (await call('DELETE', 'alice', '/api/notes/' + nid)).status === 200);
  ok('404 route', (await call('GET', 'alice', '/api/nope')).status === 404);
  ok('405 method', (await call('PUT', 'alice', '/api/notes')).status === 405);
  ok('admin route refused', (await call('GET', 'bob', '/api/admin/stats')).status === 403);
  r = await call('GET', 'alice', '/api/admin/stats'); ok('admin route allowed', r.status === 200 && r.data.users === 2, r);
  r = await call('POST', 'alice', '/api/chat/' + encodeURIComponent('m:bob') + '/messages', { text: 'hi' }); ok('send message', r.status === 200 && r.data.message.status === 'sent', r);
  r = await call('GET', 'bob', '/api/chat/unread'); ok('unread count', r.data.total === 1 && r.data.threads['m:alice'] === 1, r);
  r = await call('GET', 'bob', '/api/chat/pending'); ok('pending delivers', r.data.messages.length === 1, r);
  r = await call('GET', 'alice', '/api/chat/' + encodeURIComponent('m:bob') + '/messages?read=0'); ok('status delivered', r.data.messages[0].status === 'delivered', r);
  await call('GET', 'bob', '/api/chat/' + encodeURIComponent('m:alice') + '/messages');
  r = await call('GET', 'alice', '/api/chat/' + encodeURIComponent('m:bob') + '/messages?read=0'); ok('status read', r.data.messages[0].status === 'read', r);
  r = await call('GET', 'bob', '/api/chat/list'); ok('chat list', r.data.chats.length === 1 && r.data.chats[0].uid === 'alice' && r.data.chats[0].unread === 0, r);
  ok('message to unknown user → 404', (await call('POST', 'alice', '/api/chat/' + encodeURIComponent('m:ghost') + '/messages', { text: 'x' })).status === 404);
  ok('external image refused', (await call('POST', 'alice', '/api/chat/' + encodeURIComponent('m:bob') + '/messages', { img: 'https://x.y/z.png' })).status === 400);
  r = await call('POST', 'alice', '/api/calls', { to: 'bob', video: true }); ok('start call', r.status === 200 && r.data.call.video === true, r); const cid = r.data.call && r.data.call.id;
  r = await call('GET', 'bob', '/api/calls/incoming'); ok('incoming call', r.data.call && r.data.call.id === cid, r);
  r = await call('POST', 'bob', '/api/calls/' + cid + '/answer'); ok('answer call', r.data.call.status === 'answered', r);
  r = await call('POST', 'alice', '/api/calls/' + cid + '/end'); ok('end call', r.data.call.status === 'ended', r);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  r = await call('POST', 'alice', '/api/images', { dataUrl: png, folder: 'uploads' }); ok('upload image', r.status === 200 && /^\/api\/images\//.test(r.data.url), r);
  ok('serve image (public)', (await fetch(B + r.data.url)).headers.get('content-type') === 'image/png');
  ok('bad image folder → 400', (await call('POST', 'alice', '/api/images', { dataUrl: png, folder: '../x' })).status === 400);
  ok('push key (public)', (await call('GET', null, '/api/public/push-key')).status === 200);
  ok('bad push subscription → 400', (await call('POST', 'alice', '/api/push/subscribe', { endpoint: 'x' })).status === 400);
  // real WebSocket handshakes (Node 22+ has a global WebSocket)
  const ws = (p) => new Promise((res) => {
    let sock; const t = setTimeout(() => { try { sock.close(); } catch {} res(false); }, 5000);
    try { sock = new WebSocket('ws://localhost:' + PORT + p + '?token=test:alice'); } catch { clearTimeout(t); return res(false); }
    sock.onopen = () => { clearTimeout(t); sock.close(); res(true); };
    sock.onerror = () => { clearTimeout(t); res(false); };
  });
  ok('personal socket connects', await ws('/api/ws'));
  ok('allowed channel connects', await ws('/api/live/notes/ws'));
  ok('unknown channel is refused', !(await ws('/api/live/secret/ws')));
  for (const p of ['/', '/login', '/chat', '/settings', '/call', '/_blank', '/kasion.js', '/app.config.js', '/sw.js', '/manifest.webmanifest']) ok('GET ' + p, (await fetch(B + p)).status === 200);
  console.log(failed ? `✗ ${failed} failed, ${passed} passed` : `✓ ${passed} checks passed`);
  done(failed ? 1 : 0);
} catch (e) { console.error('✗ smoke test aborted: ' + e.message); done(1); }
