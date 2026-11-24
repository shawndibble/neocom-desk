/**
 * Mock public courier snapshot (data.neocomdesk.com/courier-contracts) for the promo recordings:
 * hauls between NPC stations in and around Heimatar, Metropolis and Molden Heath, so the Courier
 * tab near a Minmatar lowsec Current System fills with rows ranked by ISK per jump. Deterministic.
 * Courier rows carry no issuer, so no player appears.
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mix } from '../sandbox/gen';

const data = (file: string) =>
  JSON.parse(readFileSync(new URL(`../../../public/data/market/${file}`, import.meta.url), 'utf8'));

const REGIONS = [10000030, 10000042, 10000028, 10000002, 10000043];

export function courierRows(): unknown[] {
  const systems = new Map<number, number>(
    (data('systems.json') as { id: number; regionId: number }[]).map((s) => [s.id, s.regionId])
  );
  const stations = (data('stations.json') as { id: number; systemId: number }[])
    .map((s) => ({ ...s, regionId: systems.get(s.systemId) ?? 0 }))
    .filter((s) => REGIONS.includes(s.regionId));
  const rows: unknown[] = [];
  for (let n = 0; n < 220; n += 1) {
    const a = stations[mix(n * 7 + 1) % stations.length];
    const b = stations[mix(n * 13 + 5) % stations.length];
    if (a.id === b.id) continue;
    const seed = mix(n + 99);
    const volume = [3_000, 8_500, 12_000, 30_000, 62_500, 120_000, 300_000][seed % 7];
    rows.push({
      contractId: 190_000_000 + n,
      regionId: a.regionId,
      originLocationId: a.id,
      destinationLocationId: b.id,
      reward: Math.round((4 + (seed % 46)) * 1_000_000 * (1 + volume / 200_000)),
      volume,
      collateral: (seed % 3) * 150_000_000 + 50_000_000,
      daysToComplete: 3 + (seed % 12),
      dateExpired: Date.now() + (2 + (seed % 20)) * 86_400_000,
    });
  }
  return rows;
}

export async function installCourierContracts(page: Page): Promise<void> {
  const rows = courierRows();
  const object = 'courier-contracts/rows.promo.json';
  await page.route('https://data.neocomdesk.com/courier-contracts/**', (route) => {
    const url = route.request().url();
    const body = url.endsWith('/index.json')
      ? { lastSyncedAt: Date.now() - 600_000, count: rows.length, object }
      : rows;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(body),
    });
  });
}
