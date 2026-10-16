/**
 * Travel › Hauling fixtures: the Amarr → Jita "Ammunition & Charges" scan the
 * Hauling mockups were drawn from (`docs/design/mockups/README.md`), served as
 * the Fuzzwork, ESI market and pilot answers the real page asks for, so the
 * page story renders the live panel against known books.
 *
 * Each sample item is stated as the mockup states it — buy at Amarr, Expected
 * Sell at Jita, a week of sales, Days to Sell — and its order books and
 * history are worked back from the engine's own rules (`haulingMarket.ts`),
 * so the scan arrives at about those figures rather than having them typed
 * in. Any other item gets no hub price, so it drops out at the first pass.
 *
 * The fill items (other categories) are answered by type id like the ammo,
 * so a scan over any category finds whichever of them that category holds.
 */
import { HAULING_THRESHOLDS, type DemandKind } from '@/engine/market/haulingMarket';
import { outbidPrice, roundPriceDown, roundPriceUp } from '@/engine/market/priceTick';
import { SKILL_IDS } from '@/engine/industry/types';
import type { CharacterStanding, MarketHistoryEntry, RegionOrder } from '@/esi/endpoints';
import { TRADE_HUBS } from '@/market/hubs';
import type { HaulingCargo } from '@/features/market/haulingCargo';
import { walletFixtureRoutes } from './esiFixtureRoutes';
import type { FixtureRoute } from './fixtureFetch';

const hub = (id: string) => TRADE_HUBS.find((h) => h.id === id)!;
const AMARR = hub('amarr');
const JITA = hub('jita');

/** The scan's route, as the page's own query string. */
export const HAULING_PATH = '/travel/hauling?from=amarr&to=jita&cat=11';

/** A Mastodon's general hold, as the Cargo Space control saves a hull. */
export const MASTODON_CARGO: HaulingCargo = {
  label: 'Mastodon',
  holds: [{ kind: 'general', capacityM3: 64_500 }],
};

/** The wallet's scopes, plus what prices fees: standings and the two fee skills. */
export const HAULING_SCOPES: readonly string[] = [
  'esi-wallet.read_character_wallet.v1',
  'esi-characters.read_loyalty.v1',
  'esi-characters.read_standings.v1',
  'esi-skills.read_skills.v1',
];

interface SampleItem {
  typeId: number;
  /** Lowest sell at Amarr: what a unit costs. */
  buy: number;
  /** The Expected Sell Price at Jita: one tick under the cheapest listing. */
  sell: number;
  /** About a week of sales: the most worth bringing. */
  weekSales: number;
  daysToSell: number;
  demand: Exclude<DemandKind, 'rarely'>;
  /** Ten or more listings sit at the cheapest ask. */
  crowded?: boolean;
  /** The Jita sell ladder as [price, units], where the mockup gives one. */
  ladder?: Array<[number, number]>;
  /** Units sold per day, where the mockup gives one. */
  daily?: number;
  /** What it recently sold for, where the mockup gives one. */
  recentSale?: number;
}

type Row = [
  typeId: number,
  buy: number,
  sell: number,
  weekSales: number,
  daysToSell: number,
  demand?: SampleItem['demand'],
  crowded?: boolean,
];
const item = ([typeId, buy, sell, weekSales, daysToSell, demand = 'most-days', crowded]: Row) => ({
  typeId,
  buy,
  sell,
  weekSales,
  daysToSell,
  demand,
  crowded,
});

/**
 * The mockup's ammo rows. Its three "thin" rows are not thin here: the engine
 * reads "thin" as rarely sells, which the page's default filter hides.
 */
