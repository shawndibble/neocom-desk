/**
 * Sample books for the Compare drawer "Trade hubs" mockup (issue #4696): four
 * large shield extenders priced at every Trade Hub, served as ESI region
 * orders so the real Market Browser and today's Prices view render them, and
 * read directly by the proposed view (a mockup draws, it does not fetch).
 */
import type { RegionOrder } from '@/esi/endpoints';
import { COMPARED_HUBS, type ComparedHub, type ComparedHubId } from '@/market/hubs';
import { walletFixtureRoutes } from '@/storybook/esiFixtureRoutes';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { sampleDate } from '@/storybook/sampleData';
import { HOUR_MS } from '@/lib/age';

export interface SampleCompareItem {
  typeId: number;
  itemName: string;
}

export const COMPARE_ITEMS: readonly SampleCompareItem[] = [
  { typeId: 3841, itemName: 'Large Shield Extender II' },
  { typeId: 31930, itemName: 'Caldari Navy Large Shield Extender' },
  { typeId: 31932, itemName: 'Republic Fleet Large Shield Extender' },
  { typeId: 2281, itemName: 'Multispectrum Shield Hardener II' },
];

/** Best sell / best buy at a hub; null = no orders on that side. */
export interface HubQuote {
  sell: number | null;
  buy: number | null;
  /** Units listed at the best sell and above, for the volume line. */
  sellVolume: number;
}

type HubId = ComparedHubId;

/** Plausible October 2026 figures: Jita cheapest for most, a Rens dip, an empty Hek book. */
export const HUB_QUOTES: Readonly<Record<number, Readonly<Record<HubId, HubQuote>>>> = {
  3841: {
    jita: { sell: 1_289_000, buy: 1_102_000, sellVolume: 2_431 },
    amarr: { sell: 1_349_900, buy: 1_050_000, sellVolume: 612 },
    dodixie: { sell: 1_420_000, buy: 980_100, sellVolume: 188 },
    rens: { sell: 1_265_000, buy: 1_001_000, sellVolume: 74 },
    hek: { sell: 1_499_000, buy: 905_000, sellVolume: 41 },
  },
  31930: {
    jita: { sell: 9_480_000, buy: 8_710_000, sellVolume: 96 },
    amarr: { sell: 10_250_000, buy: 8_900_000, sellVolume: 14 },
    dodixie: { sell: 11_900_000, buy: 7_500_000, sellVolume: 5 },
    rens: { sell: null, buy: 6_800_000, sellVolume: 0 },
    hek: { sell: 12_400_000, buy: null, sellVolume: 3 },
  },
  31932: {
    jita: { sell: 6_390_000, buy: 5_820_000, sellVolume: 58 },
    amarr: { sell: 6_850_000, buy: 5_600_000, sellVolume: 11 },
    dodixie: { sell: 7_150_000, buy: 5_450_000, sellVolume: 7 },
    rens: { sell: 5_990_000, buy: 6_010_000, sellVolume: 22 },
    hek: { sell: 6_700_000, buy: 5_100_000, sellVolume: 9 },
  },
  2281: {
    jita: { sell: 1_018_000, buy: 925_500, sellVolume: 3_870 },
    amarr: { sell: 1_045_000, buy: 931_000, sellVolume: 940 },
    dodixie: { sell: 1_150_000, buy: 870_000, sellVolume: 205 },
    rens: { sell: 1_099_000, buy: 880_000, sellVolume: 166 },
    hek: { sell: 1_120_000, buy: 851_000, sellVolume: 98 },
  },
};

/** Jumps from the pilot (docked in Perimeter, next door to Jita), shortest safe route. */
export const HUB_JUMPS: Readonly<Record<HubId, number>> = {
  jita: 1,
  amarr: 12,
  dodixie: 16,
  rens: 20,
  hek: 16,
};

function ordersAt(hub: ComparedHub, typeId: number, now: number): RegionOrder[] {
  const quote = HUB_QUOTES[typeId]?.[hub.id];
  if (!quote) return [];
  let orderId = 7_100_000_000 + typeId * 10 + COMPARED_HUBS.indexOf(hub) * 1_000_000;
  const order = (isBuy: boolean, price: number, units: number, ageHours: number): RegionOrder => ({
    order_id: orderId++,
    type_id: typeId,
    is_buy_order: isBuy,
    price,
    volume_remain: units,
    volume_total: units,
    min_volume: 1,
    location_id: hub.stationId,
    system_id: hub.systemId,
    range: isBuy ? 'station' : 'region',
    duration: 90,
    issued: sampleDate(ageHours * HOUR_MS, now),
  });
  const orders: RegionOrder[] = [];
  if (quote.sell !== null) {
    const top = Math.max(1, Math.round(quote.sellVolume * 0.4));
    orders.push(order(false, quote.sell, top, 2));
    orders.push(order(false, Math.round(quote.sell * 1.012), quote.sellVolume - top || 1, 9));
  }
  if (quote.buy !== null) {
    orders.push(order(true, quote.buy, 40, 3));
    orders.push(order(true, Math.round(quote.buy * 0.97), 120, 20));
  }
  return orders;
}

export function compareHubFixtureRoutes(): FixtureRoute[] {
  const regionOf = (url: URL) => Number(url.pathname.split('/')[2]);
  const at = (tail: string) => new RegExp(String.raw`^/characters/\d+${tail}$`);
  return [
    ...walletFixtureRoutes(),
    // Read for the after-fees column: no standings, no fee skills trained.
    { path: at('/standings/'), respond: () => ({ body: [] }) },
    { path: at('/skills'), respond: () => ({ body: { skills: [], total_sp: 0 } }) },
    { path: at('/skillqueue'), respond: () => ({ body: [] }) },
    { path: at('/implants'), respond: () => ({ body: [] }) },
    // Docked in Perimeter, one jump from Jita.
    { path: at('/location'), respond: () => ({ body: { solar_system_id: 30000144 } }) },
    {
      path: /^\/universe\/types\/\d+$/,
      respond: ({ url }) => {
        const typeId = Number(url.pathname.split('/')[3]);
        const item = COMPARE_ITEMS.find((i) => i.typeId === typeId);
        return {
          body: {
            type_id: typeId,
            name: item?.itemName ?? `Type ${typeId}`,
            description: '',
            published: true,
            group_id: 0,
            dogma_attributes: [],
            dogma_effects: [],
          },
        };
      },
    },
    {
      path: /^\/markets\/\d+\/orders$/,
      respond: ({ url }) => {
        const hub = COMPARED_HUBS.find((h) => h.regionId === regionOf(url));
        const typeId = Number(url.searchParams.get('type_id'));
        return { body: hub ? ordersAt(hub, typeId, Date.now()) : [], headers: { 'X-Pages': '1' } };
      },
    },
    { path: /^\/markets\/\d+\/history$/, respond: () => ({ body: [] }) },
  ];
}
