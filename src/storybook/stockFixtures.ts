/**
 * Market › Stock fixtures: three markets the sample pilot keeps stocked, the
 * sell orders and hangar stock behind them, and Jita prices, plus the ESI and
 * Fuzzwork routes that serve them.
 */
import type { StockList } from '@/engine/stockTargets/stockLists';
import type { CharacterAsset, CharacterBlueprint, MarketOrder } from '@/esi/endpoints';
import { walletFixtureRoutes } from './esiFixtureRoutes';
import type { FixtureRoute } from './fixtureFetch';
import { SAMPLE_CHARACTERS, sampleDate } from './sampleData';
import { DAY_MS } from '@/lib/age';

/** Dodixie IX - Moon 20 - Federation Navy Assembly Plant. */
const DODIXIE = 60011866;
/** Hek VIII - Moon 12 - Boundless Creation Factory. */
const HEK = 60005686;
/** A player Fortizar in Tama. */
const TAMA_FORT = 1_035_466_617_946;
const TAMA_SYSTEM = 30002813;

export const STOCK_SCOPES: readonly string[] = [
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-markets.read_character_orders.v1',
  'esi-universe.read_structures.v1',
  'esi-characters.read_blueprints.v1',
];

/** [typeId, target, listed, inHangar, Jita sell price] */
type Line = [number, number, number, number, number];

const DODIXIE_LINES: Line[] = [
  [2185, 50, 0, 0, 1_150_000], // Hammerhead II: out
  [2488, 100, 0, 40, 520_000], // Warrior II: out, hangar part covers it
  [2456, 60, 12, 0, 640_000], // Hobgoblin II: low
  [2048, 20, 4, 20, 610_000], // Damage Control II: low, hangar covers it
  [3831, 30, 31, 0, 1_890_000], // Medium Shield Extender II: ok
  [28668, 5_000, 1_200, 2_000, 11_800], // Nanite Repair Paste: low
  [222, 20_000, 26_000, 0, 32], // Antimatter Charge S: over
  [12608, 10_000, 9_400, 0, 610], // Hail S: ok
  [31718, 25, 25, 5, 410_000], // Medium EM Shield Reinforcer I: ok
  [11269, 15, 0, 0, 2_250_000], // Multispectrum Energized Membrane II: out
  [1999, 40, 22, 0, 930_000], // Tracking Enhancer II: low
  [2281, 30, 30, 0, 1_420_000], // Multispectrum Shield Hardener II: ok
  [3841, 25, 10, 15, 3_250_000], // Large Shield Extender II: low, hangar fills it
  [4405, 40, 44, 0, 1_210_000], // Drone Damage Amplifier II: over
  [12058, 15, 15, 0, 680_000], // 10MN Afterburner II: ok
];

const HEK_LINES: Line[] = [
  [2185, 20, 20, 0, 1_150_000],
  [2048, 10, 11, 0, 610_000],
  [28668, 2_000, 1_400, 0, 11_800],
  [3841, 10, 10, 2, 3_250_000],
];

const TAMA_LINES: Line[] = [
  [2488, 50, 50, 0, 520_000],
  [4405, 20, 20, 0, 1_210_000],
  [222, 10_000, 12_000, 0, 32],
];

const MARKETS: Array<{ id: string; name: string; locationId: number; lines: Line[] }> = [
  {
    id: 'sample-dodixie',
    name: 'Dodixie Federation Navy hub restock',
    locationId: DODIXIE,
    lines: DODIXIE_LINES,
  },
  { id: 'sample-hek', name: 'Hek seed', locationId: HEK, lines: HEK_LINES },
  { id: 'sample-tama', name: 'Tama staging', locationId: TAMA_FORT, lines: TAMA_LINES },
];

export const SAMPLE_STOCK_LISTS: readonly StockList[] = MARKETS.map((m) => ({
  id: m.id,
  name: m.name,
  locationId: m.locationId,
  items: m.lines.map(([typeId, target]) => ({ typeId, target })),
}));

const SELLER = SAMPLE_CHARACTERS[0].characterId;

function sellOrders(now = Date.now()): MarketOrder[] {
  let id = 6_200_000_000;
  return MARKETS.flatMap((m) =>
    m.lines
      .filter(([, , listed]) => listed > 0)
      .map(([typeId, , listed, , price]) => ({
        order_id: id++,
        type_id: typeId,
        region_id: 10000032,
        location_id: m.locationId,
        is_corporation: false,
        price: Math.round(price * 1.18),
        volume_remain: listed,
        volume_total: listed,
        issued: sampleDate(3 * DAY_MS, now),
        duration: 90,
        range: 'station',
      }))
  );
}

