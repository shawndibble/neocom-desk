import { beforeEach, describe, expect, it, vi } from 'vitest';
import { quotePile } from './sellTo';

const mocks = vi.hoisted(() => ({
  loadAppraisalCatalogue: vi.fn(),
  loadTypes: vi.fn(),
  loadGroupCategories: vi.fn(),
  getHubPrices: vi.fn(),
}));
vi.mock('@/features/market/appraisalData', () => ({
  loadAppraisalCatalogue: mocks.loadAppraisalCatalogue,
}));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: mocks.loadTypes,
  loadGroupCategories: mocks.loadGroupCategories,
}));
vi.mock('@/market/prices', () => ({ getHubPrices: mocks.getHubPrices }));

const standing = {
  rate: 90,
  rateBasis: 'buy' as const,
  hubId: 'jita' as const,
  buyerCharacterId: null,
  buyLines: [{ kind: 'group' as const, group: 'ore' as const }],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadAppraisalCatalogue.mockResolvedValue(
    new Map([
      ['veldspar', { typeId: 1230, name: 'Veldspar' }],
      ['rifter', { typeId: 587, name: 'Rifter' }],
    ])
  );
  mocks.loadTypes.mockResolvedValue({
    '1230': { name: 'Veldspar', groupID: 462 },
    '587': { name: 'Rifter', groupID: 25 },
  });
  mocks.loadGroupCategories.mockResolvedValue({ '462': 25, '25': 6 });
  mocks.getHubPrices.mockResolvedValue(
    new Map([
      [1230, { sellMin: 12, buyMax: 10, sellVolume: 1, buyVolume: 1 }],
      [587, { sellMin: 1, buyMax: 1, sellVolume: 1, buyVolume: 1 }],
    ])
  );
});

describe('quotePile', () => {
  it('prices what the buy lines cover at the hub the Request names', async () => {
    const result = await quotePile('Veldspar\t1000\nRifter\t1\nNo Such Thing\t5', standing, 7);
    expect(result.quote.total).toBe(9000);
    expect(result.quote.quotedAt).toBe(7);
    expect(result.notBought).toEqual([{ typeId: 587, name: 'Rifter' }]);
    expect(result.unmatched).toEqual(['No Such Thing']);
    expect(mocks.getHubPrices).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'jita' }),
      [1230, 587]
    );
  });

  it('prices nothing for an empty paste', async () => {
    const result = await quotePile('   ', standing, 7);
    expect(result.quote.lines).toEqual([]);
    expect(result.quote.total).toBe(0);
    expect(mocks.getHubPrices).not.toHaveBeenCalled();
  });
});
