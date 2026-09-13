/**
 * Market prices are the one thing this harness cannot seed.
 *
 * `src/market/prices.ts` is an in-memory TTL cache by design (ADR 0002 —
 * prices are estimates, not worth persisting), so there is no `esiCache` row
 * behind hub prices, ESI adjusted prices, system cost indices or the order
 * book. Without them the Industry Build Plan list renders "–" for Profit and
 * Verdict, and Market's browser and appraisal price nothing. These four
 * endpoints are therefore answered here rather than cut off.
 *
 * The numbers are real: `showcase/tools/fetch-live-snapshot.mjs` snapshots
 * ESI's own `/markets/prices` and `/industry/systems` plus Fuzzwork's Jita
 * aggregates into `showcase/live/`, and this serves those files back. The
 * capture itself stays offline and repeatable — re-run the fetch script to
 * refresh the market.
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface FuzzworkSide {
  max?: string;
  min?: string;
  volume?: string;
  orderCount?: string;
}

interface FuzzworkAggregate {
  buy?: FuzzworkSide;
  sell?: FuzzworkSide;
}

function live<T>(name: string): T {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`../live/${name}`, import.meta.url)), 'utf-8')
  ) as T;
}

const JITA_AGGREGATES = live<Record<string, FuzzworkAggregate>>('fuzzwork-jita.json');
const ADJUSTED_PRICES = live<unknown[]>('markets-prices.json');
const COST_INDICES = live<unknown[]>('industry-systems.json');

/**
 * Fuzzwork prices are per station, and only Jita was snapshotted. Serving the
 * Jita book for every hub keeps every panel populated; the alternative is a
 * blank price column on any plan pointed at Amarr or Dodixie.
 */
function aggregateFor(typeId: number): FuzzworkAggregate | undefined {
  return JITA_AGGREGATES[String(typeId)];
}

export async function installPriceMock(page: Page): Promise<void> {
  // Fuzzwork aggregates — the primary hub price source. The snapshot is
  // already in Fuzzwork's own wire format (numbers as strings, `orderCount`
  // gating whether a side has a price at all), so entries pass through
  // untouched; a type absent from the snapshot is simply omitted, which
  // `market/fuzzwork.ts` already reads as "no orders".
  await page.route('https://market.fuzzwork.co.uk/aggregates/**', async (route) => {
    const url = new URL(route.request().url());
    const typeIds = (url.searchParams.get('types') ?? '')
      .split(',')
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0);

    const body: Record<string, FuzzworkAggregate> = {};
    for (const typeId of typeIds) {
      const aggregate = aggregateFor(typeId);
      if (aggregate) body[String(typeId)] = aggregate;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.route('https://esi.evetech.net/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (payload: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'x-pages': '1' },
        body: JSON.stringify(payload),
      });

    if (url.pathname.endsWith('/markets/prices')) return json(ADJUSTED_PRICES);
    if (url.pathname.endsWith('/industry/systems')) return json(COST_INDICES);

    // Region order book — the Market browser's depth table and the open-order
    // competition check. Built out from the type's real Jita spread rather
    // than snapshotted per type, which would be a request per item.
    const orders = /\/markets\/(\d+)\/orders/.exec(url.pathname);
    if (orders) {
      const typeId = Number(url.searchParams.get('type_id'));
      const aggregate = aggregateFor(typeId);
      const sell = Number(aggregate?.sell?.min);
      const buy = Number(aggregate?.buy?.max);
      if (!Number.isFinite(sell) || !Number.isFinite(buy)) return json([]);
      return json([
        ...[0, 1, 2, 3].map((step) => ({
          order_id: typeId * 100 + step,
          type_id: typeId,
          location_id: 60_003_760,
          system_id: 30_000_142,
          is_buy_order: false,
          price: Math.round(sell * (1 + step * 0.018) * 100) / 100,
          volume_remain: 40 - step * 7,
          volume_total: 60,
          min_volume: 1,
          duration: 90,
          issued: new Date(Date.now() - step * 3_600_000).toISOString(),
          range: 'station',
        })),
        ...[0, 1, 2, 3].map((step) => ({
          order_id: typeId * 100 + 50 + step,
          type_id: typeId,
          location_id: 60_003_760,
          system_id: 30_000_142,
          is_buy_order: true,
          price: Math.round(buy * (1 - step * 0.021) * 100) / 100,
          volume_remain: 55 - step * 9,
          volume_total: 80,
          min_volume: 1,
          duration: 90,
          issued: new Date(Date.now() - step * 5_400_000).toISOString(),
          range: 'region',
        })),
      ]);
    }

    // Everything else is already seeded into `esiCache`; a request reaching
    // here means a surface this fixture does not cover, and it should fail
    // fast rather than hang the page's load event.
    await route.abort('blockedbyclient');
  });
}
