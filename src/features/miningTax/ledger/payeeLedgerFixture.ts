/**
 * Sample Payee ledgers for the panel's stories and tests: a Corp Tax Book Payee with history, a
 * personal Payee, one with nothing billed and one in credit. Each Running account is built from
 * the same charges and payments the ledger describes, as a caller would.
 */
import type { TaxPayment } from '@/engine/corpTaxBook/allocation';
import { MinerRunningAccount } from '@/engine/corpTaxBook/minerRunningAccount';
import type {
  LedgerCharge,
  LedgerNotice,
  LedgerWriteOff,
  PayeeLedgerSource,
} from '@/engine/miningTax/payeeLedger';

const ZEOLITES = 45490;
const SYLVITE = 45491;
const BITUMENS = 45492;
const COESITE = 45493;

export const LEDGER_TYPE_NAMES: ReadonlyMap<number, string> = new Map([
  [ZEOLITES, 'Zeolites'],
  [SYLVITE, 'Sylvite'],
  [BITUMENS, 'Bitumens'],
  [COESITE, 'Coesite'],
]);

interface SamplePayment {
  id: string;
  amount: number;
  at: string;
  from?: string;
}

function sample(input: {
  charges: LedgerCharge[];
  payments?: SamplePayment[];
  writeOffs?: LedgerWriteOff[];
  notices?: LedgerNotice[];
}): PayeeLedgerSource {
  const payments = input.payments ?? [];
  const account = MinerRunningAccount.build({
    days: input.charges.map((c) => ({ date: c.date, tax: c.tax })),
    payments: payments.map((p): TaxPayment => ({
      id: p.id,
      minerId: 'sample',
      characterId: 1,
      amount: p.amount,
      at: p.at,
      source: 'donation',
    })),
    writeOffs: input.writeOffs?.map((w) => ({ id: w.id, amount: w.amount })),
  });
  return {
    account,
    charges: input.charges,
    payments: payments.map(({ id, at, from }) => ({ id, at, ...(from ? { from } : {}) })),
    ...(input.writeOffs ? { writeOffs: input.writeOffs } : {}),
    ...(input.notices ? { notices: input.notices } : {}),
  };
}

const mined = (
  id: string,
  date: string,
  tax: number,
  place: string,
  ore: [number, number][]
): LedgerCharge => ({
  id,
  date,
  kind: 'mined',
  tax,
  place,
  ore: ore.map(([typeId, quantity]) => ({ typeId, quantity })),
});

const ATHANOR = 'Hakonen - Moon 4 Athanor';
const TATARA = 'Hakonen - Moon 7 Tatara';

/**
 * A Corp Tax Book Payee: weeks of mining, a credit Adjustment, part payments (the second closes a
 * day within the tolerance), a late notice and an officer's write-off.
 */
export const CORP_BOOK_LEDGER: PayeeLedgerSource = sample({
  charges: [
    mined('c1', '2026-10-03', 4_120_000, ATHANOR, [
      [ZEOLITES, 18_400],
      [SYLVITE, 9_100],
    ]),
    mined('c2', '2026-10-03', 1_380_000, TATARA, [[BITUMENS, 7_250]]),
    mined('c3', '2026-10-09', 6_740_000, ATHANOR, [
      [ZEOLITES, 22_000],
      [COESITE, 11_600],
    ]),
    mined('c4', '2026-10-17', 3_205_000, TATARA, [[BITUMENS, 16_900]]),
    {
      id: 'adj1',
      date: '2026-10-20',
      kind: 'correction',
      tax: -450_000,
      reason: 'Rate was 10% for Tatara, not 12%',
    },
    mined('c5', '2026-10-28', 5_910_000, ATHANOR, [[SYLVITE, 30_200]]),
    mined('c6', '2026-11-06', 2_480_000, ATHANOR, [[ZEOLITES, 12_800]]),
  ],
  payments: [
    { id: 'p1', amount: 5_490_000, at: '2026-10-05T19:42:00Z', from: 'Varro Kestane' },
    { id: 'p2', amount: 6_280_000, at: '2026-10-21T08:15:00Z', from: 'Varro Kestane' },
  ],
  writeOffs: [
    { id: 'w1', at: '2026-11-08T12:00:00Z', amount: 1_000_000, reason: 'Fleet boost credit' },
  ],
  notices: [
    {
      id: 'n1',
      kind: 'late',
      issuedAt: '2026-11-01T11:00:00Z',
      lines: [
        { date: '2026-10-09', tax: 6_740_000 },
        { date: '2026-10-17', tax: 3_205_000 },
        { date: '2026-10-28', tax: 5_910_000 },
      ],
    },
  ],
});

/** A personal Payee: what the pilot owes another corporation's moon, paid from their own wallet. */
export const PERSONAL_LEDGER: PayeeLedgerSource = sample({
  charges: [
    mined('a1', '2026-10-12', 2_150_000, 'Otela VII - Moon 2', [[COESITE, 9_800]]),
    mined('a2', '2026-10-14', 1_870_000, 'Otela VII - Moon 2', [[COESITE, 8_500]]),
    mined('a3', '2026-10-25', 2_640_000, 'Otela VII - Moon 2', [
      [COESITE, 7_100],
      [SYLVITE, 4_200],
    ]),
  ],
  payments: [{ id: 'm1', amount: 4_000_000, at: '2026-10-26T20:10:00Z' }],
});

/** A Payee with nothing billed yet. */
export const EMPTY_LEDGER: PayeeLedgerSource = sample({ charges: [] });

/** A Payee who paid ahead: every day paid and money left over. */
export const CREDIT_LEDGER: PayeeLedgerSource = sample({
  charges: [
    mined('k1', '2026-11-02', 3_100_000, TATARA, [[BITUMENS, 16_300]]),
    mined('k2', '2026-11-04', 2_750_000, TATARA, [[BITUMENS, 14_400]]),
  ],
  payments: [{ id: 'q1', amount: 10_000_000, at: '2026-11-05T09:30:00Z', from: 'Iona Rask' }],
});
