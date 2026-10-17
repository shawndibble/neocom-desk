/**
 * Shared sample orders for the Open Orders mockups (Forms A, B, C and Today).
 * Flat view model: each field is something the page or the Order Detail modal
 * already shows today, so a mockup only decides where it goes.
 */

/** The 7 row states the page groups by today, worst first. */
export type OrderState =
  | 'belowFloor'
  | 'undercutStation'
  | 'undercutSystem'
  | 'undercutRegion'
  | 'expiring'
  | 'outbid'
  | 'notChecked'
  | 'healthy';

/** Needs the pilot now / worth a look / fine. */
export type Urgency = 'act' | 'watch' | 'fine';

export interface ScopeRival {
  scope: 'Station' | 'System' | 'Region';
  seller: string;
  price: number;
  sellersUnder: number;
  unitsUnder: number;
  overByIsk: number;
  overByPct: number;
  distance: string;
}

export interface Exit {
  label: string;
  netPerUnit: number;
  detail?: string;
}

export interface MockOrder {
  id: number;
  character: 'Kestrel Vane' | 'Orsa Tellemar';
  characterId: number;
  item: string;
  typeId: number;
  side: 'sell' | 'buy';
  price: number;
  remain: number;
  total: number;
  station: string;
  stationShort: string;
  offHub?: boolean;
  expiresDays: number;
  expiresOn: string;
  issuedOn: string;
  state: OrderState;
  /** The badge text today: "Station", "Below floor", "Expiring"… */
  badge: string;
  /** Badge detail: "-8.4%", "3d". */
  badgeDetail?: string;
  /** Short plain verdict: what to do. */
  verdict: string;
  /** One-sentence why, under the verdict. */
  verdictDetail: string;
  /** Exact price to type in EVE, when there is one. */
  nextPrice?: number;
  /** ISK a unit after fees at nextPrice (or as listed when no nextPrice). */
  netPerUnit?: number;
  /** Rounded-up relist floor ("Never sell below"). */
  floor?: number;
  floorSource?: 'wallet' | 'build';
  /** price × remain */
  iskTiedUp: number;
  rankAtStation: string;
  sellsOutIn: string;
  perDay: string;
  rivals: ScopeRival[];
  costPerUnit?: number;
  salesTax?: number;
  brokerFee?: number;
  exits: Exit[];
}

export const CHARACTERS = [
  { id: 2119876543, name: 'Kestrel Vane' },
  { id: 2119876544, name: 'Orsa Tellemar' },
] as const;

const KV = { character: 'Kestrel Vane', characterId: 2119876543 } as const;
const OT = { character: 'Orsa Tellemar', characterId: 2119876544 } as const;
const JITA = {
  station: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
  stationShort: 'Jita 4-4',
};
const AMARR = { station: 'Amarr VIII (Oris) - Emperor Family Academy', stationShort: 'Amarr 8' };
const DODIXIE = {
  station: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant',
  stationShort: 'Dodixie 9-20',
};

const clear = (scope: ScopeRival['scope']): ScopeRival => ({
  scope,
  seller: '',
  price: 0,
  sellersUnder: 0,
  unitsUnder: 0,
  overByIsk: 0,
  overByPct: 0,
  distance: '',
});

