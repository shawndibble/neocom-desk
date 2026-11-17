import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import '@/i18n';
import type { PayeeRecord } from '@/db';
import { useTaxPayeeNames } from './useTaxPayeeNames';

const payee = (id: string, characterId: number): PayeeRecord => ({
  id,
  characterId,
  name: 'BUH',
  defaultTaxPct: 10,
  updatedAt: 1,
});

describe('useTaxPayeeNames', () => {
  it("names an Assignment on a duplicate record, which the ledger's Payee list leaves out", () => {
    const a = payee('a', 1);
    const b = payee('b', 2);
    const { result } = renderHook(() =>
      useTaxPayeeNames(
        [a],
        new Map([
          ['a', a],
          ['b', b],
        ])
      )
    );
    expect(result.current.payeeName('b')).toBe('BUH');
    expect(result.current.payeeName('zzz')).toBe('Unknown Payee');
  });
});
