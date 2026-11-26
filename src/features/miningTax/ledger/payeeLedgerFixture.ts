import type { TaxPayment } from '@/engine/corpTaxBook/payments';
import { MinerRunningAccount } from '@/engine/corpTaxBook/minerRunningAccount';
import type {
  LedgerCharge,
  LedgerNotice,
  LedgerWriteOff,
  PayeeLedgerSource,
} from '@/engine/miningTax/payeeLedger';
import type { RecordChange } from '@/engine/miningTax/recordChanges';

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
  recordChanges?: RecordChange[];
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
    writeOffs: input.writeOffs?.map((w) => ({ id: w.id, amount: w.amount, at: w.at })),
  });
  return {
    account,
    charges: input.charges,
    payments: payments.map(({ id, at, from }) => ({ id, at, ...(from ? { from } : {}) })),
    ...(input.writeOffs ? { writeOffs: input.writeOffs } : {}),
    ...(input.notices ? { notices: input.notices } : {}),
    ...(input.recordChanges ? { recordChanges: input.recordChanges } : {}),
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
  recordChanges: [
    {
      id: 'tolerance:98000001:sample:2026-10-03',
      reason: 'tolerance',
      at: '2026-10-05T19:42:00Z',
      date: '2026-10-03',
      corporationId: 98000001,
      minerId: 'sample',
      closeOut: {
        billed: 5_500_000,
        paid: 5_490_000,
        writtenOff: 10_000,
        tolerancePct: 0.5,
        tolerance: 27_500,
        paymentId: 'p1',
      },
    },
    {
      id: 'autofix-1',
      reason: 'autoFix',
      at: '2026-10-18T00:05:00Z',
      date: '2026-10-17',
      corporationId: 98000001,
      assignments: [
        {
          assignmentId: 'as-17',
          before: {
            payeeId: 'payee-corp',
            taxPct: 12,
            taxOwed: 3_846_000,
            oreLines: [{ typeId: BITUMENS, quantity: 16_900 }],
          },
          after: {
            payeeId: 'payee-corp',
            taxPct: 10,
            taxOwed: 3_205_000,
            oreLines: [{ typeId: BITUMENS, quantity: 16_900 }],
          },
        },
      ],
    },
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

export const EMPTY_LEDGER: PayeeLedgerSource = sample({ charges: [] });

export const SUB_ISK_LEDGER: PayeeLedgerSource = sample({
  charges: [
    mined('s1', '2026-11-18', 6_000_756.144, TATARA, [[BITUMENS, 30_000]]),
    mined('s2', '2026-11-21', 3_869_888.4, TATARA, [[BITUMENS, 20_000]]),
  ],
  payments: [
    { id: 's3', amount: 6_000_756, at: '2026-11-20T10:00:00Z' },
    { id: 's4', amount: 3_869_888, at: '2026-11-22T10:00:00Z' },
  ],
});

export const CREDIT_LEDGER: PayeeLedgerSource = sample({
  charges: [
    mined('k1', '2026-11-02', 3_100_000, TATARA, [[BITUMENS, 16_300]]),
    mined('k2', '2026-11-04', 2_750_000, TATARA, [[BITUMENS, 14_400]]),
  ],
  payments: [{ id: 'q1', amount: 10_000_000, at: '2026-11-05T09:30:00Z', from: 'Iona Rask' }],
});
