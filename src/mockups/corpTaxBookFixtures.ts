/**
 * Sample data for the Corp Tax Book mockups (#4056): one corporation's book,
 * seen on 18 Oct 2026. Every name is invented. Shared by
 * `CorpTaxBookA/B/C.stories.tsx` so the three layout options show the same
 * book and differ only in layout.
 */

export const CORP = { name: 'Brass Meridian Logistics', ticker: 'BRML' } as const;

/** The book's settings (D3, D10, D11, D19, D20). */
export const BOOK = {
  hub: 'Jita',
  oreForm: 'Compressed',
  memberRate: 10,
  guestRate: 15,
  rateFrom: '1 Aug 2026',
  startDate: '1 Aug 2026',
  minStatement: 5_000_000,
  overdueDays: 14,
  lastSynced: '2h ago',
  lastSyncedBy: 'Kestrel Vane',
  division: 'Master Wallet',
} as const;

export type ExtractionState = 'Extracting' | 'Ready' | 'Fractured' | 'Expired';

export interface OreShare {
  ore: string;
  share: number;
}

export interface Extraction {
  id: number;
  moon: string;
  system: string;
  refinery: string;
  refineryType: 'Athanor' | 'Tatara';
  state: ExtractionState;
  /** The one time that matters for the state, already worded. */
  when: string;
  /** Short countdown or age for a dense row. */
  whenShort: string;
  started: string;
  arrival: string;
  fracture: string;
  expires: string;
  ores: OreShare[] | null;
  oreSource: string | null;
  estIsk: number | null;
  minedPct: number | null;
  /** Timeline bar, in days from 1 Oct (start, ready, fracture, expiry). */
  span: { start: number; ready: number; fracture: number; end: number };
}

export const EXTRACTIONS: Extraction[] = [
  {
    id: 1,
    moon: 'Efa VII - Moon 1',
    system: 'Efa',
    refinery: 'Efa - Copper Kiln',
    refineryType: 'Tatara',
    state: 'Ready',
    when: 'Chunk arrived 11:20 · auto-fracture 14:20',
    whenShort: 'Fractures in 22m',
    started: '20 Sep 03:20',
    arrival: '18 Oct 11:20',
    fracture: '18 Oct 14:20 (auto)',
    expires: '20 Oct 14:20',
    ores: [
      { ore: 'Cobaltite', share: 48 },
      { ore: 'Euxenite', share: 32 },
      { ore: 'Sylvite', share: 20 },
    ],
    oreSource: 'Extraction started notification',
    estIsk: 1_418_600_000,
    minedPct: null,
    span: { start: -11, ready: 17.5, fracture: 17.6, end: 19.6 },
  },
  {
    id: 2,
    moon: 'Efa V - Moon 3',
    system: 'Efa',
    refinery: 'Efa - Brass Anvil',
    refineryType: 'Athanor',
    state: 'Fractured',
    when: 'Laser fired 17 Oct 19:05 · field gone about 19 Oct 19:05',
    whenShort: 'Field gone in 1d 5h',
    started: '26 Sep 19:00',
    arrival: '17 Oct 18:30',
    fracture: '17 Oct 19:05 (laser fired)',
    expires: '19 Oct 19:05',
    ores: [
      { ore: 'Zeolites', share: 58 },
      { ore: 'Sylvite', share: 42 },
    ],
    oreSource: 'Moon Ore Survey (linked)',
    estIsk: 812_400_000,
    minedPct: 61,
    span: { start: -5, ready: 16.8, fracture: 16.8, end: 18.8 },
  },
  {
    id: 3,
    moon: 'Kamela IV - Moon 6',
    system: 'Kamela',
    refinery: 'Kamela - Meridian Drill',
    refineryType: 'Athanor',
    state: 'Extracting',
    when: 'Chunk arrives 23 Oct 03:40',
    whenShort: 'Arrives in 4d 13h',
    started: '2 Oct 03:40',
    arrival: '23 Oct 03:40',
    fracture: '23 Oct 06:40 (auto)',
    expires: '25 Oct 06:40',
    ores: null,
    oreSource: null,
    estIsk: null,
    minedPct: null,
    span: { start: 1, ready: 22.1, fracture: 22.3, end: 24.3 },
  },
  {
    id: 4,
    moon: 'Kamela II - Moon 2',
    system: 'Kamela',
    refinery: 'Kamela - Slag Heap',
    refineryType: 'Athanor',
    state: 'Expired',
    when: 'Fractured 10 Oct 21:15 · gone 12 Oct 21:15',
    whenShort: 'Gone 6d ago',
    started: '12 Sep 21:00',
    arrival: '10 Oct 20:40',
    fracture: '10 Oct 21:15 (laser fired)',
    expires: '12 Oct 21:15',
    ores: [
      { ore: 'Zeolites', share: 55 },
      { ore: 'Bitumens', share: 45 },
    ],
    oreSource: 'Extraction started notification',
    estIsk: 640_200_000,
    minedPct: 94,
    span: { start: -19, ready: 9.9, fracture: 9.9, end: 11.9 },
  },
];

