import { describe, expect, it } from 'vitest';
import { contractStockAtMarket, type ContractStockInput } from './onContract';

const EFA = 1035466617946;
const JITA = 60003760;
const NOW = Date.parse('2026-11-04T12:00:00Z');

const entry = (
  over: Partial<ContractStockInput['contract']> = {},
  items: ContractStockInput['items'] = [{ type_id: 34, quantity: 5, is_included: true }],
  characterId = 1
): ContractStockInput => ({
  characterId,
  contract: {
    contract_id: 10,
    issuer_id: characterId,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    date_expired: '2026-12-01T00:00:00Z',
    start_location_id: EFA,
    ...over,
  },
  items,
});

describe('contractStockAtMarket', () => {
  it('counts the items of an own outstanding item exchange contract at the market', () => {
    const result = contractStockAtMarket([entry()], EFA, [34, 35], NOW);
    expect(result.get(34)).toEqual([{ characterId: 1, quantity: 5 }]);
    expect(result.get(35)).toEqual([]);
  });

  it('ignores contracts elsewhere, over, expired, corporation, courier and auction', () => {
    const result = contractStockAtMarket(
      [
        entry({ start_location_id: JITA }),
        entry({ status: 'finished' }),
        entry({ status: 'deleted' }),
        entry({ date_expired: '2026-11-01T00:00:00Z' }),
        entry({ for_corporation: true }),
        entry({ type: 'courier' }),
        entry({ type: 'auction' }),
        entry({ issuer_id: 99 }),
      ],
      EFA,
      [34],
      NOW
    );
    expect(result.get(34)).toEqual([]);
  });

  it('skips what the issuer asks for, and types not on the list', () => {
    const result = contractStockAtMarket(
      [
        entry({}, [
          { type_id: 34, quantity: 7, is_included: false },
          { type_id: 99, quantity: 3, is_included: true },
        ]),
      ],
      EFA,
      [34],
      NOW
    );
    expect(result.get(34)).toEqual([]);
  });

  it('adds up per Character, biggest first', () => {
    const result = contractStockAtMarket(
      [
        entry({ contract_id: 1 }, [{ type_id: 34, quantity: 2, is_included: true }], 1),
        entry({ contract_id: 2 }, [{ type_id: 34, quantity: 4, is_included: true }], 2),
        entry({ contract_id: 3 }, [{ type_id: 34, quantity: 3, is_included: true }], 1),
      ],
      EFA,
      [34],
      NOW
    );
    expect(result.get(34)).toEqual([
      { characterId: 1, quantity: 5 },
      { characterId: 2, quantity: 4 },
    ]);
  });
});
