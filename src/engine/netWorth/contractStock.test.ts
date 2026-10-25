import { describe, expect, it } from 'vitest';
import {
  contractStockValue,
  openIssuedItemContracts,
  type StockContract,
  type StockContractItem,
} from './contractStock';

const NOW = Date.UTC(2026, 9, 7, 13, 0, 0);
const FUTURE = '2026-10-20T00:00:00Z';

function contract(over: Partial<StockContract> & { contract_id: number }): StockContract {
  return {
    issuer_id: 1,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    date_expired: FUTURE,
    ...over,
  };
}

const item = (over: Partial<StockContractItem> & { type_id: number }): StockContractItem => ({
  record_id: over.type_id,
  quantity: 1,
  is_included: true,
  ...over,
});

const prices = new Map([
  [34, 6],
  [35, 10],
]);

const value = (
  contracts: StockContract[],
  items: [number, StockContractItem[] | null][] = []
): number =>
  contractStockValue({
    characterId: 1,
    now: NOW,
    contracts,
    itemsByContractId: new Map(items),
    priceByTypeId: prices,
  });

describe('openIssuedItemContracts', () => {
  it('keeps own open item-exchange and auction contracts, nothing else', () => {
    const wanted = [contract({ contract_id: 1 }), contract({ contract_id: 2, type: 'auction' })];
    const rest = [
      contract({ contract_id: 3, issuer_id: 9 }),
      contract({ contract_id: 4, for_corporation: true }),
      contract({ contract_id: 5, status: 'finished' }),
      contract({ contract_id: 6, date_expired: '2026-10-01T00:00:00Z' }),
      contract({ contract_id: 7, type: 'courier' }),
      contract({ contract_id: 8, type: 'loan' }),
    ];
    expect(openIssuedItemContracts([...wanted, ...rest], 1, NOW).map((c) => c.contract_id)).toEqual(
      [1, 2]
    );
  });
});

describe('contractStockValue', () => {
  it('values the items the issuer hands over at item value', () => {
    expect(
      value(
        [contract({ contract_id: 1 })],
        [[1, [item({ type_id: 34, quantity: 10 }), item({ type_id: 35, quantity: 2 })]]]
      )
    ).toBe(80);
  });

  it('ignores items the acceptor must supply, and the contract price and collateral', () => {
    expect(
      value(
        [{ ...contract({ contract_id: 1 }), price: 999, collateral: 999 } as StockContract],
        [[1, [item({ type_id: 34, quantity: 10 }), item({ type_id: 35, is_included: false })]]]
      )
    ).toBe(60);
  });

  it('counts a courier reward in escrow, not its collateral', () => {
    const courier = {
      ...contract({ contract_id: 2, type: 'courier' }),
      reward: 5_000,
      collateral: 90_000,
    } as StockContract;
    expect(value([courier])).toBe(5_000);
    expect(value([{ ...courier, status: 'in_progress' }])).toBe(5_000);
  });

  it('leaves out a courier that is not own, corporate, finished or expired', () => {
    const base = { ...contract({ contract_id: 2, type: 'courier' }), reward: 5_000 };
    expect(value([{ ...base, issuer_id: 9 }])).toBe(0);
    expect(value([{ ...base, for_corporation: true }])).toBe(0);
    expect(value([{ ...base, status: 'finished' }])).toBe(0);
    expect(value([{ ...base, date_expired: '2026-10-01T00:00:00Z' }])).toBe(0);
  });

  it('leaves out a contract whose items were not read or cannot all be valued', () => {
    expect(value([contract({ contract_id: 1 })])).toBe(0);
    expect(value([contract({ contract_id: 1 })], [[1, null]])).toBe(0);
    expect(
      value([contract({ contract_id: 1 })], [[1, [item({ type_id: 34 }), item({ type_id: 99 })]]])
    ).toBe(0);
  });

  it('leaves out a contract holding a blueprint copy, which has no price', () => {
    expect(
      value([contract({ contract_id: 1 })], [[1, [item({ type_id: 34, raw_quantity: -2 })]]])
    ).toBe(0);
  });

  it('adds up several contracts', () => {
    expect(
      value(
        [
          contract({ contract_id: 1 }),
          contract({ contract_id: 2, type: 'auction' }),
          { ...contract({ contract_id: 3, type: 'courier' }), reward: 100 } as StockContract,
        ],
        [
          [1, [item({ type_id: 34, quantity: 5 })]],
          [2, [item({ type_id: 35, quantity: 1 })]],
        ]
      )
    ).toBe(140);
  });
});