const AMMO: SampleItem[] = [
  item([21194, 302.4, 2492, 1, 1]), // Blood Radio S
  item([242, 2000, 9499, 2141, 1, 'most-days', true]), // Standard S
  item([24473, 21.71, 67.93, 800, 3]), // Nova Rage Rocket
  item([32782, 3, 6.7, 60_025, 1, 'most-days', true]), // Defender Missile I
  {
    // True Sanshas Gamma S: the item detail mockup's row, ladder and all.
    ...item([20861, 10_460_000, 23_160_000, 1, 9, 'bursts']),
    ladder: [
      [23_180_000, 1],
      [23_280_000, 3],
      [23_290_000, 1],
    ],
    daily: 20 / 30,
    recentSale: 23_167_500,
  },
  item([20853, 200_000, 372_400, 6, 1]), // True Sanshas Infrared S
  item([185, 13.82, 24.98, 100, 1]), // EMP S
  item([17650, 1000, 1699, 18_598, 2, 'bursts']), // Iridium Charge XL
  item([246, 5196, 8767, 7567, 3, 'most-days', true]), // Multifrequency S
  item([27391, 470, 1267, 34_414, 3]), // Guristas Scourge Cruise Missile
  item([46372, 548_000, 872_400, 51, 1]), // Exceptional Moon Mining Crystal Type A II
  item([241, 1499, 2797, 1625, 1]), // Infrared S
  item([20857, 3_999_000, 6_182_000, 1, 12]), // True Sanshas Ultraviolet S
  item([42829, 215.2, 330.4, 6658, 1]), // Mining Laser Field Enhancement Charge
  item([21286, 66_900_000, 99_990_000, 1, 11, 'bursts']), // Dark Blood Multifrequency M
  item([41518, 9977, 14_510, 64, 1]), // Armor Thermal Resistance Script
  item([42695, 323.1, 469.7, 5458, 2]), // Shield Harmonizing Charge
  item([21740, 1180, 1590, 9200, 2]), // Caldari Navy Antimatter Charge L
  item([230, 21.4, 28.9, 120_000, 1]), // Antimatter Charge M
  item([209, 118, 152, 44_000, 2]), // Scourge Heavy Missile
];

/** Bulky items from other categories: what filling the free space could load. */
const FILL: SampleItem[] = [
  item([4051, 18_450, 21_900, 1800, 1]), // Nitrogen Fuel Block
  item([4247, 18_900, 21_600, 1500, 1]), // Helium Fuel Block
  item([33475, 1_020_000, 1_329_000, 40, 2]), // Mobile Tractor Unit
  item([9848, 66_800, 78_400, 900, 2]), // Robotics
  item([2456, 96_500, 118_900, 700, 2]), // Hobgoblin II
  item([16275, 2950, 3610, 1600, 3, 'bursts']), // Strontium Clathrates
  item([3841, 1_210_000, 1_445_000, 120, 3]), // Large Shield Extender II
  item([9832, 9800, 11_650, 2600, 1]), // Coolant
];

/** A price level of one side of a book: `orders` orders sharing `units`. */
interface Level {
  price: number;
  units: number;
  orders: number;
}

interface ItemMarket {
  /** Amarr's sell side, cheapest first. */
  originSell: Level[];
  /** Jita's sell side, cheapest first. */
  destSell: Level[];
  /** Jita's best bid: what an instant sale realises. */
  destBuy: Level;
  history: (today: number) => MarketHistoryEntry[];
}

const DAY_MS = 86_400_000;
const T = HAULING_THRESHOLDS;

/**
 * Units sold per day and units listed ahead of the hauler that make the
 * engine read about `weekSales` and `daysToSell` (`estimateSale`): a short
 * search over the month's volume, since both figures round.
 */
function sizeDemand(
  weekSales: number,
  daysToSell: number,
  minMonthly: number
): { daily: number; ahead: number } {
  const guess =
    daysToSell < T.horizonDays
      ? (weekSales / T.ownShareOfDemand / (T.horizonDays + 1 - daysToSell)) * T.historyDays
      : minMonthly;
  const low = Math.max(minMonthly, Math.floor(guess * 0.7));
  const high = Math.max(Math.ceil(guess * 1.5), minMonthly * 2);
  const step = Math.max(1, Math.floor((high - low) / 400));
  let best = { daily: low / T.historyDays, ahead: 1, error: Infinity };
  for (let monthly = low; monthly <= high; monthly += step) {
    const daily = monthly / T.historyDays;
    const lot = Math.max(1, Math.ceil(daily));
    const ahead = Math.max(1, Math.round(daysToSell * daily - lot));
    const week = Math.max(
      1,
      Math.floor(Math.max(0, daily * T.horizonDays - ahead) * T.ownShareOfDemand)
    );
    const days = (ahead + lot) / daily;
    const error = Math.abs(week - weekSales) / weekSales + Math.abs(days - daysToSell) / daysToSell;
    if (error < best.error) best = { daily, ahead, error };
  }
  return best;
}

