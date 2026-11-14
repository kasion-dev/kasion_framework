// Syntax check for everything the browser and the Worker will run. Run before every deploy: npm run check
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { execFileSync } from 'child_process'; import os from 'os';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let bad = 0, n = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk(path.join(root, 'public'))) {
  if (f.endsWith('.js')) { n++; try { new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f }); } catch (e) { bad++; console.log('✗', path.relative(root, f), e.message); } }
  if (f.endsWith('.html')) {
    const h = fs.readFileSync(f, 'utf8'); const re = /<script([^>]*)>([\s\S]*?)<\/script>/g; let m, i = 0;
    while ((m = re.exec(h))) { i++; if (/src=/.test(m[1]) || !m[2].trim() || /type="(application\/json|importmap|module)"/.test(m[1])) continue; n++;
      try { new vm.Script(m[2], { filename: f + '#' + i }); } catch (e) { bad++; console.log('✗', path.relative(root, f), 'script #' + i, e.message); } }
    // every {{name}} used by the template should be returned by renderVals (cheap heuristic: the name appears in the script)
    const tpl = h.split('<script type="text/x-dc"')[0], js = h.split('<script type="text/x-dc"')[1] || '';
    if (js) for (const key of new Set([...tpl.matchAll(/\{\{\s*([a-zA-Z_][\w]*)[\w.]*\s*\}\}/g)].map((x) => x[1]))) {
      const loopVar = new RegExp('as="' + key + '"').test(tpl);
      if (!loopVar && !new RegExp('\\b' + key + '\\b').test(js)) console.log('?', path.relative(root, f), '{{' + key + '}} is not mentioned in the page script');
    }
  }
}
// Worker modules: node --check on a .mjs copy (the project has no "type": "module")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kcheck-'));
for (const f of walk(path.join(root, 'src'))) {
  if (!f.endsWith('.js')) continue; n++;
  const t = path.join(tmp, path.relative(root, f).replace(/[\\/]/g, '_').replace(/\.js$/, '.mjs'));
  fs.writeFileSync(t, fs.readFileSync(f, 'utf8').replace(/from '\.\/[^']+'/g, (s) => s)); // imports are not resolved by --check
  try { execFileSync(process.execPath, ['--check', t], { stdio: 'pipe' }); } catch (e) { bad++; console.log('✗', path.relative(root, f), String(e.stderr || e.message).split('\n').slice(0, 4).join(' | ')); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `✗ ${bad} problem(s) in ${n} scripts` : `✓ ${n} scripts ok`);
process.exit(bad ? 1 : 0);
