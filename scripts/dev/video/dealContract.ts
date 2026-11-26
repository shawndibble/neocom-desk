/**
 * The "Is it fair?" cut: contract 300003 (an Item Exchange the sandbox already lists at
 * 93.83M ISK) holds 5,000 Nanite Repair Paste, and Fuzzwork's Jita aggregates price the paste
 * at about 21.5k ISK, so the detail panel reads below the hub price. Any other type gets a
 * modest price so no line shows as unpriced.
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Paste, minerals, then the survey's belt ores (Scordite, Pyroxeres, Kernite, Omber).
const PRICES: Record<number, number> = {
  28668: 21_500,
  34: 5.6,
  35: 11,
  36: 48,
  37: 95,
  1228: 16,
  1224: 21,
  20: 64,
  1227: 38,
};

const ORE_PRICES: Record<string, number> = { Scordite: 16, Pyroxeres: 21, Kernite: 64, Omber: 38 };
const NAMES = JSON.parse(
  readFileSync(new URL('../../../public/data/types.json', import.meta.url), 'utf8')
) as Record<string, { name: string }>;

/** A compressed belt ore prices like its raw ore (the app multiplies raw units by it). */
function priceOf(typeId: number): number {
  if (PRICES[typeId] !== undefined) return PRICES[typeId];
  const ore = NAMES[String(typeId)]?.name.replace(/^Compressed /, '').split(' ')[0];
  return (ore && ORE_PRICES[ore]) ?? 1_000_000;
}

export async function installDealContract(page: Page): Promise<void> {
  await page.route(/\/contracts\/300003\/items/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          record_id: 3_000_030,
          type_id: 28668,
          quantity: 5000,
          is_included: true,
          is_singleton: false,
        },
      ]),
    })
  );
  await page.route('https://market.fuzzwork.co.uk/**', (route) => {
    const types = (new URL(route.request().url()).searchParams.get('types') ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number);
    const body = Object.fromEntries(
      types.map((id) => {
        const sell = priceOf(id);
        return [
          id,
          {
            buy: { max: sell * 0.94, volume: 500_000, orderCount: 40 },
            sell: { min: sell, volume: 500_000, orderCount: 60 },
          },
        ];
      })
    );
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(body),
    });
  });
}
