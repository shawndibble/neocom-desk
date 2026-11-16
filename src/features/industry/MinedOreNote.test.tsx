import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { db } from '@/db';
import { utcDay } from '@/engine/localDay';

vi.mock('@/sde/loadSde', () => ({
  loadReprocessing: async () => ({
    '1230': { portionSize: 100, materials: [{ typeID: 34, quantity: 400 }] },
  }),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async () =>
    new Map([
      [1230, 'Veldspar'],
      [34, 'Tritanium'],
      [38, 'Nocxium'],
    ]),
}));

import { MinedOreNote } from './MinedOreNote';

beforeEach(async () => {
  await db.miningLedgerHistory.clear();
});

describe('MinedOreNote', () => {
  it('names mined ores per short mineral and the minerals to buy', async () => {
    await db.miningLedgerHistory.put({
      characterId: 1,
      fetchedAt: 0,
      rows: [{ date: utcDay(), quantity: 5, solar_system_id: 1, type_id: 1230 }],
    });
    render(<MinedOreNote shortMinerals={[34, 38]} onBuyOre={vi.fn()} />);
    expect(await screen.findByText('Veldspar', { exact: false })).toBeTruthy();
    expect(screen.getByText(/Buy these: Nocxium/)).toBeTruthy();
  });

  it('explains an empty history', async () => {
    render(<MinedOreNote shortMinerals={[34]} onBuyOre={vi.fn()} />);
    expect(await screen.findByText(/No mining history on this device/)).toBeTruthy();
  });
});
