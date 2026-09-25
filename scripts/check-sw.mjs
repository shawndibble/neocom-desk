// Fails the build when the Service Worker bundle won't evaluate as a classic
// script. The app registers `sw.js` without `type: 'module'`, so any module
// syntax that reaches it — `import.meta` from Vite's preload helper, pulled in
// by a dynamic `import()` anywhere in `src/sw.ts`'s import graph — is a
// SyntaxError. The browser then reports only "ServiceWorker script evaluation
// failed", no worker ever registers, and every notification and Web Push
// silently stops. That shipped once, unnoticed for days, because the desktop
// page still had a constructor fallback. Parsing only: a worker that throws at
// runtime still passes.
//
// Usage: node scripts/check-sw.mjs [path]   (default: dist/sw.js)
import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2] ?? 'dist/sw.js';
if (!fs.existsSync(file)) {
  console.error(`check-sw: ${file} not found — the Service Worker was not built.`);
  process.exit(1);
}
try {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
} catch (err) {
  console.error(`check-sw: ${file} is not a valid classic script: ${err.message}`);
  console.error("Something in src/sw.ts's import graph likely uses import() or import.meta.");
  process.exit(1);
}
console.log(`check-sw: ${file} parses as a classic script.`);
