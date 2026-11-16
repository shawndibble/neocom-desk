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