function hangarAssets(): CharacterAsset[] {
  let id = 1_044_000_000_000;
  return MARKETS.flatMap((m) =>
    m.lines
      .filter(([, , , inHangar]) => inHangar > 0)
      .map(([typeId, , , inHangar]) => ({
        item_id: id++,
        type_id: typeId,
        quantity: inHangar,
        location_id: m.locationId,
        location_type: m.locationId > 100_000_000 ? ('item' as const) : ('station' as const),
        location_flag: 'Hangar',
        is_singleton: false,
      }))
  );
}

/** A Hammerhead II original and a Hail S copy, so Builder has something to build. */
function blueprints(): CharacterBlueprint[] {
  return [
    { type_id: 2186, runs: -1, material_efficiency: 10, time_efficiency: 20 },
    { type_id: 12609, runs: 40, material_efficiency: 8, time_efficiency: 16 },
  ].map((bp, index) => ({
    ...bp,
    item_id: 1_045_000_000_000 + index,
    quantity: bp.runs === -1 ? -1 : -2,
    location_id: DODIXIE,
    location_flag: 'Hangar',
  }));
}

const PRICES = new Map(MARKETS.flatMap((m) => m.lines.map(([typeId, , , , p]) => [typeId, p])));

const STATIONS: Record<number, { name: string; system_id: number; type_id: number }> = {
  [DODIXIE]: {
    name: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant',
    system_id: 30002659,
    type_id: 1529,
  },
  [HEK]: {
    name: 'Hek VIII - Moon 12 - Boundless Creation Factory',
    system_id: 30002053,
    type_id: 1529,
  },
};

const SYSTEMS: Record<number, { name: string; security_status: number }> = {
  30002659: { name: 'Dodixie', security_status: 0.87 },
  30002053: { name: 'Hek', security_status: 0.5 },
  [TAMA_SYSTEM]: { name: 'Tama', security_status: 0.3 },
};

export function stockFixtureRoutes(): FixtureRoute[] {
  const own = String.raw`^/characters/(\d+)`;
  const at = (tail: string) => new RegExp(`${own}${tail}$`);
  const isSeller = (path: string) => Number(at('/.*').exec(path)?.[1]) === SELLER;
  return [
    ...walletFixtureRoutes(),
    {
      path: at('/blueprints'),
      respond: ({ url }) => ({
        body: isSeller(url.pathname) ? blueprints() : [],
        headers: { 'X-Pages': '1' },
      }),
    },
    {
      path: at('/location'),
      respond: () => ({ body: { solar_system_id: 30002659, station_id: DODIXIE } }),
    },
    { path: at('/skills'), respond: () => ({ body: { skills: [], total_sp: 0 } }) },
    {
      path: at('/assets'),
      respond: ({ url }) => ({
        body: isSeller(url.pathname) ? hangarAssets() : [],
        headers: { 'X-Pages': '1' },
      }),
    },
    {
      path: at('/orders'),
      respond: ({ url }) => ({ body: isSeller(url.pathname) ? sellOrders() : [] }),
    },
    {
      path: /^\/universe\/stations\/(\d+)$/,
      respond: ({ url }) => ({ body: STATIONS[Number(url.pathname.split('/').at(-1))] }),
    },
    {
      path: /^\/universe\/systems\/(\d+)$/,
      respond: ({ url }) => {
        const id = Number(url.pathname.split('/').at(-1));
        return { body: { system_id: id, ...SYSTEMS[id] } };
      },
    },
    {
      path: /^\/universe\/structures\/(\d+)$/,
      respond: () => ({
        body: {
          name: 'Tama - Brass Meridian Fortizar',
          owner_id: 98765432,
          solar_system_id: TAMA_SYSTEM,
          type_id: 35833,
        },
      }),
    },
    {
      path: '/aggregates/',
      respond: ({ url }) => ({
        body: Object.fromEntries(
          (url.searchParams.get('types') ?? '')
            .split(',')
            .map(Number)
            .map((typeId) => [
              typeId,
              {
                sell: { min: PRICES.get(typeId) ?? 0, volume: 5_000, orderCount: 12 },
                buy: { max: (PRICES.get(typeId) ?? 0) * 0.85, volume: 5_000, orderCount: 8 },
              },
            ])
        ),
      }),
    },
  ];
}
