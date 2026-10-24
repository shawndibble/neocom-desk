// TEMP (perf/chunk-import-map): counts the chunks a deploy-like rebuild renames,
// with the chunk import map off and on, and checks the import-map build's
// specifiers resolve. Removed before merge.
//
// Per mode: build A (release A), then from the same tree with release B:
//   B0 nothing else changed (a deploy whose only change is the release),
//   B1 a top-level line appended to src/lib/isk.ts (a leaf ~200 files import),
//   B2 the same in src/routes/Skills.tsx (one route page),
//   B3 one string in en.json's lazy `fittings` section (fittings.export.eft).
// `today` is production as it ships: no map, Sentry injecting the release.
// The `+sentry` modes run the Sentry plugin as the production deploy does (a
// fake token aimed at a closed port: the upload fails, the injection is real).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { posix, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { init, parse } from 'es-module-lexer';

await init;
const OUT = process.env.RUNNER_TEMP ?? '/tmp';
const SHA_A = 'aaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbb';

const SENTRY = {
  SENTRY_AUTH_TOKEN: 'sntrys_fake',
  SENTRY_ORG: 'x',
  SENTRY_PROJECT: 'y',
  SENTRY_URL: 'http://127.0.0.1:9/',
};

function build(label, sha, mapOn, sentry, inject = false) {
  rmSync('dist', { recursive: true, force: true });
  try {
    execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], {
      stdio: 'inherit',
      timeout: 300_000,
      env: {
        ...process.env,
        ...(sentry ? SENTRY : {}),
        GITHUB_SHA: sha,
        NEOCOM_SENTRY_INJECT: inject ? '1' : '0',
        NEOCOM_CHUNK_IMPORT_MAP: mapOn ? '1' : '0',
      },
    });
  } catch (error) {
    if (!sentry || !existsSync('dist/lazy-chunks.json')) throw error;
    console.log(`(${label}: build exited ${error.status} after writing dist, the fake upload)`);
  }
  const dir = join(OUT, label);
  rmSync(dir, { recursive: true, force: true });
  cpSync('dist', dir, { recursive: true });
  const assets = {};
  for (const f of readdirSync(join(dir, 'assets'))) {
    if (/\.(js|css)$/.test(f)) assets[`assets/${f}`] = readFileSync(join(dir, 'assets', f));
  }
  const lazy = new Set(JSON.parse(readFileSync(join(dir, 'lazy-chunks.json'), 'utf8')).files);
  const html = readFileSync(join(dir, 'index.html'));
  return { label, dir, assets, lazy, html };
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function report(mode, a, b) {
  const changed = Object.keys(b.assets).filter((f) => !(f in a.assets));
  const raw = changed.reduce((n, f) => n + b.assets[f].length, 0);
  const gz = changed.reduce((n, f) => n + gzipSync(b.assets[f]).length, 0);
  const lazyChanged = changed.filter((f) => b.lazy.has(f)).length;
  console.log(
    `${mode.padEnd(10)} ${b.label.padEnd(24)} changed ${String(changed.length).padStart(4)} of ${Object.keys(b.assets).length}` +
      ` (lazy ${lazyChanged} of ${b.lazy.size}, boot ${changed.length - lazyChanged}) ${kb(raw)} raw / ${kb(gz)} gzip`
  );
  return changed.length;
}