/** Past cycles at Efa V - Moon 3, newest first (moon detail). */
export interface MoonCycle {
  id: number;
  fractured: string;
  days: number;
  estIsk: number;
  minedPct: number;
  taxBilled: number;
  miners: number;
  state: ExtractionState;
}

export const MOON_CYCLES: MoonCycle[] = [
  {
    id: 1,
    fractured: '17 Oct',
    days: 21,
    estIsk: 812_400_000,
    minedPct: 61,
    taxBilled: 0,
    miners: 9,
    state: 'Fractured',
  },
  {
    id: 2,
    fractured: '25 Sep',
    days: 21,
    estIsk: 798_100_000,
    minedPct: 97,
    taxBilled: 79_420_000,
    miners: 14,
    state: 'Expired',
  },
  {
    id: 3,
    fractured: '3 Sep',
    days: 21,
    estIsk: 805_900_000,
    minedPct: 92,
    taxBilled: 74_860_000,
    miners: 12,
    state: 'Expired',
  },
  {
    id: 4,
    fractured: '12 Aug',
    days: 21,
    estIsk: 790_300_000,
    minedPct: 88,
    taxBilled: 70_150_000,
    miners: 11,
    state: 'Expired',
  },
];

/** Who mined the current chunk at Efa V - Moon 3 (moon detail). */
export const MOON_MINERS = [
  { miner: 'Varro Kestane', units: 182_400, value: 29_640_000, tax: 2_964_000 },
  { miner: 'Odile Marchetti', units: 161_050, value: 26_170_000, tax: 2_617_000 },
  { miner: 'Tamsin Holloway', units: 120_300, value: 19_550_000, tax: 2_932_500 },
  { miner: 'Juno Rask', units: 64_800, value: 10_530_000, tax: 1_053_000 },
];

export type MinerStanding = 'Member' | 'Guest' | 'Left corp';

export interface Miner {
  id: number;
  main: string;
  characters: string[];
  standing: MinerStanding;
  corp: string;
  /** On issued Statements, less payments and dismissals. */
  owed: number;
  /** Billable days not on a Statement yet. */
  unbilled: number;
  overdueDays: number | null;
  credit: number;
  lastPaid: string;
  lastStatement: string;
  note?: string;
}

