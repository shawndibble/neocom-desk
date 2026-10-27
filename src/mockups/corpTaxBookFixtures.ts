/**
 * Sample data for the Corp Tax Book mockups (#4056): one corporation's book,
 * seen on 18 Oct 2026 14:00 EVE. Every name is invented.
 *
 * One story throughout: an officer synced the book at 12:00 (2h ago), so the
 * Billable rule (day end + 6h grace passed AND a sync after that) makes every
 * day through 17 Oct Billable and 18 Oct not yet. The Aug 2026 Statements
 * went out on 1 Sep (due 15 Sep). The Sep 2026 Statements are NOT sent yet:
 * the run in the Statements tab is about to send them, and Oct is still open.
 * Miner figures that appear in more than one place are derived below from
 * their lines and payments, so every view reconciles.
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
  lastSyncedAt: '12:00',
  billableThrough: '17 Oct',
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
    whenShort: 'Fractures in 20m',
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
    minedPct: 9,
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
    whenShort: 'Gone 5d ago',
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

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export type MinerStanding = 'Member' | 'Guest' | 'Left corp';

export type DayStatus =
  'On Aug Statement' | 'Next Statement' | 'Not Billable yet' | 'Dismissed' | 'Paid' | 'Written off';

export interface DayLine {
  id: number;
  date: string;
  moon: string;
  refinery: string;
  character: string;
  ore: string;
  units: number;
  unitPrice: number;
  /** The day the unit price is for (D11: the day mined). */
  priceDate: string;
  /** Which tier of the price chain produced it. */
  priceSource: string;
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
  status: DayStatus,
  priceSource = 'Hub station price'
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
    priceSource,
    rate,
    value,
    tax: Math.round((value * rate) / 100),
    status,
  };
}

const EFA5 = ['Efa V - Moon 3', 'Efa - Brass Anvil'] as const;
const EFA7 = ['Efa VII - Moon 1', 'Efa - Copper Kiln'] as const;
const KAM2 = ['Kamela II - Moon 2', 'Kamela - Slag Heap'] as const;

const taxOf = (rows: DayLine[]) => sum(rows.map((r) => r.tax));
const valueOf = (rows: DayLine[]) => sum(rows.map((r) => r.value));
const inMonth = (row: DayLine, month: string) => row.date.endsWith(month);

/** Varro Kestane's days (miner detail), newest first. */
export const VARRO_DAYS: DayLine[] = [
  line(1, '18 Oct', ...EFA5, 'Lysa Kestane', 'Zeolites', 38_400, 10, 'Not Billable yet'),
  line(2, '17 Oct', ...EFA5, 'Varro Kestane', 'Sylvite', 52_100, 10, 'Next Statement'),
  line(3, '17 Oct', ...EFA5, 'Varro Kestane', 'Zeolites', 61_900, 10, 'Next Statement'),
  line(4, '11 Oct', ...KAM2, 'Lysa Kestane', 'Bitumens', 44_250, 10, 'Dismissed'),
  line(5, '26 Sep', ...EFA5, 'Varro Kestane', 'Sylvite', 82_000, 10, 'Next Statement'),
  line(6, '25 Sep', ...EFA5, 'Lysa Kestane', 'Zeolites', 91_500, 10, 'Next Statement'),
  line(
    7,
    '4 Sep',
    ...EFA5,
    'Varro Kestane',
    'Sylvite',
    70_300,
    10,
    'Next Statement',
    'Region-wide (Jita)'
  ),
  line(8, '28 Aug', ...EFA7, 'Varro Kestane', 'Cobaltite', 71_300, 10, 'On Aug Statement'),
  line(9, '27 Aug', ...EFA7, 'Varro Kestane', 'Euxenite', 48_900, 10, 'On Aug Statement'),
  line(10, '27 Aug', ...EFA7, 'Lysa Kestane', 'Cobaltite', 66_150, 10, 'On Aug Statement'),
  line(11, '14 Aug', ...EFA5, 'Varro Kestane', 'Zeolites', 6_200, 10, 'Written off'),
  line(12, '14 Aug', ...EFA5, 'Varro Kestane', 'Zeolites', 90_400, 10, 'Paid'),
];

