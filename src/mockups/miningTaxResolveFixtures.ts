/**
 * Sample data for the mining-tax "resolve" mockups: one pilot (Kestrel Vane) who mines
 * for two corporations' books and pays a personal Payee, with one of each problem the
 * traces found — uncredited donations, a Conflict day, a billed day the book rates higher,
 * a duplicate Assignment, an unlinked payment, and a corporation the pilot has left.
 */
import type { PayeeBalance } from '@/features/miningTax/balances';
import type { ConflictSummary } from '@/features/miningTax/corpBook/conflictSummary';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';

export const PILOT = SAMPLE_ACTIVE_CHARACTER.name;

/** The book the pilot's screenshots came from. */
export const BUH = {
  name: 'Bureau of Unified Harvesting',
  ceo: 'Varro Halden',
  officer: 'Imra Solace',
  list: 'BUH Tax Desk',
} as const;

/** A personal Payee: a buyback the pilot settles by hand. */
export const ROCK = { name: 'Rock Hound Collective' } as const;

/** The corporation the pilot has left. */
export const ASHFALL = {
  name: 'Ashfall Mining Co.',
  leftOn: '2026-11-02',
  owed: 12_400_000,
} as const;

export const DONATIONS = [
  { amount: 25_000_000, at: '2026-11-02 18:41', ref: 7_788_991, days: '2026-10-29, 2026-10-30' },
  { amount: 15_000_000, at: '2026-11-09 21:07', ref: 7_790_034, days: '2026-11-03' },
] as const;
export const DONATED = DONATIONS.reduce((sum, d) => sum + d.amount, 0);

export const CONFLICT = {
  date: '2026-11-04',
  system: 'Mobit',
  amount: 4_271_257,
  resolvesOn: '2026-11-18',
  ore: '41,200 Zeolites · 18,600 Sylvite',
} as const;

export const RATE_DAY = {
  date: '2026-11-06',
  system: 'Mobit',
  yours: '10%',
  book: '12%',
  yourTax: 1_533_600,
  bookTax: 1_840_320,
} as const;

export const DUPLICATE = { date: '2026-11-07', system: 'Ishomilken' } as const;

export const UNLINKED = { amount: 5_000_000, at: '2026-11-12 09:15' } as const;

const balance = (id: string, name: string, owed: number, dates: string[]) =>
  ({
    payee: { id, name },
    owed,
    members: dates.map((date) => ({ assignment: { date } })),
  }) as unknown as PayeeBalance;

export const BALANCES: PayeeBalance[] = [
  balance('corp-book:1', BUH.name, 31_280_000, [
    '2026-10-29',
    '2026-10-30',
    '2026-11-03',
    '2026-11-06',
  ]),
  balance('rock', ROCK.name, 8_420_000, ['2026-11-01', '2026-11-05', '2026-11-08']),
];

const conflicts = (waiting: number): ConflictSummary => ({
  days: 1,
  waiting,
  amount: CONFLICT.amount,
  first: {} as never,
  firstCorpName: BUH.name,
  firstResolvesOn: CONFLICT.resolvesOn,
});
export const CONFLICTS_OPEN = conflicts(0);
export const CONFLICTS_WAITING = conflicts(1);

export const isk = (n: number) => `${n.toLocaleString('en-US')} ISK`;

/** When the book last read the corporation's wallet, and how far back its wallet history goes. */
export const LAST_SYNC = '2026-11-16 14:00';
export const WALLET_FROM = '2026-10-01';

/** Tax the pilot paid straight to the CEO, not into the corporation's wallet. */
export const TO_CEO = {
  day: '2026-11-05',
  amount: 8_000_000,
  at: '2026-11-05 20:12',
  ref: 7_789_410,
  /** The same transfer in the CEO's own journal, under his own id. */
  theirRef: 4_410_023,
} as const;

/** A payment that went to another corporation altogether. */
export const TO_OTHER_CORP = { amount: 6_000_000, at: '2026-11-01 11:30', ref: 7_787_002 } as const;

/** Other members' claims, one per thing the wallet check can find. */
export const CLAIMS = {
  division: {
    who: 'Orsa Tellemar',
    amount: 12_000_000,
    at: '2026-11-12 08:05',
    division: 'Reserves (Division 3)',
    ref: 9_120_334,
  },
  old: { who: 'Brin Kael', amount: 9_000_000, at: '2026-09-03 16:20', ref: 6_002_187 },
  notInYours: { who: 'Orsa Tellemar', amount: 4_500_000, at: '2026-11-07 19:44', ref: 9_120_110 },
} as const;

/** Bureau's open days for the pilot, oldest first, and the one held while it answers. */
export const OPEN_DAYS = [
  { date: '2026-10-29', tax: 5_870_000 },
  { date: '2026-10-30', tax: 6_120_000 },
  { date: '2026-11-03', tax: 3_980_000 },
  { date: '2026-11-06', tax: 1_840_320, held: 'Not paying — waiting on Bureau' },
] as const;
/** What the pilot pays: exactly the two oldest days. */
export const PAYING = 11_990_000;