function checkImportMapBuild(snap) {
  const html = snap.html.toString('utf8');
  const problems = [];
  if (!/^<!doctype html>/i.test(html)) problems.push('index.html does not open with doctype');
  const mapMatch = html.match(/<script type="importmap"[^>]*>([\s\S]*?)<\/script>/);
  if (!mapMatch) problems.push('index.html has no import map');
  const imports = mapMatch ? JSON.parse(mapMatch[1]).imports : {};
  const keys = new Set(Object.keys(imports));
  for (const [k, v] of Object.entries(imports)) {
    if (!existsSync(join(snap.dir, v))) problems.push(`map ${k} -> ${v}: no such file`);
  }
  // Every specifier in every chunk resolves to a file or a map key.
  const graph = {};
  for (const [file, buf] of Object.entries(snap.assets)) {
    if (!file.endsWith('.js')) continue;
    const [specs] = parse(buf.toString('utf8'));
    graph[file] = [];
    for (const s of specs) {
      if (!s.n || s.n.startsWith('data:') || /^https?:/.test(s.n)) continue;
      const url = s.n.startsWith('/') ? s.n : posix.join('/', posix.dirname(file), s.n);
      if (!url.endsWith('.js') && !url.endsWith('.css')) continue;
      const exists = existsSync(join(snap.dir, url));
      const mapped = keys.has(url);
      if (!exists && !mapped) problems.push(`${file} imports ${s.n}: neither a file nor a map key`);
      graph[file].push({ url, exists, mapped });
    }
  }
  // Module workers get no import map: their graphs must name real files only.
  const workers = Object.keys(graph).filter((f) => /\.worker-/.test(f));
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const e of graph[f] ?? []) {
      if (!e.exists) problems.push(`worker graph: ${f} imports ${e.url}, only a map key`);
      else walk(e.url.slice(1));
    }
  };
  workers.forEach(walk);
  // What the loader starts must exist and be precached (boot), not lazy.
  const loader = html.match(/<script id="app-entry-boot">([\s\S]*?)<\/script>/)?.[1] ?? '';
  const started = [...loader.matchAll(/"\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const f of started) {
    if (!(f in snap.assets)) problems.push(`loader starts ${f}: no such file`);
    if (snap.lazy.has(f)) problems.push(`loader starts ${f}: listed lazy, not precached`);
  }
  const mapBytes = mapMatch ? Buffer.byteLength(mapMatch[0]) : 0;
  console.log(
    `check: ${keys.size} map entries (${kb(mapBytes)} raw, ${kb(gzipSync(mapMatch?.[0] ?? '').length)} gzip), ` +
      `${workers.length} worker entries / ${seen.size} worker graph files, loader starts ${started.length}, ` +
      `index.html ${kb(snap.html.length)} raw / ${kb(gzipSync(snap.html).length)} gzip, ` +
      `${problems.length} problems`
  );
  for (const p of problems.slice(0, 40)) console.log(`  PROBLEM ${p}`);
  return problems.length;
}

const edits = [
  ['release-only', () => {}],
  ['leaf src/lib/isk.ts', () => append('src/lib/isk.ts')],
  ['route src/routes/Skills', () => append('src/routes/Skills.tsx')],
  ['en.json fittings string', editLocale],
];

function append(file) {
  writeFileSync(file, `${readFileSync(file, 'utf8')}\n;globalThis.__cascadeProbe = 1;\n`);
}
function editLocale() {
  const file = 'src/i18n/locales/en.json';
  const en = JSON.parse(readFileSync(file, 'utf8'));
  en.fittings.export.eft += ' (probe)';
  writeFileSync(file, `${JSON.stringify(en, null, 2)}\n`);
}
const restore = () => execFileSync('git', ['checkout', '--', 'src'], { stdio: 'inherit' });

let failures = 0;
const summary = [];
const modes = [
  ['off', false, false],
  ['on', true, false],
  ['on+sentry', true, true],
];
for (const [mode, mapOn, sentry, inject] of modes) {
  restore();
  const a = build(`${mode}-A`, SHA_A, mapOn, sentry, inject);
  if (mapOn) failures += checkImportMapBuild(a);
  for (const [label, edit] of sentry ? edits.slice(0, 2) : edits) {
    restore();
    edit();
    const b = build(`${mode}-${label.replace(/\W+/g, '-')}`, SHA_B, mapOn, sentry, inject);
    b.label = label;
    summary.push([mode, label, report(mode, a, b)]);
  }
}
restore();
console.log('\nsummary (changed chunk files vs build A):');
for (const [mode, label, n] of summary)
  console.log(`  ${mode.padEnd(10)} ${label.padEnd(26)} ${n}`);
process.exit(failures > 0 ? 1 : 0);