export interface PaymentLine {
  id: number;
  date: string;
  from: string;
  amount: number;
  kind: 'Donation' | 'Recorded by hand';
  credited: string;
  notTax?: number;
  /** Left over after a payment within tolerance settled its debt, written off and logged. */
  writtenOff?: number;
  by?: string;
}

/**
 * Varro Kestane's whole position, derived from his lines and payments. The
 * Miners table, Needs-you card, mail preview and Miner page all read this, so
 * they cannot disagree. `notTax` is how much of Lysa's 16 Oct donation is
 * marked "not tax": 1,000,000 once marked, 0 on the page behind the Mark not
 * tax dialog.
 */
export function varroLedger(notTax: number) {
  const augLines = VARRO_DAYS.filter((r) => r.status === 'On Aug Statement' || r.status === 'Paid');
  const handPayment = 1_338_900;
  const paidLine = VARRO_DAYS.find((r) => r.status === 'Paid') as DayLine;
  const toleranceWriteOff = paidLine.tax - handPayment;
  const payments: PaymentLine[] = [
    {
      id: 1,
      date: '16 Oct 21:40',
      from: 'Lysa Kestane',
      amount: 5_000_000,
      kind: 'Donation',
      credited: 'Aug 2026 Statement',
      notTax: notTax || undefined,
      by: notTax ? 'Kestrel Vane' : undefined,
    },
    {
      id: 2,
      date: '3 Sep 18:02',
      from: 'Varro Kestane',
      amount: 2_000_000,
      kind: 'Donation',
      credited: 'Aug 2026 Statement',
    },
    {
      id: 3,
      date: '20 Aug 11:15',
      from: 'Varro Kestane',
      amount: handPayment,
      kind: 'Recorded by hand',
      credited: '14 Aug, before the Aug 2026 Statement (paid by contract)',
      writtenOff: toleranceWriteOff,
      by: 'Kestrel Vane',
    },
  ];
  const credited = sum(payments.map((p) => p.amount - (p.notTax ?? 0)));
  const augBilled = taxOf(augLines);
  const owed = augBilled - credited - toleranceWriteOff;
  const sepLines = VARRO_DAYS.filter((r) => r.status === 'Next Statement' && inMonth(r, 'Sep'));
  const octBillable = VARRO_DAYS.filter((r) => r.status === 'Next Statement' && inMonth(r, 'Oct'));
  const pending = VARRO_DAYS.filter((r) => r.status === 'Not Billable yet');
  const sepNew = taxOf(sepLines);
  return {
    payments,
    augLines,
    augBilled,
    credited,
    toleranceWriteOff,
    owed,
    sepLines,
    sepNew,
    octNew: taxOf(octBillable),
    pending: taxOf(pending),
    unbilled: sepNew + taxOf(octBillable),
    mailBalance: owed + sepNew,
  };
}

export const VARRO = varroLedger(1_000_000);
export const VARRO_BEFORE_NOT_TAX = varroLedger(0);
export const VARRO_PAYMENTS = VARRO.payments;

/** The two 17 Oct days the Dismiss dialog is for. */
export const VARRO_DISMISS_IDS = [2, 3];
export const VARRO_DISMISS_AMOUNT = taxOf(
  VARRO_DAYS.filter((r) => VARRO_DISMISS_IDS.includes(r.id))
);

export const VARRO_DISMISSALS = [
  {
    id: 1,
    date: '12 Oct',
    scope: 'Kamela II - Moon 2, 11 Oct',
    amount: taxOf(VARRO_DAYS.filter((r) => r.status === 'Dismissed')),
    by: 'Kestrel Vane',
    reason: 'Corp mining op, no tax',
  },
];

export const VARRO_MAIL = [
  { id: 1, date: '15 Oct 14:02', what: 'Reminder: Aug 2026 Statement', status: 'Sent' },
  { id: 2, date: '1 Sep 14:00', what: 'Aug 2026 Statement', status: 'Sent' },
];

