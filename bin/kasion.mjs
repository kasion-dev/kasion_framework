#!/usr/bin/env node
// kasion — the framework CLI.
//   kasion create <app_name> [options]     new app next to the framework (see bin/create.mjs for options)
//   kasion list                            features that can be added
//   kasion add <feature> [<feature>…]      run inside an app: install features (server module, migration, pages, tab)
//   kasion update                          run inside an app: refresh src/core, kasion.js, kasion.vue.js, vendor and installed features
//   kasion doctor                          run inside an app: check config, migrations and placeholders
import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process';
import { root, listFeatures, addFeature, isApp, readState, writeState, walk, version } from './lib.mjs';
const [cmd, ...rest] = process.argv.slice(2);
const app = process.cwd();
const needApp = () => { if (!isApp(app)) { console.error('Run this inside a kasion app folder (one with src/core/app.js and wrangler.jsonc).'); process.exit(1); } };
const varsOf = () => { const w = fs.readFileSync(path.join(app, 'wrangler.jsonc'), 'utf8'); const db = (/"database_name":\s*"([^"]+)"/.exec(w) || [])[1] || path.basename(app); return { __APP_NAME__: db }; };

if (cmd === 'create') { const r = spawnSync(process.execPath, [path.join(root, 'bin', 'create.mjs'), ...rest], { stdio: 'inherit' }); process.exit(r.status || 0); }
else if (cmd === 'list') { const st = isApp(app) ? readState(app).features : []; for (const f of listFeatures()) console.log((st.includes(f.name) ? '✓ ' : '  ') + f.name.padEnd(9) + f.title); console.log('\nAdd with: kasion add <feature>   (✓ = installed in this app)'); }
else if (cmd === 'add') {
  needApp(); if (!rest.length) { console.error('usage: kasion add <feature> [<feature>…]   (kasion list)'); process.exit(1); }
  for (const n of rest) { try { console.log(addFeature(app, n, varsOf()).join('\n')); } catch (e) { console.error('! ' + e.message); process.exitCode = 1; } }
  console.log('\nNext: npm run migrate:local   (and `npm run migrate` for production), then npm run check');
}
else if (cmd === 'update') {
  needApp();
  const copyDir = (from, to) => { for (const p of walk(from)) { const d = path.join(to, path.relative(from, p)); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(p, d); } };
  copyDir(path.join(root, 'template', 'src', 'core'), path.join(app, 'src', 'core'));
  for (const f of ['kasion.js', 'kasion.vue.js', 'sw.js']) fs.copyFileSync(path.join(root, 'template', 'public', f), path.join(app, 'public', f));
  copyDir(path.join(root, 'template', 'public', 'vendor'), path.join(app, 'public', 'vendor'));
  for (const f of ['check.mjs', 'gen_vapid.mjs', 'make_icons.sh', 'gen_sfx.py']) fs.copyFileSync(path.join(root, 'template', 'scripts', f), path.join(app, 'scripts', f));
  const st = readState(app);
  for (const n of st.features) { const s = path.join(root, 'features', n, 'server.js'); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(app, 'src', 'features', n + '.js')); }
  fs.writeFileSync(path.join(app, 'src', 'core', 'VERSION'), 'kasion_framework ' + version() + '\n'); writeState(app, st);
  console.log('✓ updated to kasion_framework ' + version() + ': src/core, kasion.js, kasion.vue.js, sw.js, vendor, scripts' + (st.features.length ? ', features (' + st.features.join(', ') + ' — server modules only; pages and migrations are yours)' : ''));
  console.log('Run: npm run check   then test before deploying.');
}
else if (cmd === 'doctor') {
  needApp(); let bad = 0; const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? '✓ ' : '✗ ') + msg); };
  const w = fs.readFileSync(path.join(app, 'wrangler.jsonc'), 'utf8');
  say(!/REPLACE_AFTER_D1_CREATE/.test(w), 'D1 database id is set in wrangler.jsonc');
  say(!/"TEST_AUTH"/.test(w), 'TEST_AUTH is not in wrangler.jsonc');
  say(/"ADMIN_EMAILS":\s*"[^"]+"/.test(w), 'ADMIN_EMAILS has at least one address');
  say(fs.existsSync(path.join(app, 'public', 'apple-touch-icon.png')), 'PNG icons exist (npm run icons)');
  const left = walk(app).filter((p) => !/node_modules|\.wrangler|\.git\/|public\/vendor\//.test(p) && /\.(js|jsonc|json|html|md|sql|webmanifest)$/.test(p)).filter((p) => /__[A-Z_]+__/.test(fs.readFileSync(p, 'utf8')));
  say(!left.length, 'no template placeholders left' + (left.length ? ': ' + left.map((p) => path.relative(app, p)).join(', ') : ''));
  const st = readState(app); const worker = fs.readFileSync(path.join(app, 'src', 'worker.js'), 'utf8');
  for (const n of st.features) if (fs.existsSync(path.join(root, 'features', n, 'server.js'))) say(worker.includes("./features/" + n + ".js"), 'feature ' + n + ' is imported in src/worker.js');
  console.log('• push: ' + (/"VAPID_PUBLIC":\s*"[^"]+"/.test(w) ? 'keys set' : 'not set (npm run push:keys)') + ' · calls: ' + (/"AGORA_APP_ID":\s*"[^"]+"/.test(w) ? 'app id set' : 'not set'));
  process.exit(bad ? 1 : 0);
}
else { console.log('kasion ' + version() + '\n\n  kasion create <app_name> [--title … --domain … --accent "#RRGGBB" --admin you@gmail.com --with feed,rooms,… --provision]\n  kasion list\n  kasion add <feature>…      (inside an app)\n  kasion update              (inside an app)\n  kasion doctor              (inside an app)\n\nFeatures: ' + listFeatures().map((f) => f.name).join(', ')); }
