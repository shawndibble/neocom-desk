import { describe, expect, it } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import { allContractsView, corpContractsView, currentContractsView } from './contractsHistoryView';
import type { AllContractsSnapshot } from './allContractsSnapshot';

const c = { contract_id: 5 } as Contract;

describe('contract history views', () => {
  it('current: every row belongs to the viewing Character, no Character column', () => {
    const view = currentContractsView(null, 91);
    expect(view.ownerOf(c)).toBe(91);
    expect(view.characterNameOf).toBeNull();
    expect(view.source).toBe('current');
  });

  it('corporation: the corporation is the owner, no Character column', () => {
    const view = corpContractsView({
      corporationId: 77,
      contractsResult: null,
      needsReauth: false,
      truncated: false,
      names: new Map(),
      receiverCategories: new Map(),
    });
    expect(view.ownerOf(c)).toBe(77);
    expect(view.characterNameOf).toBeNull();
  });

  it('all: owner and standings are per row, and a Character column is offered', () => {
    const own = new Map([[1, { standing: 5 }]]) as never;
    const snapshot = {
      ownerByContractId: new Map([[5, 2]]),
      characterNames: new Map([[2, 'Pilot 2']]),
      standingIndexByOwner: new Map([[2, own]]),
      skipped: [],
    } as unknown as AllContractsSnapshot;
    const view = allContractsView(snapshot);
    expect(view.ownerOf(c)).toBe(2);
    expect(view.standingIndexFor(2)).toBe(own);
    expect(view.standingIndexFor(3).size).toBe(0);
    expect(view.characterNameOf?.(c)).toBe('Pilot 2');
  });
});