const tick = (price: number, factor: number) => roundPriceUp(price * factor) ?? price;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Spreads `monthly` units over `days` trading days, ending yesterday; every second day for bursts. */
function history(
  monthly: number,
  days: number,
  every: number,
  average: number
): (today: number) => MarketHistoryEntry[] {
  return (today) =>
    Array.from({ length: days }, (_, i) => {
      const volume = Math.floor(monthly / days) + (i < monthly % days ? 1 : 0);
      return {
        date: isoDay(today - (1 + i * every) * DAY_MS),
        average,
        highest: tick(average, 1.01),
        lowest: roundPriceDown(average * 0.99) ?? average,
        order_count: Math.max(3, Math.min(400, Math.ceil(volume / 25))),
        volume,
      };
    }).reverse();
}

function marketOf(sample: SampleItem): ItemMarket {
  const mostDays = sample.demand === 'most-days';
  // Enough trading days to read as the mockup's demand, and units to fill them.
  const minMonthly = mostDays ? T.mostDaysMin : T.burstsMin;
  const sized =
    sample.daily !== undefined
      ? { daily: sample.daily, ahead: sample.ladder!.reduce((sum, [, units]) => sum + units, 0) }
      : sizeDemand(sample.weekSales, sample.daysToSell, minMonthly);
  const monthly = Math.round(sized.daily * T.historyDays);
  const tradingDays = Math.min(monthly, mostDays ? 26 : 12);

  const lowestAsk = outbidPrice(sample.sell) ?? sample.sell;
  const ahead = sample.crowded ? Math.max(sized.ahead, T.crowdedOrderCount + 2) : sized.ahead;
  const destSell: Level[] = sample.ladder
    ? sample.ladder.map(([price, units]) => ({ price, units, orders: 1 }))
    : [
        {
          price: lowestAsk,
          units: ahead,
          orders: sample.crowded ? T.crowdedOrderCount + 2 : Math.min(ahead, 3),
        },
        // Deeper levels sit outside the crowded band: competition, not ahead of you.
        { price: tick(lowestAsk, 1.03), units: sample.weekSales + 5, orders: 2 },
        { price: tick(lowestAsk, 1.08), units: sample.weekSales * 2 + 5, orders: 4 },
      ];
  const depth = sample.weekSales * 4 + 10;
  return {
    originSell: [
      { price: sample.buy, units: depth, orders: 6 },
      { price: tick(sample.buy, 1.04), units: Math.ceil(depth / 2), orders: 3 },
    ],
    destSell,
    destBuy: {
      price: Math.min(
        roundPriceDown(sample.buy * 1.12) ?? sample.buy,
        roundPriceDown(sample.sell * 0.95) ?? sample.sell
      ),
      units: sample.weekSales,
      orders: 2,
    },
    history: history(
      monthly,
      tradingDays,
      mostDays ? 1 : 2,
      sample.recentSale ?? tick(sample.sell, 1.003)
    ),
  };
}

const MARKETS = new Map<number, ItemMarket>(
  [...AMMO, ...FILL].map((sample) => [sample.typeId, marketOf(sample)])
);

/** One Fuzzwork side, from a level list: cheapest ask or dearest bid. */
function aggregateSide(levels: Level[], pick: 'min' | 'max') {
  const prices = levels.map((l) => l.price);
  return {
    [pick]: pick === 'min' ? Math.min(...prices) : Math.max(...prices),
    volume: levels.reduce((sum, l) => sum + l.units, 0),
    orderCount: levels.reduce((sum, l) => sum + l.orders, 0),
  };
}

