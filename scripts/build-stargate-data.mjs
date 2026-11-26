import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) =>
  JSON.parse(readFileSync(new URL(`../public/data/market/${p}`, import.meta.url), 'utf8'));

const jumps = read('jumps.json');
const ids = Object.keys(jumps)
  .map(Number)
  .sort((a, b) => a - b);
const graph = Object.fromEntries(ids.map((id) => [id, jumps[id]]));
const security = {};
for (const system of read('systems.json')) {
  if (Object.hasOwn(jumps, String(system.id))) security[system.id] = system.security;
}

const out = `export const STARGATES: Readonly<Record<string, readonly number[]>> = ${JSON.stringify(graph)};
export const SYSTEM_SECURITY: Readonly<Record<string, number>> = ${JSON.stringify(security)};
`;
writeFileSync(new URL('../functions/src/data/stargateGraph.ts', import.meta.url), out);
