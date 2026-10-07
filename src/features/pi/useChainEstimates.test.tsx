import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import { colonyBudget } from './colonyBudget';
import type { ChainBasis } from './chainEstimateModel';
import { chainBasisKey, resetChainEstimates, useChainEstimates } from './useChainEstimates';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const ROBOTICS = 9848;
const COOLANT = 9832;

function basis(): ChainBasis {
  const book: Record<number, number> = {};
  const byTier: Record<number, number> = { 0: 5, 1: 400, 2: 8_000, 3: 60_000, 4: 1_000_000 };
  for (const raw of pi.raw) book[raw.typeID] = 5;
  for (const key of Object.keys(pi.schematics)) book[Number(key)] = byTier[piTier(Number(key), pi)];
  const cc = colonyBudget(5, pi);
  return {
    ccLevel: cc.level,
    ccAssumed: false,
    budget: cc.budget,
    newLinkCost: { cpu: 25, powergrid: 18 },
    linkCost: 'borrowed',
    headsPerExtractor: 10,
    ratePerHour: 6_000,
    rateSource: 'measured',
    taxRate: 0.1,
    books: { prices: book, revenuePrices: { ...book }, salesTaxPct: 4 },
    haulDays: 7,
  };
}

beforeEach(() => resetChainEstimates());

describe('useChainEstimates', () => {
  it('is pending first, then fills each P3/P4 in after the render, never a P1 or P2', async () => {
    const { result } = renderHook(() => useChainEstimates(basis(), pi));
    expect(result.current(ROBOTICS)).toBeUndefined();
    await waitFor(() => expect(result.current(ROBOTICS)?.iskPerDay).toBeGreaterThan(0), {
      timeout: 5_000,
    });
    expect(result.current(COOLANT)).toBeUndefined();
  });

  it('has no figures without assumptions', () => {
    const { result } = renderHook(() => useChainEstimates(null, pi));
    expect(result.current(ROBOTICS)).toBeNull();
  });

  it('keys by content: a rebuilt buyback book with the same prices is the same work', () => {
    const a = basis();
    const b = { ...a, books: { ...a.books, revenuePrices: { ...a.books.revenuePrices } } };
    expect(chainBasisKey(b, pi)).toBe(chainBasisKey(a, pi));
    const cheaper = { ...a.books.revenuePrices, [ROBOTICS]: 1 };
    expect(chainBasisKey({ ...a, books: { ...a.books, revenuePrices: cheaper } }, pi)).not.toBe(
      chainBasisKey(a, pi)
    );
  });
});
