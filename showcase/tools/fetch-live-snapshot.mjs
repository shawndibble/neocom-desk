#!/usr/bin/env node
/**
 * Snapshots real EVE data into `showcase/live/` so the screenshots show the
 * game's actual numbers rather than invented ones.
 *
 * Run on demand, never as part of a screenshot run: the capture itself must
 * stay offline and repeatable, so it reads these files instead of the network.
 *
 *   node showcase/tools/fetch-live-snapshot.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'live');

const ESI = 'https://esi.evetech.net';
const HEADERS = {
  // Required of every ESI call by CLAUDE.md, and a descriptive agent with it.
  'X-Compatibility-Date': '2025-08-26',
  'X-User-Agent': 'neocom-desk-showcase-fixture/1.0 (github.com/shawndibble/neocom-desk)',
};

const JITA = 60003760;
const THE_FORGE = 10000002;

async function getJson(url, options = {}) {
  const response = await fetch(url, { headers: HEADERS, ...options });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

/** Small concurrency cap — ESI bills against a shared error budget. */
async function mapLimited(items, limit, fn) {
  const out = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        out[index] = await fn(items[index], index);
      }
    })
  );
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });

  console.log('markets/prices ...');
  const adjusted = await getJson(`${ESI}/markets/prices`);
  await writeFile(join(OUT, 'markets-prices.json'), JSON.stringify(adjusted));
  console.log(`  ${adjusted.length} types`);

  console.log('industry/systems ...');
  const costIndices = await getJson(`${ESI}/industry/systems`);
  await writeFile(join(OUT, 'industry-systems.json'), JSON.stringify(costIndices));
  console.log(`  ${costIndices.length} systems`);

  console.log('public contracts (The Forge) ...');
  const publicContracts = await getJson(`${ESI}/contracts/public/${THE_FORGE}?page=1`);
  const itemExchange = publicContracts.filter(
    (contract) => contract.type === 'item_exchange' && contract.price > 0
  );
  const courier = publicContracts.filter((contract) => contract.type === 'courier');

  // Item lines for a sample, not all 1000 — this is a fixture, and each
  // contract is its own request against the shared error budget.
  const sample = itemExchange.slice(0, 60);
  console.log(`  resolving items for ${sample.length} of ${itemExchange.length} ...`);
  const withItems = await mapLimited(sample, 6, async (contract) => {
    try {
      const items = await getJson(`${ESI}/contracts/public/items/${contract.contract_id}`);
      return { contract, items };
    } catch {
      return null; // expired between listing and lookup — ESI answers 404
    }
  });

  await writeFile(
    join(OUT, 'public-contracts.json'),
    JSON.stringify({
      regionId: THE_FORGE,
      fetchedAt: Date.now(),
      itemExchange: withItems.filter(Boolean),
      courier: courier.slice(0, 40),
    })
  );
  console.log(`  ${withItems.filter(Boolean).length} with items, ${courier.length} courier`);

  console.log('fuzzwork Jita aggregates ...');
  // Every type the fixture prices: the SDE market catalogue, in Fuzzwork's
  // own 200-per-request batches.
  const marketTypes = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      join(OUT, '..', '..', 'public', 'data', 'market', 'types.json'),
      'utf-8'
    )
  );
  const typeIds = marketTypes.map((entry) => entry.typeId);
  const batches = [];
  for (let i = 0; i < typeIds.length; i += 200) batches.push(typeIds.slice(i, i + 200));
  console.log(`  ${typeIds.length} types in ${batches.length} batches`);

  const aggregates = {};
  await mapLimited(batches, 4, async (batch) => {
    const url = `https://market.fuzzwork.co.uk/aggregates/?station=${JITA}&types=${batch.join(',')}`;
    const body = await getJson(url, { headers: {} });
    Object.assign(aggregates, body);
  });
  await writeFile(join(OUT, 'fuzzwork-jita.json'), JSON.stringify(aggregates));
  console.log(`  ${Object.keys(aggregates).length} priced`);

  console.log('done ->', OUT);
}

await main();
