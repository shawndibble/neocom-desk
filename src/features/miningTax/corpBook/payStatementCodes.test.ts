import { describe, expect, it } from 'vitest';
import { payStatementCodes, suggestedCode } from './payStatementCodes';
import type { CorpBookViewBook } from './corpBookView';

const open = (id: string, minerId: string, periodStart: string, periodEnd: string) => ({
  statementId: id,
  minerId,
  code: id.toUpperCase(),
  periodStart,
  periodEnd,
  issuedAt: `${periodEnd}T12:00:00Z`,
});

const book = (over: Partial<CorpBookViewBook['loaded']> = {}) =>
  ({
    summary: {
      openStatements: [
        open('s1', 'solo:1', '2026-09-01', '2026-09-30'),
        open('s2', 'g1', '2026-10-01', '2026-10-31'),
      ],
    },
    loaded: {
      statements: [{ id: 's1' }, { id: 's2' }],
      miners: [{ id: 'g1', characterIds: [2, 3], mainCharacterId: 2 }],
      ...over,
    },
  }) as unknown as CorpBookViewBook;

const names = new Map([
  [1, 'Main'],
  [2, 'Alt'],
  [3, 'Hauler'],
]);

describe('payStatementCodes', () => {
  it("lists the book's open Statements oldest first, each with whose it is", () => {
    expect(payStatementCodes(book(), (id) => names.get(id))).toEqual([
      { code: 'S1', period: 'Sep 2026', character: 'Main', characterIds: [1] },
      { code: 'S2', period: 'Oct 2026', character: 'Alt, Hauler', characterIds: [2, 3] },
    ]);
  });

  it("prefers the Miner's name the officer stored with the Statement", () => {
    const named = book({
      statements: [{ id: 's1', minerName: 'Main Pilot' }, { id: 's2' }],
    } as Partial<CorpBookViewBook['loaded']>);
    expect(payStatementCodes(named, (id) => names.get(id))[0].character).toBe('Main Pilot');
  });
});

describe('suggestedCode', () => {
  const codes = payStatementCodes(book(), (id) => names.get(id));

  it("suggests the oldest open Statement of the payer's own Miner", () => {
    expect(suggestedCode(codes, 3)?.code).toBe('S2');
    expect(suggestedCode(codes, 1)?.code).toBe('S1');
  });

  it("suggests none when the payer's Miner has none open, or no payer is known across Miners", () => {
    expect(suggestedCode(codes, 9)).toBeUndefined();
    expect(suggestedCode(codes, undefined)).toBeUndefined();
    expect(suggestedCode(codes.slice(1), undefined)?.code).toBe('S2');
  });
});