export const MINERS: Miner[] = [
  {
    id: 1,
    main: 'Varro Kestane',
    characters: ['Varro Kestane', 'Lysa Kestane'],
    standing: 'Member',
    corp: CORP.name,
    owed: 48_210_400,
    unbilled: 6_412_000,
    overdueDays: 33,
    credit: 0,
    lastPaid: '16 Oct',
    lastStatement: 'Aug 2026',
  },
  {
    id: 2,
    main: 'Tamsin Holloway',
    characters: ['Tamsin Holloway'],
    standing: 'Guest',
    corp: 'Ashfall Prospecting',
    owed: 31_775_000,
    unbilled: 4_880_500,
    overdueDays: null,
    credit: 0,
    lastPaid: '2 Sep',
    lastStatement: 'Aug 2026',
    note: 'Declared paid by contract · overdue paused until 28 Oct',
  },
  {
    id: 3,
    main: 'Bram Ostrander',
    characters: ['Bram Ostrander'],
    standing: 'Left corp',
    corp: 'Vantor Freight',
    owed: 9_120_000,
    unbilled: 0,
    overdueDays: 19,
    credit: 0,
    lastPaid: '30 Aug',
    lastStatement: 'Aug 2026',
    note: 'Left corp 22 Sep, owes 9,120,000',
  },
  {
    id: 4,
    main: 'Odile Marchetti',
    characters: ['Odile Marchetti', 'Nell Marchetti', 'Ivo Marchetti'],
    standing: 'Member',
    corp: CORP.name,
    owed: 0,
    unbilled: 22_480_900,
    overdueDays: null,
    credit: 0,
    lastPaid: '9 Sep',
    lastStatement: 'Aug 2026',
  },
  {
    id: 5,
    main: 'Juno Rask',
    characters: ['Juno Rask'],
    standing: 'Member',
    corp: CORP.name,
    owed: 0,
    unbilled: 3_940_000,
    overdueDays: null,
    credit: 0,
    lastPaid: '4 Sep',
    lastStatement: 'Aug 2026',
    note: 'Below the 5,000,000 minimum · rolls into October',
  },
  {
    id: 6,
    main: 'Ilse Varga',
    characters: ['Ilse Varga'],
    standing: 'Member',
    corp: CORP.name,
    owed: 0,
    unbilled: 8_115_300,
    overdueDays: null,
    credit: 4_300_000,
    lastPaid: '12 Oct',
    lastStatement: 'Aug 2026',
  },
];

export const UNMATCHED = {
  from: 'Pell Arunde',
  date: '16 Oct 08:12',
  amount: 15_000_000,
  reason: 'moon tax',
};

export type DayStatus =
  'On Aug Statement' | 'Not on a Statement yet' | 'Not Billable yet' | 'Dismissed' | 'Paid';

export interface DayLine {
  id: number;
  date: string;
  moon: string;
  refinery: string;
  character: string;
  ore: string;
  units: number;
  unitPrice: number;
  priceDate: string;
  rate: number;
  value: number;
  tax: number;
  status: DayStatus;
}

const PRICES: Record<string, number> = {
  Zeolites: 148.2,
  Sylvite: 171.9,
  Bitumens: 162.4,
  Cobaltite: 412.75,
  Euxenite: 455.1,
};

function line(
  id: number,
  date: string,
  moon: string,
  refinery: string,
  character: string,
  ore: string,
  units: number,
  rate: number,
  status: DayStatus
): DayLine {
  const unitPrice = PRICES[ore];
  const value = Math.round(units * unitPrice);
  return {
    id,
    date,
    moon,
    refinery,
    character,
    ore,
    units,
    unitPrice,
    priceDate: date,
    rate,
    value,
    tax: Math.round((value * rate) / 100),
    status,
  };
}

const EFA5 = ['Efa V - Moon 3', 'Efa - Brass Anvil'] as const;
const EFA7 = ['Efa VII - Moon 1', 'Efa - Copper Kiln'] as const;
const KAM2 = ['Kamela II - Moon 2', 'Kamela - Slag Heap'] as const;

