import { describe, expect, it } from 'vitest';
import { stockCostBasis } from './stockCostBasis';
import type { ProductionLot, WalletTrade } from './walletCostBasis';

let nextId = 1;
function trade(date: string, quantity: number, unitPrice: number, isBuy = true): WalletTrade {
  return {
    transactionId: nextId++,
    date,
    typeId: 34,
    quantity,
    unitPrice,
    isBuy,
    isPersonal: true,
  };
}
function run(date: string, quantity: number, unitCost: number): ProductionLot {
  return { date, typeId: 34, quantity, unitCost };
}

describe('stockCostBasis', () => {
  it('prices held units as the weighted average of the newest lots', () => {
    const trades = [trade('2026-01-01T00:00:00Z', 100, 10), trade('2026-01-02T00:00:00Z', 100, 20)];
    expect(stockCostBasis({ trades, runs: [], typeId: 34, held: 150 })).toEqual({
      unitCost: (100 * 20 + 50 * 10) / 150,
      totalCost: 100 * 20 + 50 * 10,
    });
  });

  it('consumes the oldest lot first when selling', () => {
    const trades = [
      trade('2026-01-01T00:00:00Z', 100, 10),
      trade('2026-01-02T00:00:00Z', 100, 20),
      trade('2026-01-03T00:00:00Z', 100, 99, false),
    ];
    expect(stockCostBasis({ trades, runs: [], typeId: 34, held: 100 })).toEqual({
      unitCost: 20,
      totalCost: 2000,
    });
  });

  it('counts a Production Run as a lot at its total cost over quantity', () => {
    const runs = [run('2026-01-01T00:00:00Z', 10, 55)];
    expect(stockCostBasis({ trades: [], runs, typeId: 34, held: 10 })).toEqual({
      unitCost: 55,
      totalCost: 550,
    });
  });

  it('lets a wallet sell consume a Production Run lot', () => {
    const runs = [run('2026-01-01T00:00:00Z', 10, 50), run('2026-01-03T00:00:00Z', 10, 70)];
    const trades = [trade('2026-01-02T00:00:00Z', 10, 1, false)];
    expect(stockCostBasis({ trades, runs, typeId: 34, held: 10 })).toEqual({
      unitCost: 70,
      totalCost: 700,
    });
  });

  it('is null when the history covers only part of what is held', () => {
    const trades = [trade('2026-01-01T00:00:00Z', 50, 10)];
    expect(stockCostBasis({ trades, runs: [], typeId: 34, held: 51 })).toBeNull();
  });

  it('is null when nothing is held', () => {
    const trades = [trade('2026-01-01T00:00:00Z', 50, 10)];
    expect(stockCostBasis({ trades, runs: [], typeId: 34, held: 0 })).toBeNull();
  });

  it('is null when a sell is larger than the known lots', () => {
    const trades = [
      trade('2026-01-01T00:00:00Z', 10, 10),
      trade('2026-01-02T00:00:00Z', 20, 10, false),
      trade('2026-01-03T00:00:00Z', 5, 10),
    ];
    expect(stockCostBasis({ trades, runs: [], typeId: 34, held: 5 })).toBeNull();
  });

  it('is null when a coverage gap falls after a lot that still counts', () => {
    const trades = [trade('2026-01-01T00:00:00Z', 10, 10)];
    const gaps: Array<[number, number]> = [
      [Date.parse('2026-01-05T00:00:00Z'), Date.parse('2026-01-20T00:00:00Z')],
    ];
    expect(stockCostBasis({ trades, runs: [], typeId: 34, held: 10, gaps })).toBeNull();
  });

  it('keeps a basis whose lots all postdate every coverage gap', () => {
    const trades = [trade('2026-02-01T00:00:00Z', 10, 10)];
    const gaps: Array<[number, number]> = [
      [Date.parse('2026-01-05T00:00:00Z'), Date.parse('2026-01-20T00:00:00Z')],
    ];
    expect(stockCostBasis({ trades, runs: [], typeId: 34, held: 10, gaps })?.unitCost).toBe(10);
  });
});
