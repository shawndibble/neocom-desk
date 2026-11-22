import { describe, expect, it } from 'vitest';
import { minerPaymentCode } from '../../../../functions/src/corpTaxBookLateNotice';
import { minerPayCodes, suggestedCode } from './minerPayCodes';
import type { CorpBookViewBook } from './corpBookView';

const book = (minerIds: string[]) =>
  ({
    summary: { miners: minerIds.map((minerId) => ({ minerId, code: minerPaymentCode(minerId) })) },
    loaded: { miners: [{ id: 'g1', characterIds: [2, 3], mainCharacterId: 2 }] },
  }) as unknown as CorpBookViewBook;

const names = new Map([
  [1, 'Main'],
  [2, 'Alt'],
  [3, 'Hauler'],
]);

describe('minerPayCodes', () => {
  // Audit bug 8: with no open notice there was no code at all.
  it("gives each of the member's Miners its own code, whether or not a notice is open", () => {
    expect(minerPayCodes(book(['solo:1', 'g1']), (id) => names.get(id))).toEqual([
      { code: minerPaymentCode('solo:1'), character: 'Main', characterIds: [1] },
      { code: minerPaymentCode('g1'), character: 'Alt, Hauler', characterIds: [2, 3] },
    ]);
  });
});

describe('suggestedCode', () => {
  const codes = minerPayCodes(book(['solo:1', 'g1']), (id) => names.get(id));

  it("suggests the payer's own Miner's code", () => {
    expect(suggestedCode(codes, 3)?.code).toBe(minerPaymentCode('g1'));
    expect(suggestedCode(codes, 1)?.code).toBe(minerPaymentCode('solo:1'));
  });

  it('suggests none for a payer the book holds no Miner of, or no payer across Miners', () => {
    expect(suggestedCode(codes, 9)).toBeUndefined();
    expect(suggestedCode(codes, undefined)).toBeUndefined();
    expect(suggestedCode(codes.slice(1), undefined)?.code).toBe(minerPaymentCode('g1'));
  });
});