/** Varro Kestane's days (miner detail), newest first. */
export const VARRO_DAYS: DayLine[] = [
  line(1, '18 Oct', ...EFA5, 'Lysa Kestane', 'Zeolites', 38_400, 10, 'Not Billable yet'),
  line(2, '17 Oct', ...EFA5, 'Varro Kestane', 'Sylvite', 52_100, 10, 'Not on a Statement yet'),
  line(3, '17 Oct', ...EFA5, 'Varro Kestane', 'Zeolites', 61_900, 10, 'Not on a Statement yet'),
  line(4, '11 Oct', ...KAM2, 'Lysa Kestane', 'Bitumens', 44_250, 10, 'Dismissed'),
  line(5, '28 Aug', ...EFA7, 'Varro Kestane', 'Cobaltite', 71_300, 10, 'On Aug Statement'),
  line(6, '27 Aug', ...EFA7, 'Varro Kestane', 'Euxenite', 48_900, 10, 'On Aug Statement'),
  line(7, '27 Aug', ...EFA7, 'Lysa Kestane', 'Cobaltite', 66_150, 10, 'On Aug Statement'),
  line(8, '14 Aug', ...EFA5, 'Varro Kestane', 'Zeolites', 90_400, 10, 'Paid'),
];

export interface PaymentLine {
  id: number;
  date: string;
  from: string;
  amount: number;
  kind: 'Donation' | 'Recorded by hand';
  credited: string;
  notTax?: number;
  by?: string;
}

export const VARRO_PAYMENTS: PaymentLine[] = [
  {
    id: 1,
    date: '16 Oct 21:40',
    from: 'Lysa Kestane',
    amount: 12_000_000,
    kind: 'Donation',
    credited: 'Aug 2026 Statement',
    notTax: 2_000_000,
    by: 'Kestrel Vane',
  },
  {
    id: 2,
    date: '3 Sep 18:02',
    from: 'Varro Kestane',
    amount: 25_000_000,
    kind: 'Donation',
    credited: 'Aug 2026 Statement',
  },
  {
    id: 3,
    date: '20 Aug 11:15',
    from: 'Varro Kestane',
    amount: 13_398_000,
    kind: 'Recorded by hand',
    credited: 'Before Statements (paid by contract)',
    by: 'Kestrel Vane',
  },
];

export const VARRO_DISMISSALS = [
  {
    id: 1,
    date: '12 Oct',
    scope: 'Kamela II - Moon 2, 11 Oct',
    amount: 718_620,
    by: 'Kestrel Vane',
    reason: 'Corp mining op, no tax',
  },
];

export const VARRO_MAIL = [
  { id: 1, date: '15 Oct 14:02', what: 'Reminder: Aug 2026 Statement', status: 'Sent' },
  { id: 2, date: '1 Sep 14:00', what: 'Aug 2026 Statement', status: 'Sent' },
];

export interface StatementPeriod {
  id: string;
  period: string;
  status: 'Open' | 'Ready to send' | 'Sent';
  miners: number;
  toSend: number;
  billed: number;
  paid: number;
  outstanding: number;
  issued: string;
}

export const PERIODS: StatementPeriod[] = [
  {
    id: 'oct',
    period: 'Oct 2026',
    status: 'Open',
    miners: 17,
    toSend: 0,
    billed: 0,
    paid: 0,
    outstanding: 0,
    issued: 'Closes 31 Oct',
  },
  {
    id: 'sep',
    period: 'Sep 2026',
    status: 'Ready to send',
    miners: 23,
    toSend: 19,
    billed: 412_640_300,
    paid: 0,
    outstanding: 412_640_300,
    issued: 'Not sent',
  },
  {
    id: 'aug',
    period: 'Aug 2026',
    status: 'Sent',
    miners: 19,
    toSend: 0,
    billed: 356_118_900,
    paid: 266_892_500,
    outstanding: 89_226_400,
    issued: '1 Sep',
  },
];

export type QueueStatus = 'Sent' | 'Sending' | 'Paused' | 'Failed' | 'Waiting';

export interface QueueItem {
  id: number;
  to: string;
  amount: number;
  status: QueueStatus;
  at?: string;
  detail?: string;
}