export const ORDERS: MockOrder[] = [
  {
    id: 1,
    ...KV,
    item: 'Hurricane',
    typeId: 24702,
    side: 'sell',
    price: 74_900_000,
    remain: 3,
    total: 5,
    ...JITA,
    expiresDays: 61,
    expiresOn: '16 Dec 2026',
    issuedOn: '16 Oct 2026',
    state: 'belowFloor',
    badge: 'Below floor',
    badgeDetail: '-6.2%',
    verdict: 'Put the price up',
    verdictDetail:
      'Every unit sells for 4,650,000 ISK less than it cost you. Put it back up to 79,550,000.',
    nextPrice: 79_550_000,
    netPerUnit: -4_650_000,
    floor: 79_550_000,
    floorSource: 'build',
    iskTiedUp: 224_700_000,
    rankAtStation: 'rank 1 of 9 at this station',
    sellsOutIn: '2 days',
    perDay: '≈1.4/day',
    rivals: [clear('Station'), clear('System'), clear('Region')],
    costPerUnit: 76_210_000,
    salesTax: 2_696_400,
    brokerFee: 640_000,
    exits: [
      { label: 'Hold at your price', netPerUnit: -4_650_000 },
      { label: 'Sell to the best buy order', netPerUnit: -9_120_000, detail: '71,400,000 in Jita' },
      { label: 'Haul to Amarr', netPerUnit: 1_220_000, detail: '81,900,000 · 9 jumps' },
    ],
  },
  {
    id: 2,
    ...KV,
    item: 'Large Shield Extender II',
    typeId: 3841,
    side: 'sell',
    price: 4_890_000,
    remain: 42,
    total: 60,
    ...JITA,
    expiresDays: 74,
    expiresOn: '29 Dec 2026',
    issuedOn: '14 Oct 2026',
    state: 'undercutStation',
    badge: 'Station',
    badgeDetail: '-8.4%',
    verdict: 'Undercut to 4,479,900',
    verdictDetail: 'Undercutting to 4,479,900 still leaves you 612,400 ISK a unit after fees.',
    nextPrice: 4_479_900,
    netPerUnit: 612_400,
    floor: 3_867_500,
    floorSource: 'wallet',
    iskTiedUp: 205_380_000,
    rankAtStation: 'rank 4 of 11 at this station',
    sellsOutIn: '6 days',
    perDay: '≈7/day',
    rivals: [
      {
        scope: 'Station',
        seller: 'Jita 4-4',
        price: 4_480_000,
        sellersUnder: 3,
        unitsUnder: 118,
        overByIsk: 410_000,
        overByPct: 8.4,
        distance: 'Same station',
      },
      {
        scope: 'System',
        seller: 'Jita 4-4',
        price: 4_480_000,
        sellersUnder: 3,
        unitsUnder: 118,
        overByIsk: 410_000,
        overByPct: 8.4,
        distance: 'Same station',
      },
      {
        scope: 'Region',
        seller: 'Perimeter - Tranquility Trading Tower',
        price: 4_310_000,
        sellersUnder: 6,
        unitsUnder: 240,
        overByIsk: 580_000,
        overByPct: 11.9,
        distance: '1 jump',
      },
    ],
    costPerUnit: 3_610_000,
    salesTax: 161_270,
    brokerFee: 54_180,
    exits: [
      { label: 'Undercut at your station', netPerUnit: 612_400, detail: 'relist at 4,479,900' },
      { label: 'Hold at your price', netPerUnit: 1_022_500 },
      { label: 'Sell to the best buy order', netPerUnit: 380_000, detail: '4,050,000 in Jita' },
    ],
  },
  {
    id: 3,
    ...OT,
    item: 'Nanite Repair Paste',
    typeId: 28668,
    side: 'sell',
    price: 31_400,
    remain: 2_400,
    total: 5_000,
    ...AMARR,
    expiresDays: 38,
    expiresOn: '23 Nov 2026',
    issuedOn: '2 Oct 2026',
    state: 'undercutStation',
    badge: 'Station',
    badgeDetail: '-1.6%',
    verdict: 'Undercut to 30,890',
    verdictDetail: 'Undercutting to 30,890 still leaves you 4,120 ISK a unit after fees.',
    nextPrice: 30_890,
    netPerUnit: 4_120,
    floor: 26_770,
    floorSource: 'wallet',
    iskTiedUp: 75_360_000,
    rankAtStation: 'rank 2 of 6 at this station',
    sellsOutIn: '9 days',
    perDay: '≈270/day',
    rivals: [
      {
        scope: 'Station',
        seller: 'Amarr 8',
        price: 30_900,
        sellersUnder: 1,
        unitsUnder: 800,
        overByIsk: 500,
        overByPct: 1.6,
        distance: 'Same station',
      },
      clear('System'),
      clear('Region'),
    ],
    costPerUnit: 25_600,
    salesTax: 1_036,
    brokerFee: 346,
    exits: [
      { label: 'Undercut at your station', netPerUnit: 4_120, detail: 'relist at 30,890' },
      { label: 'Hold at your price', netPerUnit: 4_630 },
    ],
  },
  {
    id: 4,
    ...KV,
    item: 'Tritanium',
    typeId: 34,
    side: 'buy',
    price: 3.92,
    remain: 18_000_000,
    total: 25_000_000,
    ...JITA,
    expiresDays: 80,
    expiresOn: '4 Jan 2027',
    issuedOn: '6 Oct 2026',
    state: 'outbid',
    badge: 'Outbid',
    badgeDetail: '+0.5%',
    verdict: 'Bid 3.95',
    verdictDetail: 'A rival bids 3.94 ISK, 0.02 over you. Sellers go to them first.',
    nextPrice: 3.95,
    iskTiedUp: 70_560_000,
    rankAtStation: 'rank 2 of 14 bids at this station',
    sellsOutIn: '11 days',
    perDay: '≈640,000/day',
    rivals: [
      {
        scope: 'Station',
        seller: 'Jita 4-4',
        price: 3.94,
        sellersUnder: 1,
        unitsUnder: 40_000_000,
        overByIsk: 0.02,
        overByPct: 0.5,
        distance: 'Same station',
      },
      clear('System'),
      clear('Region'),
    ],
    exits: [],
  },
  {
    id: 5,
    ...OT,
    item: 'Caldari Navy Warp Disruptor',
    typeId: 15889,
    side: 'sell',
    price: 6_200_000,
    remain: 4,
    total: 10,
    ...DODIXIE,
    offHub: false,
    expiresDays: 2,
    expiresOn: '18 Oct 2026',
    issuedOn: '19 Jul 2026',
    state: 'expiring',
    badge: 'Expiring',
    badgeDetail: '2d',
    verdict: 'Relist it',
    verdictDetail: '2 days left with 4 unsold. Relist it, or move the stock somewhere it sells.',
    netPerUnit: 1_340_000,
    floor: 4_860_000,
    floorSource: 'wallet',
    iskTiedUp: 24_800_000,
    rankAtStation: 'rank 1 of 3 at this station',
    sellsOutIn: '19 days',
    perDay: '≈0.2/day',
    rivals: [clear('Station'), clear('System'), clear('Region')],
    costPerUnit: 4_550_000,
    salesTax: 223_200,
    brokerFee: 69_800,
    exits: [
      { label: 'Hold at your price', netPerUnit: 1_340_000 },
      { label: 'Haul to Jita', netPerUnit: 1_810_000, detail: '6,900,000 · 15 jumps' },
    ],
  },
  {
    id: 6,
    ...KV,
    item: 'Caracal Navy Issue',
    typeId: 17634,
    side: 'sell',
    price: 52_500_000,
    remain: 2,
    total: 2,
    ...JITA,
    expiresDays: 29,
    expiresOn: '14 Nov 2026',
    issuedOn: '16 Sep 2026',
    state: 'undercutSystem',
    badge: 'System',
    badgeDetail: '-0.9%',
    verdict: 'Leave it alone',
    verdictDetail: 'Your station still leads. Another station in Jita is 450,000 cheaper.',
    netPerUnit: 6_820_000,
    floor: 45_680_000,
    floorSource: 'wallet',
    iskTiedUp: 105_000_000,
    rankAtStation: 'rank 1 of 4 at this station',
    sellsOutIn: '4 days',
    perDay: '≈0.5/day',
    rivals: [
      clear('Station'),
      {
        scope: 'System',
        seller: 'Jita IV - Moon 5 - Ishukone Corporation Factory',
        price: 52_050_000,
        sellersUnder: 1,
        unitsUnder: 1,
        overByIsk: 450_000,
        overByPct: 0.9,
        distance: 'Same system',
      },
      clear('Region'),
    ],
    costPerUnit: 43_400_000,
    salesTax: 1_890_000,
    brokerFee: 520_000,
    exits: [{ label: 'Hold at your price', netPerUnit: 6_820_000 }],
  },
  {
    id: 7,
    ...OT,
    item: 'Gila',
    typeId: 17715,
    side: 'sell',
    price: 318_000_000,
    remain: 1,
    total: 1,
    ...AMARR,
    expiresDays: 44,
    expiresOn: '29 Nov 2026',
    issuedOn: '1 Oct 2026',
    state: 'undercutRegion',
    badge: 'Region',
    badgeDetail: '-2.2%',
    verdict: 'Leave it alone',
    verdictDetail: 'Cheaper stock is 6 jumps away. Buyers rarely fly that far.',
    netPerUnit: 29_400_000,
    floor: 288_600_000,
    floorSource: 'build',
    iskTiedUp: 318_000_000,
    rankAtStation: 'rank 1 of 2 at this station',
    sellsOutIn: '12 days',
    perDay: '≈0.1/day',
    rivals: [
      clear('Station'),
      clear('System'),
      {
        scope: 'Region',
        seller: 'Sarum Prime III - Ministry of War Bureau',
        price: 311_000_000,
        sellersUnder: 1,
        unitsUnder: 1,
        overByIsk: 7_000_000,
        overByPct: 2.2,
        distance: '6 jumps',
      },
    ],
    costPerUnit: 275_300_000,
    salesTax: 11_448_000,
    brokerFee: 3_180_000,
    exits: [{ label: 'Hold at your price', netPerUnit: 29_400_000 }],
  },
  {
    id: 8,
    ...KV,
    item: 'Compressed Bistot',
    typeId: 62584,
    side: 'sell',
    price: 41_200,
    remain: 9_000,
    total: 9_000,
    station: 'Unknown structure',
    stationShort: 'Unknown structure',
    offHub: true,
    expiresDays: 88,
    expiresOn: '12 Jan 2027',
    issuedOn: '14 Oct 2026',
    state: 'notChecked',
    badge: 'Not checked',
    verdict: 'Nothing to do yet',
    verdictDetail: 'Market prices could not load, so we cannot say if anyone beats this order.',
    iskTiedUp: 370_800_000,
    rankAtStation: 'rank not known',
    sellsOutIn: 'Not known',
    perDay: '',
    rivals: [],
    exits: [],
  },
  ...healthy(),
];

