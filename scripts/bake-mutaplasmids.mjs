#!/usr/bin/env node
// Bakes public/data/mutaplasmids.json alone, from CCP JSONL files already on
// disk — the same `bakeMutaplasmids` build-sde.mjs runs on every refresh, for
// a one-off bake without the rest of the SDE's drift.
//
// Usage: node scripts/bake-mutaplasmids.mjs <dynamicItemAttributes.jsonl> <dogmaAttributes.jsonl>

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './lib/paths.mjs';
import { parseJsonl } from './lib/certifiedPlans.mjs';
import { bakeMutaplasmids, dogmaAttributeInfo } from './lib/mutaplasmids.mjs';

const OUT_FILE = join(ROOT, 'public', 'data', 'mutaplasmids.json');

const [dynamicPath, dogmaPath] = process.argv.slice(2);
if (!dynamicPath || !dogmaPath) {
  console.error(
    'usage: node scripts/bake-mutaplasmids.mjs <dynamicItemAttributes.jsonl> <dogmaAttributes.jsonl>'
  );
  process.exit(1);
}

const baked = bakeMutaplasmids(
  parseJsonl(await readFile(dynamicPath, 'utf8')),
  dogmaAttributeInfo(parseJsonl(await readFile(dogmaPath, 'utf8')))
);
const json = JSON.stringify(baked);
await writeFile(OUT_FILE, json);
console.log(
  `mutaplasmids.json: ${Object.keys(baked.mutaplasmids).length} mutaplasmids, ${baked.abyssalTypeIds.length} abyssal types, ${Buffer.byteLength(json).toLocaleString()} bytes`
);
