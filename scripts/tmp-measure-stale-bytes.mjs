// TEMP (perf/chunk-import-map): finds chunks that keep their file name across a
// rebuild while their bytes change (Vite writes `__vite__mapDeps` after the hash
// is fixed). Probe: src/routes/Skills.tsx gains a static import of ShipTreeTab,
// which brings a new js chunk and a css file into the deps behind the router's
// `import()` of Skills. Removed before merge.
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.RUNNER_TEMP ?? '/tmp';
function build(label, sha, mapOn) {
  rmSync('dist', { recursive: true, force: true });
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], {
    stdio: 'inherit',
    env: { ...process.env, GITHUB_SHA: sha, NEOCOM_CHUNK_IMPORT_MAP: mapOn ? '1' : '0' },
  });
  const dir = join(OUT, label);
  rmSync(dir, { recursive: true, force: true });
  cpSync('dist', dir, { recursive: true });
  const assets = {};
  for (const f of readdirSync(join(dir, 'assets'))) {
    if (/\.(js|css)$/.test(f)) assets[`assets/${f}`] = readFileSync(join(dir, 'assets', f), 'utf8');
  }
  return assets;
}
const deps = (code) => code.match(/m\.f=\[[^\]]*\]/)?.[0] ?? '';
const restore = () => execFileSync('git', ['checkout', '--', 'src'], { stdio: 'inherit' });

for (const mapOn of [false, true]) {
  const mode = mapOn ? 'on' : 'off';
  restore();
  const a = build(`${mode}-A`, 'aaaaaaaaaaaa', mapOn);
  const skills = 'src/routes/Skills.tsx';
  writeFileSync(
    skills,
    `import '@/features/fittings/shipTree/ShipTreeTab';\n${readFileSync(skills, 'utf8')}`
  );
  const b = build(`${mode}-B`, 'bbbbbbbbbbbb', mapOn);
  const renamed = Object.keys(b).filter((f) => !(f in a));
  const sameNameNewBytes = Object.keys(b).filter((f) => f in a && a[f] !== b[f]);
  console.log(
    `${mode}: renamed ${renamed.length}, same name but new bytes ${sameNameNewBytes.length}`
  );
  for (const f of sameNameNewBytes) {
    const depsChanged = deps(a[f]) !== deps(b[f]);
    console.log(`  ${f} deps list changed: ${depsChanged}`);
    if (depsChanged) {
      const before = new Set(deps(a[f]).match(/"[^"]+"/g) ?? []);
      const added = (deps(b[f]).match(/"[^"]+"/g) ?? []).filter((d) => !before.has(d));
      const after = new Set(deps(b[f]).match(/"[^"]+"/g) ?? []);
      const removed = [...before].filter((d) => !after.has(d));
      console.log(`    added: ${added.join(' ')}`);
      console.log(`    removed: ${removed.join(' ')}`);
    }
  }
}
restore();
