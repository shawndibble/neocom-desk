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