/** D6/D7: the audit log lines about Varro, newest first. */
export const VARRO_ACTIVITY = [
  {
    id: 1,
    when: '16 Oct 21:52',
    who: 'Kestrel Vane',
    what: 'Marked 1,000,000 of Lysa Kestane’s 16 Oct donation not tax',
    why: 'Buyback',
  },
  {
    id: 2,
    when: '16 Oct 21:40',
    who: 'Book',
    what: 'Credited a 5,000,000 donation from Lysa Kestane to the Aug 2026 Statement',
    why: 'Automatic',
  },
  {
    id: 3,
    when: '15 Oct 14:02',
    who: 'Kestrel Vane',
    what: 'Sent a reminder for the Aug 2026 Statement',
    why: '',
  },
  {
    id: 4,
    when: '12 Oct 09:15',
    who: 'Kestrel Vane',
    what: 'Dismissed Kamela II - Moon 2, 11 Oct',
    why: 'Corp mining op, no tax',
  },
  {
    id: 5,
    when: '19 Sep 06:10',
    who: 'Book',
    what: 'Wrote off 1 line recorded after payment (14 Aug, Zeolites)',
    why: 'Paid days are closed',
  },
];

/** D16: the Sep 2026 Statement mail for Varro, exactly as it would be sent. */
export const VARRO_MAIL_STATEMENT = {
  to: 'Varro Kestane',
  subject: `${CORP.ticker} moon tax · Sep 2026 · ${VARRO.mailBalance.toLocaleString('en')} ISK`,
  lines: [...VARRO.sepLines].reverse(),
  augBilled: VARRO.augBilled,
  payments: VARRO.payments,
  carried: VARRO.owed,
  newTotal: VARRO.sepNew,
  balance: VARRO.mailBalance,
  credit: 0,
  due: '1 Nov',
  code: 'BRML-4H2D',
  verify: 'neocomdesk.app/s/7f3k…',
  chars: 1_460,
};

/** Tamsin Holloway (Guest, 15%): her Aug 2026 Statement, issued 1 Sep. */
export const TAMSIN_AUG: DayLine[] = [
  line(101, '28 Aug', ...EFA7, 'Tamsin Holloway', 'Euxenite', 15_850, 15, 'On Aug Statement'),
  line(102, '27 Aug', ...EFA7, 'Tamsin Holloway', 'Cobaltite', 22_400, 15, 'On Aug Statement'),
  line(103, '14 Aug', ...EFA5, 'Tamsin Holloway', 'Zeolites', 42_000, 15, 'On Aug Statement'),
  line(104, '13 Aug', ...EFA5, 'Tamsin Holloway', 'Sylvite', 50_100, 15, 'On Aug Statement'),
  line(105, '13 Aug', ...EFA5, 'Tamsin Holloway', 'Zeolites', 70_200, 15, 'On Aug Statement'),
];
const TAMSIN_SEP = [
  line(106, '26 Sep', ...EFA5, 'Tamsin Holloway', 'Sylvite', 58_400, 15, 'Next Statement'),
];
const TAMSIN_OCT = [
  line(107, '17 Oct', ...EFA5, 'Tamsin Holloway', 'Zeolites', 66_100, 15, 'Next Statement'),
];
const TAMSIN_PENDING = [
  line(108, '18 Oct', ...EFA5, 'Tamsin Holloway', 'Sylvite', 34_800, 15, 'Not Billable yet'),
];
const TAMSIN_PAID = 2_500_000;
const TAMSIN_OWED = taxOf(TAMSIN_AUG) - TAMSIN_PAID;
export const TAMSIN = {
  augBilled: taxOf(TAMSIN_AUG),
  paid: TAMSIN_PAID,
  owed: TAMSIN_OWED,
  sepNew: taxOf(TAMSIN_SEP),
  unbilled: taxOf(TAMSIN_SEP) + taxOf(TAMSIN_OCT),
  mailBalance: TAMSIN_OWED + taxOf(TAMSIN_SEP),
};

/** Who mined the current chunk at Efa V - Moon 3 (moon detail), from the lines. */
const chunkLines = (rows: DayLine[]) => rows.filter((r) => r.moon === EFA5[0] && inMonth(r, 'Oct'));
const varroChunk = chunkLines(VARRO_DAYS);
const tamsinChunk = chunkLines([...TAMSIN_OCT, ...TAMSIN_PENDING]);
export const MOON_MINERS = [
  {
    miner: 'Varro Kestane',
    units: sum(varroChunk.map((r) => r.units)),
    value: valueOf(varroChunk),
    tax: taxOf(varroChunk),
  },
  { miner: 'Odile Marchetti', units: 161_050, value: 26_170_000, tax: 2_617_000 },
  {
    miner: 'Tamsin Holloway',
    units: sum(tamsinChunk.map((r) => r.units)),
    value: valueOf(tamsinChunk),
    tax: taxOf(tamsinChunk),
  },
  { miner: 'Juno Rask', units: 64_800, value: 10_530_000, tax: 1_053_000 },
];

