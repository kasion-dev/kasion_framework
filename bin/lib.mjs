// Shared helpers for the kasion CLI.
import fs from 'fs'; import path from 'path';
export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const featuresDir = path.join(root, 'features');
export const listFeatures = () => fs.readdirSync(featuresDir).filter((n) => fs.existsSync(path.join(featuresDir, n, 'feature.json'))).map((n) => JSON.parse(fs.readFileSync(path.join(featuresDir, n, 'feature.json'), 'utf8')));
export const version = () => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
export const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
// .kasion.json in an app records what was installed (so `update` knows which feature files to refresh).
export const readState = (app) => { try { return JSON.parse(fs.readFileSync(path.join(app, '.kasion.json'), 'utf8')); } catch { return { features: [] }; } };
export const writeState = (app, st) => fs.writeFileSync(path.join(app, '.kasion.json'), JSON.stringify({ ...st, framework: version() }, null, 2) + '\n');
export function isApp(dir) { return fs.existsSync(path.join(dir, 'src', 'core', 'app.js')) && fs.existsSync(path.join(dir, 'wrangler.jsonc')); }

// Install one feature into an app folder. Returns a list of human-readable lines.
export function addFeature(app, name, vars = {}) {
  const dir = path.join(featuresDir, name), out = [];
  if (!fs.existsSync(path.join(dir, 'feature.json'))) throw new Error('unknown feature: ' + name + ' (see: kasion list)');
  const f = JSON.parse(fs.readFileSync(path.join(dir, 'feature.json'), 'utf8'));
  const st = readState(app);
  if (st.features.includes(name)) return ['• ' + name + ' is already installed'];
  const fill = (s) => { for (const k in vars) s = s.split(k).join(vars[k]); return s; };
  // server module
  if (fs.existsSync(path.join(dir, 'server.js'))) {
    fs.mkdirSync(path.join(app, 'src', 'features'), { recursive: true });
    fs.copyFileSync(path.join(dir, 'server.js'), path.join(app, 'src', 'features', name + '.js'));
    const wp = path.join(app, 'src', 'worker.js'); let w = fs.readFileSync(wp, 'utf8');
    const imp = `import { ${f.exports || name} } from './features/${name}.js';\n`, use = fill(f.use) + '\n';
    if (!w.includes('// kasion:imports') || !w.includes('// kasion:plugins')) out.push('! src/worker.js has no kasion markers: add these lines yourself →  ' + imp.trim() + '   ' + use.trim());
    else { w = w.replace('// kasion:imports', imp + '// kasion:imports').replace('// kasion:plugins', use + '// kasion:plugins'); fs.writeFileSync(wp, w); }
  }
  // migration (next free number)
  const mig = path.join(dir, 'migration.sql');
  if (fs.existsSync(mig) && fs.readFileSync(mig, 'utf8').trim()) {
    const md = path.join(app, 'migrations');
    const next = Math.max(0, ...fs.readdirSync(md).map((n) => parseInt(n, 10) || 0)) + 1;
    const file = String(next).padStart(4, '0') + '_' + name + '.sql';
    fs.copyFileSync(mig, path.join(md, file));
    out.push('  migration: migrations/' + file);
  }
  // pages and client assets
  for (const p of walk(path.join(dir, 'public'))) {
    const rel = path.relative(path.join(dir, 'public'), p), dest = path.join(app, 'public', rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest)) { out.push('  kept existing public/' + rel); continue; }
    if (/\.(html|js|css|json)$/.test(p)) fs.writeFileSync(dest, fill(fs.readFileSync(p, 'utf8'))); else fs.copyFileSync(p, dest);
  }
  // app.config.js: tab, config line, features list
  const cp = path.join(app, 'public', 'app.config.js');
  if (fs.existsSync(cp)) {
    let c = fs.readFileSync(cp, 'utf8');
    const tabCount = (c.match(/^\s*\['[a-z_]+', /gm) || []).length;
    if (f.tab && tabCount >= 5) out.push('  tab not added (5 tabs already): link to ' + f.tab[2] + ' from a page, or edit tabs in public/app.config.js');
    else if (f.tab && c.includes('// kasion:tabs')) c = c.replace('// kasion:tabs', JSON.stringify(f.tab).replace(/","/g, "', '").replace(/^\["/, "['").replace(/"\]$/, "']") + ',\n    // kasion:tabs');
    if (f.config && c.includes('// kasion:config')) c = c.replace('// kasion:config', f.config + '\n  // kasion:config');
    if (c.includes('features: [')) c = c.replace(/features: \[([^\]]*)\]/, (m, inner) => 'features: [' + (inner.trim() ? inner.trim() + ', ' : '') + "'" + name + "']");
    fs.writeFileSync(cp, c);
  }
  st.features.push(name); writeState(app, st);
  out.unshift('✓ added ' + name + ' — ' + f.title);
  if (f.notes) out.push('  note: ' + f.notes);
  return out;
}