/** Many quiet rows: today they bury the six that matter. */
function healthy(): MockOrder[] {
  const rows: [string, number, number, number, 'sell' | 'buy', typeof KV | typeof OT][] = [
    ['Damage Control II', 2048, 1_190_000, 30, 'sell', KV],
    ['Medium Armor Repairer II', 3530, 1_640_000, 18, 'sell', OT],
    ['Ballistic Control System II', 22291, 2_310_000, 24, 'sell', KV],
    ['Pyerite', 35, 12.4, 4_000_000, 'buy', KV],
    ['Multispectrum Energized Membrane II', 11646, 3_020_000, 16, 'sell', OT],
    ['Scourge Fury Light Missile', 2613, 820, 60_000, 'sell', KV],
    ['Sisters Core Scanner Probe', 30013, 168_000, 120, 'sell', OT],
    ['Mexallon', 36, 61.8, 1_500_000, 'buy', OT],
    ['Drake', 24698, 61_400_000, 2, 'sell', KV],
  ];
  return rows.map(([item, typeId, price, remain, side, who], i) => ({
    id: 100 + i,
    ...who,
    item,
    typeId,
    side,
    price,
    remain,
    total: remain,
    ...(i % 3 === 1 ? AMARR : JITA),
    expiresDays: 20 + i * 7,
    expiresOn: `${3 + i} Nov 2026`,
    issuedOn: `${1 + i} Oct 2026`,
    state: 'healthy',
    badge: side === 'buy' ? 'Top bid' : 'Best price',
    verdict: 'Leave it alone',
    verdictDetail:
      side === 'buy'
        ? 'Nobody bids higher where this order sits.'
        : 'Nobody is cheaper here, and it sells for more than it cost you.',
    iskTiedUp: price * remain,
    rankAtStation: 'rank 1 at this station',
    sellsOutIn: `${3 + i} days`,
    perDay: '',
    rivals: [clear('Station'), clear('System'), clear('Region')],
    exits: [],
  }));
}