function aggregatesAt(stationId: number, typeIds: readonly number[]) {
  const entries = typeIds.flatMap((typeId) => {
    const market = MARKETS.get(typeId);
    if (!market) return [];
    if (stationId === AMARR.stationId) {
      return [[typeId, { sell: aggregateSide(market.originSell, 'min') }]];
    }
    if (stationId === JITA.stationId) {
      return [
        [
          typeId,
          {
            sell: aggregateSide(market.destSell, 'min'),
            buy: aggregateSide([market.destBuy], 'max'),
          },
        ],
      ];
    }
    return [];
  });
  return Object.fromEntries(entries);
}

function ordersIn(regionId: number, typeId: number, now: number): RegionOrder[] {
  const market = MARKETS.get(typeId);
  if (!market) return [];
  const at = regionId === AMARR.regionId ? AMARR : regionId === JITA.regionId ? JITA : null;
  if (!at) return [];
  const book: Array<[Level, boolean]> =
    at === AMARR
      ? market.originSell.map((level) => [level, false])
      : [
          ...market.destSell.map((level): [Level, boolean] => [level, false]),
          [market.destBuy, true],
        ];
  let orderId = 6_400_000_000 + typeId * 100;
  return book
    .flatMap(([level, isBuy]) =>
      Array.from({ length: level.orders }, (_, i) => {
        const units =
          Math.floor(level.units / level.orders) + (i < level.units % level.orders ? 1 : 0);
        return {
          order_id: orderId++,
          type_id: typeId,
          is_buy_order: isBuy,
          price: level.price,
          volume_remain: units,
          volume_total: units,
          min_volume: 1,
          location_id: at.stationId,
          system_id: at.systemId,
          range: isBuy ? 'station' : 'region',
          duration: 90,
          issued: new Date(now - (i + 1) * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        };
      })
    )
    .filter((order) => order.volume_remain > 0);
}

/** Accounting IV, Broker Relations IV, +5 toward the Caldari State: the mockup's 4.20% tax and 1.65% broker fee at Jita. */
const SKILLS = [
  {
    skill_id: SKILL_IDS.accounting,
    trained_skill_level: 4,
    active_skill_level: 4,
    skillpoints_in_skill: 45_255,
  },
  {
    skill_id: SKILL_IDS.brokerRelations,
    trained_skill_level: 4,
    active_skill_level: 4,
    skillpoints_in_skill: 90_510,
  },
];
const STANDINGS: CharacterStanding[] = [
  { from_id: JITA.ownerFactionId, from_type: 'faction', standing: 5 },
];

export function haulingFixtureRoutes(): FixtureRoute[] {
  const own = String.raw`^/characters/\d+`;
  const at = (tail: string) => new RegExp(`${own}${tail}$`);
  const typeIdOf = (url: URL) => Number(url.searchParams.get('type_id'));
  const regionOf = (url: URL) => Number(url.pathname.split('/')[2]);
  return [
    ...walletFixtureRoutes(),
    { path: at('/standings/'), respond: () => ({ body: STANDINGS }) },
    {
      path: at('/skills'),
      respond: () => ({ body: { skills: SKILLS, total_sp: 135_765 } }),
    },
    // Read alongside the skills (queue-corrected levels, clone implants): nothing training, no implants.
    { path: at('/skillqueue'), respond: () => ({ body: [] }) },
    { path: at('/implants'), respond: () => ({ body: [] }) },
    {
      path: '/aggregates/',
      respond: ({ url }) => ({
        body: aggregatesAt(
          Number(url.searchParams.get('station')),
          (url.searchParams.get('types') ?? '').split(',').map(Number)
        ),
      }),
    },
    {
      path: /^\/markets\/\d+\/history$/,
      respond: ({ url }) => ({
        body:
          regionOf(url) === JITA.regionId
            ? (MARKETS.get(typeIdOf(url))?.history(Date.now()) ?? [])
            : [],
      }),
    },
    {
      path: /^\/markets\/\d+\/orders$/,
      respond: ({ url }) => ({
        body: ordersIn(regionOf(url), typeIdOf(url), Date.now()),
        headers: { 'X-Pages': '1' },
      }),
    },
  ];
}