const QUEUE_NAMES = [
  'Odile Marchetti',
  'Varro Kestane',
  'Tamsin Holloway',
  'Hadrian Selk',
  'Mira Okonkwo',
  'Corvin Asheby',
  'Petra Lindqvist',
  'Dag Ostermann',
  'Sefa Imari',
  'Rourke Calloway',
  'Anouk Brecht',
  'Tobiah Wren',
  'Kaito Varne',
  'Esme Halvorsen',
  'Lucan Drey',
  'Yara Solenne',
  'Brisa Monteiro',
  'Fenwick Rhys',
  'Galen Mott',
];

const QUEUE_AMOUNTS = [
  22_480_900, 54_622_400, 36_655_500, 18_204_000, 27_950_750, 12_410_000, 9_880_200, 31_004_000,
  7_215_600, 15_330_000, 6_090_400, 44_871_300, 11_202_000, 8_760_500, 19_903_100, 5_412_000,
  23_118_700, 14_406_250, 39_172_000,
];

export const QUEUE_SENT_TIMES = [
  '14:02',
  '14:02',
  '',
  '14:03',
  '14:03',
  '14:03',
  '14:03',
  '14:04',
  '14:04',
  '14:04',
  '14:05',
  '14:05',
  '14:05',
  '14:05',
  '14:06',
  '14:06',
  '14:06',
  '14:06',
  '14:07',
];

/** The send queue part-way through: 7 sent, one failed, one paused on EVE's limit. */
export const QUEUE_RUNNING: QueueItem[] = QUEUE_NAMES.map((to, index) => {
  const base = { id: index + 1, to, amount: QUEUE_AMOUNTS[index] };
  if (index === 2)
    return {
      ...base,
      status: 'Failed',
      detail: 'EVE refused: Tamsin Holloway charges CSPA to receive mail',
    };
  if (index < 8) return { ...base, status: 'Sent', at: QUEUE_SENT_TIMES[index] };
  if (index === 8)
    return { ...base, status: 'Paused', detail: 'EVE asked us to wait 48s (too many mails)' };
  return { ...base, status: 'Waiting' };
});

/** The same queue finished: everything sent but the one failure. */
export const QUEUE_DONE: QueueItem[] = QUEUE_RUNNING.map((item) =>
  item.status === 'Failed' ? item : { ...item, status: 'Sent', at: QUEUE_SENT_TIMES[item.id - 1] }
);

/** Personal Moon Mining Tax tab: a member's rows against the corp's book (D12, D28, D30). */
export type PersonalState =
  | 'Pending corp record'
  | 'Billed'
  | 'Sent, waiting for the corp'
  | 'Paid'
  | 'Unattributed'
  | 'Conflict'
  | 'Dismissed by corp';

export interface PersonalRow {
  id: number;
  date: string;
  system: string;
  ore: string;
  units: number;
  payee: string;
  tax: number | null;
  state: PersonalState;
  note: string;
}

export const CORP_PAYEE = `${CORP.name} (Corp Tax Book)`;

export const PERSONAL_ROWS: PersonalRow[] = [
  {
    id: 1,
    date: '18 Oct',
    system: 'Efa',
    ore: 'Cobaltite',
    units: 24_600,
    payee: CORP_PAYEE,
    tax: null,
    state: 'Pending corp record',
    note: 'Not owed yet. The corp records 18 Oct after 06:00 on 19 Oct and its next sync.',
  },
  {
    id: 2,
    date: '17 Oct',
    system: 'Efa',
    ore: 'Zeolites',
    units: 41_200,
    payee: CORP_PAYEE,
    tax: 957_002,
    state: 'Billed',
    note: 'Safe to pay once Brass Meridian Logistics syncs (last synced 2d ago)',
  },
  {
    id: 3,
    date: '16 Oct',
    system: 'Efa',
    ore: 'Sylvite',
    units: 52_100,
    payee: CORP_PAYEE,
    tax: 895_599,
    state: 'Sent, waiting for the corp',
    note: 'You donated 895,599 on 16 Oct; the corp has not synced since.',
  },
  {
    id: 4,
    date: '14 Oct',
    system: 'Kamela',
    ore: 'Bitumens',
    units: 30_000,
    payee: CORP_PAYEE,
    tax: 974_400,
    state: 'Conflict',
    note: 'You gave this day to Ashfall Prospecting; the book observed 30,000 units. Goes to Brass Meridian Logistics on 28 Oct unless resolved.',
  },
  {
    id: 5,
    date: '12 Oct',
    system: 'Ouelletta',
    ore: 'Euxenite',
    units: 18_900,
    payee: '—',
    tax: null,
    state: 'Unattributed',
    note: 'No Corp Tax Book observed this ore. Owed to no one.',
  },
  {
    id: 6,
    date: '11 Oct',
    system: 'Kamela',
    ore: 'Bitumens',
    units: 44_250,
    payee: CORP_PAYEE,
    tax: 0,
    state: 'Dismissed by corp',
    note: 'Dismissed by Kestrel Vane: Corp mining op, no tax',
  },
  {
    id: 7,
    date: '27 Aug',
    system: 'Efa',
    ore: 'Cobaltite',
    units: 66_150,
    payee: CORP_PAYEE,
    tax: 2_730_341,
    state: 'Paid',
    note: 'Safe to pay — 27 Aug is closed. Paid with your 3 Sep donation.',
  },
];