/** Past cycles at Efa V - Moon 3, newest first, not the one running now (moon detail). */
export interface MoonCycle {
  id: number;
  fractured: string;
  days: number;
  estIsk: number;
  minedPct: number;
  /** Tax recorded in the cycle's days. */
  tax: number;
  /** Where that tax stands. */
  on: string;
  miners: number;
  state: ExtractionState;
}

export const MOON_CYCLES: MoonCycle[] = [
  {
    id: 2,
    fractured: '25 Sep',
    days: 21,
    estIsk: 798_100_000,
    minedPct: 97,
    tax: 79_420_000,
    on: 'Sep Statement, not sent yet',
    miners: 14,
    state: 'Expired',
  },
  {
    id: 3,
    fractured: '3 Sep',
    days: 21,
    estIsk: 805_900_000,
    minedPct: 92,
    tax: 74_860_000,
    on: 'Sep Statement, not sent yet',
    miners: 12,
    state: 'Expired',
  },
  {
    id: 4,
    fractured: '12 Aug',
    days: 21,
    estIsk: 790_300_000,
    minedPct: 88,
    tax: 70_150_000,
    on: 'Aug Statement',
    miners: 11,
    state: 'Expired',
  },
];

export interface Miner {
  id: number;
  main: string;
  characters: string[];
  standing: MinerStanding;
  corp: string;
  /** On issued Statements, less payments and dismissals. */
  owed: number;
  /** Billable days not on a sent Statement yet (Sep not sent, plus Oct so far). */
  unbilled: number;
  overdueDays: number | null;
  credit: number;
  lastPaid: string;
  lastStatement: string;
  note?: string;
}

/** Aug Statements are due 15 Sep, so anything unpaid is 33 days overdue today. */
const OVERDUE_DAYS = 33;
const ODILE = { sep: 14_205_800, oct: 8_275_100 };
const JUNO = { sep: 2_120_000, oct: 1_820_000 };
const ILSE = { sep: 11_650_000, oct: 2_400_000, credit: 4_300_000 };
const BRAM_OWED = 6_120_000;

export const MINERS: Miner[] = [
  {
    id: 1,
    main: 'Varro Kestane',
    characters: ['Varro Kestane', 'Lysa Kestane'],
    standing: 'Member',
    corp: CORP.name,
    owed: VARRO.owed,
    unbilled: VARRO.unbilled,
    overdueDays: OVERDUE_DAYS,
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
    owed: TAMSIN.owed,
    unbilled: TAMSIN.unbilled,
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
    owed: BRAM_OWED,
    unbilled: 0,
    overdueDays: OVERDUE_DAYS,
    credit: 0,
    lastPaid: '30 Aug',
    lastStatement: 'Aug 2026',
    note: `Left corp 22 Sep, owes ${BRAM_OWED.toLocaleString('en')}`,
  },
  {
    id: 4,
    main: 'Odile Marchetti',
    characters: ['Odile Marchetti', 'Nell Marchetti', 'Ivo Marchetti'],
    standing: 'Member',
    corp: CORP.name,
    owed: 0,
    unbilled: ODILE.sep + ODILE.oct,
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
    unbilled: JUNO.sep + JUNO.oct,
    overdueDays: null,
    credit: 0,
    lastPaid: '4 Sep',
    lastStatement: 'Aug 2026',
    note: 'Sep Statement is below the 5,000,000 minimum · rolls into October',
  },
  {
    id: 6,
    main: 'Ilse Varga',
    characters: ['Ilse Varga'],
    standing: 'Member',
    corp: CORP.name,
    owed: 0,
    unbilled: ILSE.sep + ILSE.oct,
    overdueDays: null,
    credit: ILSE.credit,
    lastPaid: '12 Oct',
    lastStatement: 'Aug 2026',
  },
];

