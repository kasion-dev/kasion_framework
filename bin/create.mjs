#!/usr/bin/env node
// kasion framework — create a new app from template/.
//   node bin/create.mjs <app_name> [--title "My App"] [--domain app.kasion.dev] [--accent "#00A85A"]
//                                  [--admin you@gmail.com] [--dir /path/to/parent] [--provision] [--no-git]
// --provision also creates the D1 database, applies migrations (local + remote) and builds the icons.
import fs from 'fs'; import path from 'path'; import { execFileSync, spawnSync } from 'child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const name = args[0]; // the app name comes first
if (!name || name.startsWith('--') || !/^[a-z][a-z0-9_]{1,40}$/.test(name)) { console.error('usage: node bin/create.mjs <app_name>   (snake_case, e.g. kasion_notes)\n       [--title "My App"] [--domain app.kasion.dev] [--accent "#00A85A"] [--admin you@gmail.com] [--dir <parent>] [--provision] [--no-git]'); process.exit(1); }
const title = flag('title', name.replace(/_/g, ' '));
const short = name.replace(/^kasion_/, '');
const domain = flag('domain', short.replace(/_/g, '-') + '.kasion.dev');
const accent = String(flag('accent', '#00A85A'));
if (!/^#[0-9a-fA-F]{6}$/.test(accent)) { console.error('--accent must look like #00A85A'); process.exit(1); }
const admin = flag('admin', '');
const parent = path.resolve(String(flag('dir', path.resolve(here, '..', '..'))));
const dest = path.join(parent, name);
if (fs.existsSync(dest)) { console.error('already exists: ' + dest); process.exit(1); }
// derive the darker "ink" and the pale "soft" colour from the accent
const rgb = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const vars = {
  __APP_NAME__: name, __APP_TITLE__: String(title), __WORKER_NAME__: name.replace(/_/g, '-'), __DB_NAME__: name, __DB_ID__: 'REPLACE_AFTER_D1_CREATE',
  __DOMAIN__: String(domain), __ADMIN_EMAILS__: admin === true ? '' : String(admin || ''), __ACCENT__: accent.toUpperCase(),
  __ACCENT_INK__: hex(rgb.map((v) => v * 0.76)), __ACCENT_SOFT__: hex(rgb.map((v) => v + (255 - v) * 0.9)), __INITIAL__: String(title).trim().slice(0, 1).toLowerCase() || 'k',
};
fs.cpSync(path.join(here, '..', 'template'), dest, { recursive: true });
const TEXT = /\.(js|mjs|json|jsonc|html|md|sql|svg|webmanifest|sh|py|example|gitignore)$/;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk(dest)) {
  if (!TEXT.test(f) && !/\.(gitignore|example)$/.test(f) && path.basename(f) !== '.gitignore') continue;
  let s = fs.readFileSync(f, 'utf8'), t = s;
  for (const k in vars) t = t.split(k).join(vars[k]);
  if (t !== s) fs.writeFileSync(f, t);
}
fs.copyFileSync(path.join(dest, '.dev.vars.example'), path.join(dest, '.dev.vars'));
const fwVersion = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(dest, 'src', 'core', 'VERSION'), 'kasion_framework ' + fwVersion + '\n');
console.log('✓ created ' + dest);
const run = (cmd, a, o = {}) => spawnSync(cmd, a, { cwd: dest, encoding: 'utf8', ...o });
if (process.platform === 'darwin') { const r = run('sh', ['scripts/make_icons.sh']); console.log(r.status === 0 ? '✓ icons built' : '! icons not built (run: npm run icons)'); }
if (!flag('no-git')) { run('git', ['init', '-q', '-b', 'main']); console.log('✓ git initialised (nothing committed)'); }
if (flag('provision')) {
  const r = run('npx', ['wrangler', 'd1', 'create', name]);
  const id = (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(r.stdout + r.stderr) || [])[0];
  if (!id) console.log('! could not create the D1 database:\n' + (r.stderr || r.stdout).split('\n').slice(-5).join('\n'));
  else {
    const p = path.join(dest, 'wrangler.jsonc'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('REPLACE_AFTER_D1_CREATE', id));
    console.log('✓ D1 database ' + name + ' (' + id + ')');
    for (const where of ['--local', '--remote']) { const m = run('npx', ['wrangler', 'd1', 'migrations', 'apply', name, where], { env: { ...process.env, CI: '1' } }); console.log((m.status === 0 ? '✓' : '!') + ' migrations ' + where); }
  }
}
console.log(`
Next:
  cd ${dest}
  ${flag('provision') ? '' : 'npx wrangler d1 create ' + name + '        # put the id into wrangler.jsonc (database_id)\n  npm run migrate:local && npm run migrate\n  '}npm run dev                            # http://localhost:8787/?as=alice  (fake sign-in, local only)
  npm run deploy                         # → https://${domain}
Then, once per app:
  • Firebase Console → Authentication → Settings → Authorized domains → add ${domain}
  • npm run push:keys                    # Web Push (optional)
  • calls (optional): set AGORA_APP_ID in wrangler.jsonc + KASION.agoraAppId in public/app.config.js,
    and run: npx wrangler secret put AGORA_APP_CERTIFICATE
Read CLAUDE.md in the new project for the conventions.`);
