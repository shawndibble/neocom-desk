import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { piTier } from '../../src/engine/pi/chain';
import type { PiData } from '../../src/sde/types';

/** The graph the app itself bakes, so the engine's own `piTier` can read it. */
export const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

/** Flat per tier, so a made tier is worth making. */
const UNIT_PRICE = [5, 760, 14_000, 100_000, 1_900_000];

/**
 * The region volume object PI plans cap sales against: every product trades far
 * more than a pilot makes, so no plan is capped. Unmocked, the read 404s and the
 * console-error check fails.
 */
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

/**
 * Quotes every type asked about, at its tier's price, both sides of the book.
 * A later `page.route` wins over an earlier one — see `support/testBase.ts`.
 */
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

/** Every type asked about at one flat quote, whatever it is. */
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
