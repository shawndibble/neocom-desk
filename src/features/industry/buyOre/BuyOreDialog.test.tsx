import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';

const prices = new Map<number, { sellMin: number | null; buyMax: number | null }>();
vi.mock('@/sde/loadSde', () => ({
  loadReprocessing: async () => ({
    '28430': { portionSize: 100, materials: [{ typeID: 34, quantity: 400 }] },
  }),
  loadCompressedOreTypeIds: async () => ({ '1230': 28430 }),
  loadTypes: async () => ({ '28430': { volume: 0.15 } }),
}));
vi.mock('@/market/prices', () => ({ getHubPrices: async () => prices }));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async () =>
    new Map([
      [28430, 'Compressed Veldspar'],
      [34, 'Tritanium'],
    ]),
}));
vi.mock('@/features/character/characterModifiers', () => ({
  loadCharacterModifiers: async () => ({ skills: {} }),
}));
vi.mock('../depthPriceLoader', () => ({ loadDepthPrices: async () => new Map() }));

import { BuyOreDialog } from './BuyOreDialog';

const needs = { 34: 1000 };
beforeEach(() => {
  prices.clear();
  prices.set(28430, { sellMin: 5, buyMax: 4 });
  prices.set(34, { sellMin: 6, buyMax: 5 });
});

describe('BuyOreDialog', () => {
  it('lists the ore, states the facility rate and offers the copy list when ore is cheaper', async () => {
    render(
      <BuyOreDialog
        open
        onClose={vi.fn()}
        hub={DEFAULT_TRADE_HUB}
        needs={needs}
        mineralsTotal={6000}
      />
    );
    // 1000 trit at 200 a batch = 5 batches = 500 units at 5 ISK = 2,500 ISK.
    expect(await screen.findByText('Compressed Veldspar')).toBeTruthy();
    expect(screen.getByText(/Refining at 50.0% base rate \(NPC station\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy buy list' })).toBeTruthy();
    expect(screen.getByText(/Cheapest found/)).toBeTruthy();
  });

  it('says buy minerals and offers no ore list when minerals are cheaper', async () => {
    render(
      <BuyOreDialog
        open
        onClose={vi.fn()}
        hub={DEFAULT_TRADE_HUB}
        needs={needs}
        mineralsTotal={1000}
      />
    );
    expect(await screen.findByText(/Buying the minerals is cheaper/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy buy list' })).toBeNull();
    expect(screen.queryByText('Compressed Veldspar')).toBeNull();
  });
});