/** D28: the member's own figures against the book's for one day. */
export const DIFF = {
  date: '17 Oct',
  where: 'Efa V - Moon 3 · Efa - Brass Anvil',
  rows: [
    { what: 'Quantity (Zeolites)', mine: '41,200', book: '43,050', differs: true },
    {
      what: 'Price basis',
      mine: 'Jita buy, Compressed',
      book: 'Jita buy, Compressed',
      differs: false,
    },
    { what: 'Unit price (17 Oct)', mine: '148.20', book: '148.20', differs: false },
    { what: 'Rate', mine: '10%', book: '15%', differs: true },
    { what: 'Tax', mine: '610,584', book: '957,002', differs: true },
  ],
  disputed: 'Disputed: you 10%, book 15%',
  rateNote: 'Book rate 15% is the per-moon rate for Efa V - Moon 3, effective 1 Oct 2026',
};

/** The guest verify page: Tamsin Holloway's Sep 2026 Statement (D27). */
export const VERIFY = {
  miner: 'Tamsin Holloway',
  period: 'Sep 2026',
  issued: '1 Oct 2026',
  due: '15 Oct 2026',
  code: 'BRML-7Q4K',
  previous: 31_775_000,
  lines: [
    line(101, '24 Sep', ...EFA5, 'Tamsin Holloway', 'Zeolites', 70_200, 15, 'On Aug Statement'),
    line(102, '24 Sep', ...EFA5, 'Tamsin Holloway', 'Sylvite', 50_100, 15, 'On Aug Statement'),
    line(103, '18 Sep', ...EFA7, 'Tamsin Holloway', 'Cobaltite', 22_400, 15, 'On Aug Statement'),
    line(104, '17 Sep', ...EFA7, 'Tamsin Holloway', 'Euxenite', 15_850, 15, 'On Aug Statement'),
    line(105, '9 Sep', ...KAM2, 'Tamsin Holloway', 'Bitumens', 41_000, 15, 'On Aug Statement'),
  ],
  payments: [
    { id: 1, date: '2 Sep 20:14', from: 'Tamsin Holloway', amount: 18_000_000, to: 'Aug 2026' },
  ],
  terms: [
    { term: 'Rate', value: '15% (Guest default, effective 1 Aug 2026)' },
    { term: 'Price', value: 'Jita buy, Compressed ore, on the day mined' },
    { term: 'Due', value: '15 Oct 2026 (14 days after issue)' },
    {
      term: 'Minimum Statement',
      value: '5,000,000 ISK; smaller balances roll into the next month',
    },
    { term: 'Paying', value: 'Donate to Brass Meridian Logistics; any of your characters counts' },
  ],
};

export const VERIFY_TAX = VERIFY.lines.reduce((sum, row) => sum + row.tax, 0);