/** The 20 Miners the table does not show (it lists the 6 that need a look first). */
export const OTHER_MINERS = { count: 20, unbilled: 53_716_400 };
export const TOTAL_MINERS = MINERS.length + OTHER_MINERS.count;

/** The Miners tab's chips, summed over the table above. */
export const MINER_TOTALS = {
  owed: sum(MINERS.map((m) => m.owed)),
  overdue: sum(MINERS.filter((m) => m.overdueDays !== null).map((m) => m.owed)),
  overdueCount: MINERS.filter((m) => m.overdueDays !== null).length,
  unbilled: sum(MINERS.map((m) => m.unbilled)) + OTHER_MINERS.unbilled,
  credit: sum(MINERS.map((m) => m.credit)),
};

export const UNMATCHED = {
  from: 'Pell Arunde',
  date: '16 Oct 08:12',
  amount: 15_000_000,
  reason: 'moon tax',
};

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
  'Bram Ostrander',
  'Ilse Varga',
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

/** A Statement is the Miner's balance due: carried + this period's lines, less credit. */
const QUEUE_AMOUNTS = [
  ODILE.sep,
  VARRO.mailBalance,
  TAMSIN.mailBalance,
  BRAM_OWED,
  ILSE.sep - ILSE.credit,
  12_410_000,
  9_880_200,
  31_004_000,
  7_215_600,
  15_330_000,
  6_090_400,
  14_871_300,
  11_202_000,
  8_760_500,
  19_903_100,
  5_412_000,
  23_118_700,
  14_406_250,
  17_172_000,
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

/** The Sep run in numbers (Check step). */
export const SEP_RUN = {
  statements: QUEUE_AMOUNTS.length,
  /** What the 19 Statements add up to: carried + new lines, less credit. */
  balances: sum(QUEUE_AMOUNTS),
  belowMinimum: 4,
  credit: ILSE.credit,
};

const AUG_BILLED = 231_860_400;
/** D20 tolerance: payments within max(0.5%, 100k) settled these Statements; the rest was written off. */
export const AUG_WRITE_OFFS = { toleranceTotal: 128_900, toleranceCount: 3, lateLines: 3 };

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
    toSend: SEP_RUN.statements,
    // New lines only: the Statements' balances less what was carried from Aug and plus the credit applied.
    billed: SEP_RUN.balances - MINER_TOTALS.owed + SEP_RUN.credit,
    paid: 0,
    outstanding: 0,
    issued: 'Not sent',
  },
  {
    id: 'aug',
    period: 'Aug 2026',
    status: 'Sent',
    miners: 19,
    toSend: 0,
    billed: AUG_BILLED,
    paid: AUG_BILLED - MINER_TOTALS.owed - AUG_WRITE_OFFS.toleranceTotal,
    outstanding: MINER_TOTALS.owed,
    issued: '1 Sep',
  },
];

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
  /** EVE date, as the Tax tab prints it. */
  date: string;
  character: string;
  system: string;
  ore: string;
  units: number;
  payee: string;
  /** Est. value on the day mined. */
  value: number;
  /** Tax owed; null where the corp does not (yet) owe it: Pending, Conflict, Unattributed. */
  tax: number | null;
  state: PersonalState;
  note: string;
}

export const CORP_PAYEE = `${CORP.name} (Corp Tax Book)`;
export const MEMBER_ALT = 'Ilsa Verne';

