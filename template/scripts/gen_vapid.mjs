// Create the Web Push key pair. The public key goes into wrangler.jsonc (VAPID_PUBLIC); the private key is piped
// straight into `wrangler secret put VAPID_PRIVATE` and never printed or written to disk.
// Run once per app: npm run push:keys   (needs Node 22 on PATH for wrangler)
import crypto from 'crypto'; import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cfgPath = path.join(root, 'wrangler.jsonc');
let cfg = fs.readFileSync(cfgPath, 'utf8');
if (/"VAPID_PUBLIC":\s*"[^"]+"/.test(cfg) && !process.argv.includes('--force')) { console.log('VAPID_PUBLIC is already set. Use --force to replace it (every device must then re-subscribe).'); process.exit(0); }
const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
const r = spawnSync('npx', ['wrangler', 'secret', 'put', 'VAPID_PRIVATE'], { cwd: root, input: JSON.stringify(jwk), encoding: 'utf8' });
if (r.status !== 0) { console.error('wrangler secret put failed:\n' + (r.stderr || r.stdout).split('\n').slice(-6).join('\n')); process.exit(1); }
cfg = cfg.replace(/"VAPID_PUBLIC":\s*"[^"]*"/, '"VAPID_PUBLIC": "' + pub + '"');
fs.writeFileSync(cfgPath, cfg);
console.log('✓ secret VAPID_PRIVATE uploaded, VAPID_PUBLIC written to wrangler.jsonc. Deploy to apply: npm run deploy');
