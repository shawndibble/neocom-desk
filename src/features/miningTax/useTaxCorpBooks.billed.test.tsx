import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CorpBookView } from './corpBook/corpBookView';
import type { TaxSnapshot } from './taxSnapshot';
import type { PayeeRecord } from '@/db';

const hoisted = vi.hoisted(() => ({
  view: null as CorpBookView | null,
  shownBooks: [] as { corporationId: number; memberCharacterIds: number[] }[],
}));

vi.mock('./useMadePayments', () => ({
  useMadePayments: () => ({ madePayments: [], paymentSources: [] }),
}));
vi.mock('@/features/miningTax/useMadePayments', () => ({
  useMadePayments: () => ({ madePayments: [], paymentSources: [] }),
}));
vi.mock('@/features/miningTax/corpBook/useAutoClaimDonations', () => ({
  useAutoClaimDonations: () => ({ failed: [] }),
}));
vi.mock('@/features/miningTax/corpBook/useToleranceRecordChanges', () => ({
  useToleranceRecordChanges: () => [],
}));
vi.mock('@/features/miningTax/corpBook/useBookAutoAssign', () => ({
  useBookAutoAssign: () => undefined,
}));
vi.mock('@/features/miningTax/corpBook/useClosedDayFixes', () => ({
  useClosedDayFixes: () => undefined,
  closedDayPlans: () => [],
}));
vi.mock('@/features/miningTax/corpBook/useBookSystems', () => ({
  useBookSystems: () => ({ names: new Map(), security: new Map() }),
}));
vi.mock('@/features/miningTax/corpBook/leftCorpAck', () => ({
  useHiddenLeftCorps: () => ({ hidden: new Set(), hide: vi.fn(), show: vi.fn() }),
}));
vi.mock('@/features/miningTax/corpBook/useCorpBookView', () => ({
  useCorpBookView: () => ({
    view: hoisted.view,
    booksRead: true,
    booksKnown: true,
    reload: vi.fn(),
    shownBooks: hoisted.shownBooks,
    corpNameOf: (id: number) => (id === 5 ? 'Ashfall' : `Corp ${id}`),
    hiddenLeft: [],
  }),
}));
const saveBookOwned = vi.hoisted(() => vi.fn(async () => true));
vi.mock('./paymentLinkStore', () => ({
  saveBilledElsewhere: vi.fn(async () => true),
  saveBookOwned,
}));

import { useTaxCorpBooks } from './useTaxCorpBooks';

const payee: PayeeRecord = {
  id: 'p1',
  characterId: 1,
  name: 'Ashfall',
  defaultTaxPct: 10,
  updatedAt: 1,
};
const assignment = {
  id: 'a1',
  payeeId: 'p1',
  date: '2026-10-17',
  status: 'billed',
  taxOwed: 3_000_000,
};

describe('useTaxCorpBooks billed elsewhere', () => {
  beforeEach(() => {
    hoisted.shownBooks = [];
    hoisted.view = {
      overlay: {
        absorbed: new Map([['x', ['a1']]]),
        trimmed: new Map(),
        alsoBilled: new Map(),
        conflicted: new Map(),
      },
    } as unknown as CorpBookView;
  });

  it('bills the overlay in the same render, not after the store settles', () => {
    const data = {
      entries: [{ assignments: [assignment] }],
      payeesByCharacter: new Map([[1, [payee]]]),
      paymentLinks: [],
      billedElsewhere: new Map(),
      systemNames: new Map(),
      systemSecurity: new Map(),
    } as unknown as TaxSnapshot;
    const { result } = renderHook(() => useTaxCorpBooks(data, [], null));
    expect(result.current.accounts.of('p1')?.owes?.amount ?? 0).toBe(0);
  });

  it('stores the Payees a book owns, an unlinked one named as its corporation included', async () => {
    hoisted.view = {
      ...hoisted.view,
      books: [{ left: false, corpName: 'Ashfall', loaded: { corporationId: 5 } }],
    } as unknown as CorpBookView;
    hoisted.shownBooks = [{ corporationId: 5, memberCharacterIds: [1] }];
    const data = {
      entries: [{ assignments: [assignment] }],
      payeesByCharacter: new Map([[1, [payee]]]),
      paymentLinks: [],
      billedElsewhere: new Map(),
      systemNames: new Map(),
      systemSecurity: new Map(),
    } as unknown as TaxSnapshot;
    const onOwnershipStored = vi.fn();
    const { result } = renderHook(() => useTaxCorpBooks(data, [], null, onOwnershipStored));
    expect(result.current.accounts.isBookOwned('p1')).toBe(true);
    expect(saveBookOwned).toHaveBeenCalledWith(new Set(['p1']));
    await saveBookOwned.mock.results.at(-1)?.value;
    await Promise.resolve();
    expect(onOwnershipStored).not.toHaveBeenCalled();

    const withDefaults = {
      ...data,
      payeesByCharacter: new Map([
        [1, [{ ...payee, defaultSystems: [{ systemId: 30000142, from: '2026-01-01' }] }]],
      ]),
    } as unknown as TaxSnapshot;
    const again = vi.fn();
    renderHook(() => useTaxCorpBooks(withDefaults, [], null, again));
    await vi.waitFor(() => expect(again).toHaveBeenCalledTimes(1));
  });
});
