import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { DisplayRow } from './groupRows';
import {
  findRowForPaymentRef,
  miningTaxPaymentHref,
  parsePaymentRefParam,
} from './paymentDeepLink';
import type { MoonMiningTaxRow } from './snapshot';

function assignment(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: 1,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'p1',
    oreLines: [],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'paid',
    updatedAt: 1,
    ...overrides,
  };
}

function displayRow(a: MiningTaxAssignmentRecord, date = a.date): DisplayRow {
  const row = { characterId: a.characterId, entry: { date } } as unknown as MoonMiningTaxRow;
  return { key: a.id, row, assignment: a, status: 'paid' };
}

const paidBy = (links: { journal?: number[]; contract?: number[] }) => ({
  paymentId: 'pay-1',
  paidOn: '2026-09-05',
  method: 'donation' as const,
  amount: 100,
  journalLinks: links.journal?.map((refId) => ({ refId, source: 'manual' as const })),
  contractLinks: links.contract?.map((refId) => ({ refId, source: 'manual' as const })),
});

describe('miningTaxPaymentHref / parsePaymentRefParam', () => {
  it('round-trips a journal entry and a contract', () => {
    expect(miningTaxPaymentHref({ kind: 'journal', id: 77 })).toBe(
      '/mining/tax?tax.payment=journal%3A77'
    );
    expect(parsePaymentRefParam('journal:77')).toEqual({ kind: 'journal', id: 77 });
    expect(parsePaymentRefParam('contract:5')).toEqual({ kind: 'contract', id: 5 });
  });

  it('rejects junk', () => {
    for (const raw of [null, '', 'journal', 'journal:0', 'journal:x', 'bogus:1', 'journal:-3']) {
      expect(parsePaymentRefParam(raw)).toBeNull();
    }
  });
});

describe('findRowForPaymentRef', () => {
  it('finds the row whose payment links the journal entry', () => {
    const hit = displayRow(assignment({ id: 'hit', payment: paidBy({ journal: [77] }) }));
    const miss = displayRow(assignment({ id: 'miss', payment: paidBy({ journal: [78] }) }));
    expect(findRowForPaymentRef([miss, hit], { kind: 'journal', id: 77 })).toBe(hit);
  });

  it('keeps journal and contract ids apart', () => {
    const row = displayRow(assignment({ payment: paidBy({ contract: [77] }) }));
    expect(findRowForPaymentRef([row], { kind: 'journal', id: 77 })).toBeNull();
    expect(findRowForPaymentRef([row], { kind: 'contract', id: 77 })).toBe(row);
  });

  it('reads a legacy single-field payment', () => {
    const legacy = { ...paidBy({}), journalRefId: 77 };
    const row = displayRow(assignment({ payment: legacy }));
    expect(findRowForPaymentRef([row], { kind: 'journal', id: 77 })).toBe(row);
  });

  it('picks the newest row when one payment covers several', () => {
    const older = displayRow(
      assignment({ id: 'o', payment: paidBy({ journal: [77] }) }),
      '2026-08-01'
    );
    const newer = displayRow(
      assignment({ id: 'n', payment: paidBy({ journal: [77] }) }),
      '2026-09-01'
    );
    expect(findRowForPaymentRef([older, newer], { kind: 'journal', id: 77 })).toBe(newer);
  });

  it('returns null when nothing links it', () => {
    expect(findRowForPaymentRef([displayRow(assignment())], { kind: 'journal', id: 1 })).toBeNull();
  });
});
