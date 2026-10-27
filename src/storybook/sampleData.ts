/**
 * Realistic EVE fixtures shared by page stories and mockups. Typed with the
 * ESI shapes the app reads, so a fixture that drifts from ESI fails typecheck.
 * Pure data: no Dexie, no fetch. Dates are relative to `now` so recent-first
 * tables and "x hours ago" copy stay plausible whenever a story is opened.
 */
import type {
  CharacterAsset,
  CharacterLoyaltyPoints,
  IndustryJob,
  MarketOrder,
  WalletJournalEntry,
} from '@/esi/endpoints';

export interface SampleCharacter {
  characterId: number;
  name: string;
  corporationId: number;
  corporationName: string;
}

/** First entry is the signed-in (active) Character. */
export const SAMPLE_CHARACTERS: readonly SampleCharacter[] = [
  {
    characterId: 2119876543,
    name: 'Kestrel Vane',
    corporationId: 98765432,
    corporationName: 'Brass Meridian Logistics',
  },
  {
    characterId: 2119876544,
    name: 'Orsa Tellemar',
    corporationId: 98765432,
    corporationName: 'Brass Meridian Logistics',
  },
];

export const SAMPLE_ACTIVE_CHARACTER = SAMPLE_CHARACTERS[0];

/** Jita IV - Moon 4 - Caldari Navy Assembly Plant. */
export const SAMPLE_STATION_ID = 60003760;
export const SAMPLE_REGION_ID = 10000002;

export const SAMPLE_WALLET_BALANCE = 1_284_390_551.17;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** ISO timestamp `ms` before `now`, the way ESI formats dates (no fractional seconds). */
export function sampleDate(ms: number, now = Date.now()): string {
  return new Date(now - ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Newest first, like ESI. `balance` is the running balance after each line. */
export function sampleWalletJournal(now = Date.now()): WalletJournalEntry[] {
  const lines: Array<Omit<WalletJournalEntry, 'id' | 'date' | 'balance'> & { ago: number }> = [
    {
      ago: 2 * HOUR,
      ref_type: 'market_transaction',
      description: 'Market: Kestrel Vane bought 40 x Tritanium from Orsa Tellemar',
      amount: -412_000,
    },
    {
      ago: 5 * HOUR,
      ref_type: 'bounty_prizes',
      description: 'Bounty prizes for killing pirates in Hek',
      amount: 18_450_000,
      tax: 2_050_000,
    },
    {
      ago: 9 * HOUR,
      ref_type: 'industry_job_tax',
      description: 'Industry job tax',
      amount: -1_212_345.5,
    },
    {
      ago: 1 * DAY,
      ref_type: 'market_escrow',
      description: 'Escrow for buy order',
      amount: -96_800_000,
    },
    {
      ago: 1 * DAY + 4 * HOUR,
      ref_type: 'player_donation',
      description: 'Orsa Tellemar donated cash to Kestrel Vane',
      amount: 250_000_000,
      reason: 'Fuel run split',
    },
    {
      ago: 2 * DAY,
      ref_type: 'brokers_fee',
      description: 'Broker fee for order #6120945871',
      amount: -1_904_212.4,
    },
    {
      ago: 3 * DAY,
      ref_type: 'contract_reward',
      description: 'Courier contract reward',
      amount: 42_000_000,
    },
    {
      ago: 4 * DAY,
      ref_type: 'planetary_import_tax',
      description: 'Planetary import tax',
      amount: -310_520.75,
    },
  ];
  let balance = SAMPLE_WALLET_BALANCE;
  return lines.map(({ ago, ...line }, index) => {
    const entry: WalletJournalEntry = {
      id: 18_900_000_000 - index,
      date: sampleDate(ago, now),
      ...line,
      balance,
    };
    balance -= line.amount ?? 0;
    return entry;
  });
}

export const SAMPLE_LOYALTY_POINTS: readonly CharacterLoyaltyPoints[] = [
  { corporation_id: 1000167, loyalty_points: 48_250 },
  { corporation_id: 1000419, loyalty_points: 1_320 }, // Paragon: EverMarks
];

export const SAMPLE_CORPORATION_NAMES: Readonly<Record<number, string>> = {
  1000167: 'Caldari Navy',
  1000419: 'Paragon',
  98765432: 'Brass Meridian Logistics',
};

export function sampleMarketOrders(now = Date.now()): MarketOrder[] {
  return [
    {
      order_id: 6_120_945_871,
      type_id: 34,
      region_id: SAMPLE_REGION_ID,
      location_id: SAMPLE_STATION_ID,
      is_buy_order: true,
      is_corporation: false,
      price: 4.12,
      volume_remain: 18_000_000,
      volume_total: 25_000_000,
      issued: sampleDate(1 * DAY, now),
      duration: 90,
      range: 'region',
      min_volume: 1,
      escrow: 74_160_000,
    },
    {
      order_id: 6_120_881_204,
      type_id: 11399,
      region_id: SAMPLE_REGION_ID,
      location_id: SAMPLE_STATION_ID,
      is_corporation: false,
      price: 34_900_000,
      volume_remain: 3,
      volume_total: 5,
      issued: sampleDate(6 * DAY, now),
      duration: 90,
      range: 'region',
    },
  ];
}

export function sampleAssets(): CharacterAsset[] {
  return [
    {
      item_id: 1_043_000_000_001,
      type_id: 34,
      quantity: 2_400_000,
      location_id: SAMPLE_STATION_ID,
      location_type: 'station',
      location_flag: 'Hangar',
      is_singleton: false,
    },
    {
      item_id: 1_043_000_000_002,
      type_id: 648,
      quantity: 1,
      location_id: SAMPLE_STATION_ID,
      location_type: 'station',
      location_flag: 'Hangar',
      is_singleton: true,
    },
  ];
}

export function sampleIndustryJobs(now = Date.now()): IndustryJob[] {
  return [
    {
      job_id: 512_330_901,
      activity_id: 1,
      blueprint_type_id: 11400,
      facility_id: 1_035_466_617_946,
      station_id: 1_035_466_617_946,
      runs: 10,
      start_date: sampleDate(5 * HOUR, now),
      end_date: new Date(now + 7 * HOUR).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      status: 'active',
      cost: 1_240_500,
      licensed_runs: 10,
      product_type_id: 11399,
    },
  ];
}

const PORTRAIT_HUES = [212, 28, 160, 340, 270, 95];

/**
 * An offline stand-in for the Character's `images.evetech.net` portrait: an
 * initial on a hue chosen from the name, as a data URI, so a story needs no
 * image request. Same name, same tile.
 */
export function samplePortraitDataUri(name: string): string {
  const hue = PORTRAIT_HUES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 6];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">` +
    `<rect width="128" height="128" fill="hsl(${hue} 35% 28%)"/>` +
    `<text x="64" y="84" font-size="64" text-anchor="middle" fill="hsl(${hue} 30% 80%)" ` +
    `font-family="sans-serif">${name[0]}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
