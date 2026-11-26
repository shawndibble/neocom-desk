import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { piTier } from '../../src/engine/pi/chain';
import type { PiData } from '../../src/sde/types';

export const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const UNIT_PRICE = [5, 760, 14_000, 100_000, 1_900_000];

async function mockHubVolume(page: Page): Promise<void> {
  const perDay = Object.fromEntries(Object.keys(pi.schematics).map((id) => [id, 1_000_000]));
  await page.route('https://data.neocomdesk.com/lp-store-volume/*.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lastSyncedAt: Date.now(), perDay }),
    })
  );
}

export async function mockHubPrices(page: Page): Promise<void> {
  await mockHubVolume(page);
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const types = new URL(route.request().url()).searchParams.get('types') ?? '';
    const body: Record<string, unknown> = {};
    for (const raw of types.split(',').filter(Boolean)) {
      const sell = UNIT_PRICE[piTier(Number(raw), pi)];
      body[raw] = {
        buy: { max: sell * 0.95, volume: 500_000, orderCount: 40 },
        sell: { min: sell, volume: 500_000, orderCount: 40 },
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

export async function mockFlatHubPrices(
  page: Page,
  quote: { buy: number; sell: number }
): Promise<void> {
  await mockHubVolume(page);
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const types = new URL(route.request().url()).searchParams.get('types') ?? '';
    const body = Object.fromEntries(
      types.split(',').map((raw) => [
        raw,
        {
          buy: { max: String(quote.buy), volume: '900000000', orderCount: '40' },
          sell: { min: String(quote.sell), volume: '900000000', orderCount: '40' },
        },
      ])
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}
