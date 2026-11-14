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
  const left = spawnSync('grep', ['-rnE', '__[A-Z_]+__', '.', '--exclude-dir=.wrangler', '--exclude-dir=vendor'], { cwd: app, encoding: 'utf8' }).stdout.trim();
  ok('no template placeholders left', !left, left.split('\n').slice(0, 3));
  const mig = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'kasion_smoke', '--local'], { cwd: app, encoding: 'utf8', env: { ...process.env, CI: '1' } });
  if (mig.status !== 0) throw new Error('migrations failed: ' + (mig.stderr || mig.stdout).split('\n').slice(-6).join('\n'));
  const start = async () => {
    dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT)], { cwd: app, stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { await new Promise((r) => setTimeout(r, 1000)); try { up = (await fetch(B + '/icon.svg')).ok; } catch {} }
    if (!up) throw new Error('dev server did not start');
  };
  const stop = async () => { try { dev.kill('SIGTERM'); } catch {} for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 500)); try { await fetch(B + '/icon.svg'); } catch { return; } } };
  await start();

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
  for (const p of ['/', '/login', '/chat', '/settings', '/call', '/blank', '/blank_dc', '/kasion.vue.js', '/vendor/vue.js', '/vendor/vant.js', '/vendor/vant.css', '/kasion.js', '/app.config.js', '/sw.js', '/manifest.webmanifest']) ok('GET ' + p, (await fetch(B + p)).status === 200);

  // ---- part 2: install every feature with the CLI into the same app, migrate, and test each one ----
  await stop();
  const kasion = (...a) => spawnSync(process.execPath, [path.join(root, 'bin', 'kasion.mjs'), ...a], { cwd: app, encoding: 'utf8' });
  const names = ['safety', 'profile', 'feed', 'rooms', 'people', 'invites', 'admin', 'wallet', 'maps'];
  const add = kasion('add', ...names); ok('kasion add (all features)', add.status === 0 && names.every((n) => add.stdout.includes('added ' + n)), add.stdout + add.stderr);
  ok('kasion add twice is a no-op', kasion('add', 'feed').stdout.includes('already installed'));
  ok('kasion add unknown → error', kasion('add', 'nope').status === 1);
  ok('kasion list marks installed', /✓ feed/.test(kasion('list').stdout));
  ok('kasion update', kasion('update').status === 0);
  const doc = kasion('doctor'); ok('kasion doctor', doc.status === 0, doc.stdout);
  const chk2 = spawnSync(process.execPath, ['scripts/check.mjs'], { cwd: app, encoding: 'utf8' }); ok('check passes with all features', chk2.status === 0, chk2.stdout);
  const left2 = spawnSync('grep', ['-rnE', '__[A-Z_]+__', '.', '--exclude-dir=.wrangler', '--exclude-dir=vendor'], { cwd: app, encoding: 'utf8' }).stdout.trim(); ok('no placeholders after add', !left2, left2.split('\n').slice(0, 3));
  const mig2 = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'kasion_smoke', '--local'], { cwd: app, encoding: 'utf8', env: { ...process.env, CI: '1' } });
  if (mig2.status !== 0) throw new Error('feature migrations failed: ' + (mig2.stderr || mig2.stdout).split('\n').slice(-6).join('\n'));
  await start();
  // invites + profile (onMe hooks)
  r = await call('POST', 'alice:Alice', '/api/me', {}); ok('me: invite code + profile', r.status === 200 && /^[a-z0-9]{4,16}$/.test(r.data.invite || '') && r.data.profile && r.data.profile.name === 'Alice', r); const code = r.data.invite;
  await call('POST', 'bob:Bob', '/api/me', {});
  r = await call('POST', 'carol:Carol', '/api/me', { ref: code }); ok('new member joins with ref', r.status === 200, r);
  r = await call('POST', 'alice', '/api/me', {}); ok('invited count', r.data.invited === 1, r);
  // profile
  r = await call('PUT', 'bob', '/api/profile', { name: 'Bobby', bio: 'hello', city: 'CDMX' }); ok('update profile', r.status === 200 && r.data.profile.name === 'Bobby', r);
  ok('empty profile name → 400', (await call('PUT', 'bob', '/api/profile', { name: ' ' })).status === 400);
  ok('external profile photo → 400', (await call('PUT', 'bob', '/api/profile', { photos: ['https://x.y/z.png'] })).status === 400);
  r = await call('GET', 'alice', '/api/profiles/bob'); ok('view profile (no email)', r.status === 200 && r.data.profile.name === 'Bobby' && !JSON.stringify(r.data).includes('@'), r);
  ok('unknown profile → 404', (await call('GET', 'alice', '/api/profiles/ghost')).status === 404);
  r = await call('GET', 'alice', '/api/chat/list'); ok('chat uses profile name', r.data.chats[0] && r.data.chats[0].name === 'Bobby', r);
  // feed
  r = await call('POST', 'bob', '/api/feed', { text: 'first post' }); ok('create post', r.status === 200 && r.data.post.text === 'first post', r); const pid = r.data.post && r.data.post.id;
  ok('empty post → 400', (await call('POST', 'bob', '/api/feed', { text: '' })).status === 400);
  r = await call('POST', 'alice', '/api/feed/' + pid + '/like'); ok('like', r.data.liked === true && r.data.likes === 1, r);
  r = await call('POST', 'alice', '/api/feed/' + pid + '/like'); ok('unlike', r.data.liked === false && r.data.likes === 0, r);
  r = await call('POST', 'alice', '/api/feed/' + pid + '/replies', { text: 'nice' }); ok('reply', r.status === 200 && r.data.replies === 1, r);
  r = await call('GET', 'bob', '/api/feed/' + pid + '/replies'); ok('list replies', r.data.replies.length === 1, r);
  r = await call('GET', 'alice', '/api/feed'); ok('list feed', r.data.posts.length === 1 && r.data.posts[0].author && r.data.posts[0].author.name === 'Bobby', r);
  r = await call('GET', null, '/api/public/feed'); ok('public feed (signed out)', r.status === 200 && r.data.posts.length === 1 && !JSON.stringify(r.data).includes('@'), r);
  ok('delete someone else’s post → 404', (await call('DELETE', 'alice', '/api/feed/' + pid)).status === 404);
  ok('feed channel connects', await ws('/api/live/feed/ws'));
  // rooms
  r = await call('GET', 'alice', '/api/rooms'); ok('list rooms', r.data.rooms.length === 3, r); const room = r.data.rooms[0] && r.data.rooms[0].id;
  r = await call('POST', 'bob', '/api/rooms/' + room + '/messages', { text: 'hi room' }); ok('room message', r.status === 200 && r.data.message.text === 'hi room', r);
  r = await call('GET', 'alice', '/api/rooms/' + room + '/messages'); ok('room history', r.data.messages.length === 1 && r.data.room.id === room, r);
  ok('unknown room → 404', (await call('GET', 'alice', '/api/rooms/nope/messages')).status === 404);
  ok('room channel connects', await ws('/api/live/' + encodeURIComponent('room:' + room) + '/ws'));
  ok('unknown room channel refused', !(await ws('/api/live/' + encodeURIComponent('room:nope') + '/ws')));
  // people
  r = await call('GET', 'alice', '/api/people'); ok('people list', [...r.data.online, ...r.data.recent].some((u) => u.uid === 'bob') && r.data.hasLocation === false, r);
  ok('bad location → 400', (await call('POST', 'alice', '/api/location', { lat: 999, lng: 0 })).status === 400);
  await call('POST', 'alice', '/api/location', { lat: 19.43, lng: -99.13 }); await call('POST', 'bob', '/api/location', { lat: 19.44, lng: -99.14 });
  r = await call('GET', 'alice', '/api/people'); const pb = [...r.data.online, ...r.data.recent].find((u) => u.uid === 'bob'); ok('distance is coarse, no coordinates', pb && typeof pb.distanceKm === 'number' && pb.lat === undefined && r.data.hasLocation, r);
  // safety: a block hides both ways across features
  ok('report needs a reason', (await call('POST', 'alice', '/api/report', { target: 'bob' })).status === 400);
  ok('report', (await call('POST', 'alice', '/api/report', { target: 'bob', reason: 'spam', detail: 'x' })).status === 200);
  ok('block', (await call('POST', 'alice', '/api/block', { target: 'bob' })).status === 200);
  r = await call('GET', 'alice', '/api/blocks'); ok('block list', r.data.blocks.length === 1 && r.data.blocks[0].uid === 'bob', r);
  r = await call('GET', 'alice', '/api/feed'); ok('blocked user hidden in feed', r.data.posts.length === 0, r);
  r = await call('GET', 'bob', '/api/people'); ok('blocker hidden from blocked user', ![...r.data.online, ...r.data.recent].some((u) => u.uid === 'alice'), r);
  ok('message to blocker refused', (await call('POST', 'bob', '/api/chat/' + encodeURIComponent('m:alice') + '/messages', { text: 'x' })).status >= 400);
  ok('unblock', (await call('DELETE', 'alice', '/api/block/bob')).status === 200);
  // admin
  ok('admin refused for members', (await call('GET', 'bob', '/api/admin/overview')).status === 403);
  r = await call('GET', 'alice', '/api/admin/overview'); ok('admin overview', r.status === 200, r);
  r = await call('GET', 'alice', '/api/admin/users'); ok('admin users', r.status === 200 && r.data.users.length === 3, r);
  r = await call('GET', 'alice', '/api/admin/reports'); ok('admin reports', r.data.reports.length === 1, r); const rid = r.data.reports[0] && r.data.reports[0].id;
  ok('resolve report', (await call('POST', 'alice', '/api/admin/reports/' + rid + '/resolve', {})).status === 200);
  r = await call('GET', 'alice', '/api/admin/content'); ok('admin content groups', r.data.groups.length === 2, r);
  ok('admin deletes a post', (await call('DELETE', 'alice', '/api/admin/content/post/' + pid)).status === 200 && (await call('GET', 'bob', '/api/feed')).data.posts.length === 0);
  ok('admin cannot ban self', (await call('POST', 'alice', '/api/admin/users/alice/ban', { blocked: true })).status === 400);
  ok('ban user', (await call('POST', 'alice', '/api/admin/users/carol/ban', { blocked: true })).status === 200);
  ok('banned user is locked out', (await call('GET', 'carol', '/api/feed')).status === 403);
  // wallet
  r = await call('GET', 'bob', '/api/wallet'); ok('wallet starts at 0', r.status === 200 && r.data.balance === 0, r);
  ok('member cannot credit', (await call('POST', 'bob', '/api/admin/wallet/credit', { uid: 'bob', amount: 50 })).status === 403);
  ok('admin credit', (await call('POST', 'alice', '/api/admin/wallet/credit', { uid: 'bob', amount: 50, note: 'test' })).status === 200);
  r = await call('GET', 'bob', '/api/wallet'); ok('balance after credit', r.data.balance === 50 && r.data.history.length === 1, r);
  ok('top-up out of range → 400', (await call('POST', 'bob', '/api/wallet/topup', { amount: 1 })).status === 400);
  r = await call('POST', 'bob', '/api/wallet/topup', { amount: 100 }); ok('top-up without PAY_API_KEY fails cleanly', r.status >= 400 && r.status !== 500 || r.status === 503, r);
  for (const p of ['/feed', '/rooms', '/room', '/people', '/profile', '/user', '/admin', '/wallet', '/maps.js', '/vendor/qrcode.js']) ok('GET ' + p, (await fetch(B + p)).status === 200);
  console.log(failed ? `✗ ${failed} failed, ${passed} passed` : `✓ ${passed} checks passed`);
  done(failed ? 1 : 0);
} catch (e) { console.error('✗ smoke test aborted: ' + e.message + '\n' + String(e.stack).split('\n').slice(1, 3).join('\n')); done(1); }