export const PERSONAL_ROWS: PersonalRow[] = [
  {
    id: 1,
    date: '2026-10-18',
    character: MEMBER_ALT,
    system: 'Efa',
    ore: 'Cobaltite',
    units: 24_600,
    payee: CORP_PAYEE,
    value: Math.round(24_600 * PRICES.Cobaltite),
    tax: null,
    state: 'Pending corp record',
    note: 'Not owed yet. The corp records 18 Oct after 06:00 on 19 Oct and its next sync.',
  },
  {
    id: 2,
    date: '2026-10-17',
    character: 'SELF',
    system: 'Efa',
    ore: 'Zeolites',
    units: 43_050,
    payee: CORP_PAYEE,
    value: Math.round(43_050 * PRICES.Zeolites),
    tax: Math.round((43_050 * PRICES.Zeolites * 15) / 100),
    state: 'Billed',
    note: 'Safe to pay — 17 Oct is closed (the corp synced 2h ago, after its grace period).',
  },
  {
    id: 3,
    date: '2026-10-12',
    character: 'SELF',
    system: 'Kamela',
    ore: 'Bitumens',
    units: 30_000,
    payee: CORP_PAYEE,
    value: Math.round(30_000 * PRICES.Bitumens),
    tax: null,
    state: 'Conflict',
    note: `You gave this day to Ashfall Prospecting; the book observed 30,000 units. Not owed to anyone yet. It goes to ${CORP.name} on 1 Nov unless resolved.`,
  },
  {
    id: 4,
    date: '2026-10-11',
    character: 'SELF',
    system: 'Kamela',
    ore: 'Bitumens',
    units: 28_900,
    payee: CORP_PAYEE,
    value: Math.round(28_900 * PRICES.Bitumens),
    tax: 0,
    state: 'Dismissed by corp',
    note: 'Dismissed by Kestrel Vane: Corp mining op, no tax',
  },
  {
    id: 5,
    date: '2026-10-10',
    character: MEMBER_ALT,
    system: 'Kamela',
    ore: 'Zeolites',
    units: 35_300,
    payee: CORP_PAYEE,
    value: Math.round(35_300 * PRICES.Zeolites),
    tax: Math.round((35_300 * PRICES.Zeolites * 10) / 100),
    state: 'Sent, waiting for the corp',
    note: 'You donated this at 13:10 today, after the corp’s last sync (12:00). It shows as Paid once the corp syncs.',
  },
  {
    id: 6,
    date: '2026-10-13',
    character: 'SELF',
    system: 'Ouelletta',
    ore: 'Euxenite',
    units: 18_900,
    payee: '—',
    value: Math.round(18_900 * PRICES.Euxenite),
    tax: null,
    state: 'Unattributed',
    note: 'No Corp Tax Book observed this ore. Owed to no one.',
  },
  {
    id: 7,
    date: '2026-08-27',
    character: 'SELF',
    system: 'Efa',
    ore: 'Euxenite',
    units: 12_400,
    payee: CORP_PAYEE,
    value: Math.round(12_400 * PRICES.Euxenite),
    tax: Math.round((12_400 * PRICES.Euxenite * 10) / 100),
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
    {
      what: 'Tax',
      mine: Math.round((41_200 * PRICES.Zeolites * 10) / 100).toLocaleString('en'),
      book: Math.round((43_050 * PRICES.Zeolites * 15) / 100).toLocaleString('en'),
      differs: true,
    },
  ],
  disputed: 'Disputed: you 10%, book 15%',
  rateNote: 'Book rate 15% is the per-moon rate for Efa V - Moon 3, effective 1 Oct 2026',
};

/** The guest verify page: Tamsin Holloway's Aug 2026 Statement, issued 1 Sep (D27). */
export const VERIFY = {
  miner: 'Tamsin Holloway',
  period: 'Aug 2026',
  issued: '1 Sep 2026',
  due: '15 Sep 2026',
  code: 'BRML-7Q4K',
  lines: TAMSIN_AUG,
  billed: TAMSIN.augBilled,
  payments: [
    {
      id: 1,
      date: '2 Sep 20:14',
      from: 'Tamsin Holloway',
      amount: TAMSIN.paid,
      to: 'Aug 2026',
    },
  ],
  due_amount: TAMSIN.owed,
  declaration:
    'You told Brass Meridian Logistics on 14 Oct that you paid by contract. An officer will confirm it. Overdue is paused until 28 Oct.',
  terms: [
    { term: 'Rate', value: '15% (Guest default, effective 1 Aug 2026)' },
    { term: 'Price', value: 'Jita buy, Compressed ore, on the day mined' },
    { term: 'Due', value: '15 Sep 2026 (14 days after issue)' },
    {
      term: 'Minimum Statement',
      value: '5,000,000 ISK; smaller balances roll into the next month',
    },
    { term: 'Paying', value: 'Donate to Brass Meridian Logistics; any of your characters counts' },
  ],
};

export const VERIFY_TAX = VERIFY.billed;
