import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CorpBookView } from '@/features/miningTax/corpBook/corpBookView';
import type { TrackedCharacter } from '@/features/miningTax/snapshot';
import { useTaxPayeeManager } from './useTaxPayeeManager';

vi.mock('@/lib/useIsNarrow', () => ({ useIsNarrow: () => false }));

const characters = [{ characterId: 90000001, characterName: 'Kestrel Vane' }] as TrackedCharacter[];

function view(p: { rows?: number; pendingFrom?: string }): CorpBookView {
  return {
    overlay: { rows: Array.from({ length: p.rows ?? 0 }, () => ({})) },
    books: [{ ...(p.pendingFrom ? { pendingFrom: p.pendingFrom } : {}) }],
    payees: [],
    claims: [],
  } as unknown as CorpBookView;
}

const needsFirstPayee = (corpView: CorpBookView | null) =>
  renderHook(() => useTaxPayeeManager(true, characters, 90000001, [], corpView)).result.current
    .needsFirstPayee;

describe('useTaxPayeeManager: the first-Payee empty state', () => {
  it('shows with no Payee and no book', () => {
    expect(needsFirstPayee(null)).toBe(true);
  });

  it('is not shown for a book that billed the member something', () => {
    expect(needsFirstPayee(view({ rows: 1 }))).toBe(false);
  });

  it("is not shown for a member whose first day in a book is still today's mining", () => {
    expect(needsFirstPayee(view({ pendingFrom: '2026-11-22' }))).toBe(false);
  });

  it('is shown for a book that has nothing of the member yet', () => {
    expect(needsFirstPayee(view({}))).toBe(true);
  });
});