export const URGENCY: Record<OrderState, Urgency> = {
  belowFloor: 'act',
  undercutStation: 'act',
  outbid: 'act',
  expiring: 'act',
  undercutSystem: 'watch',
  undercutRegion: 'watch',
  notChecked: 'watch',
  healthy: 'fine',
};

export const urgencyOf = (o: MockOrder): Urgency => URGENCY[o.state];

/** Badge tone today (OrderProblemBadge): station danger, system warning, region accent… */
export const STATE_TONE: Record<
  OrderState,
  'danger' | 'warning' | 'accent' | 'success' | 'neutral'
> = {
  belowFloor: 'danger',
  undercutStation: 'danger',
  undercutSystem: 'warning',
  undercutRegion: 'accent',
  expiring: 'warning',
  outbid: 'warning',
  notChecked: 'neutral',
  healthy: 'success',
};

const ORDER_OF_STATES: OrderState[] = [
  'belowFloor',
  'undercutStation',
  'outbid',
  'expiring',
  'undercutSystem',
  'undercutRegion',
  'notChecked',
  'healthy',
];

/** Worst first, then most ISK tied up. */
export const worstFirst = (a: MockOrder, b: MockOrder) =>
  ORDER_OF_STATES.indexOf(a.state) - ORDER_OF_STATES.indexOf(b.state) || b.iskTiedUp - a.iskTiedUp;

export const SORTED = [...ORDERS].sort(worstFirst);
export const ACT = SORTED.filter((o) => urgencyOf(o) === 'act');
export const WATCH = SORTED.filter((o) => urgencyOf(o) === 'watch');
export const FINE = SORTED.filter((o) => urgencyOf(o) === 'fine');

/** The order every modal mockup opens: the undercut Shield Extender. */
export const FOCUS = ORDERS[1];

/**
 * The shell for every Open Orders mockup. The seed dismisses the shell's
 * "assuming 0 standings" banner, which is not part of any proposal and would
 * sit above every screenshot.
 */
export const OPEN_ORDERS_SHELL = {
  path: '/market/orders',
  seed: async () => {
    for (const { id } of CHARACTERS) {
      try {
        localStorage.setItem(`standingsScopeNoticeDismissed:${id}`, '1');
      } catch {
        // Storage blocked: the banner shows; the mockup still renders.
      }
    }
  },
};
