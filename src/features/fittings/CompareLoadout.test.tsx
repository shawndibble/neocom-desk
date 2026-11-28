import '@/i18n';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Fitting } from '@/engine/fittings/types';
import { CompareLoadout } from './CompareLoadout';

vi.mock('@/features/character/useTypeNames', () => ({
  useTypeNames: () =>
    new Map([
      [1, 'Ballistic Control System II'],
      [2, 'Damage Control II'],
    ]),
}));

const low = (typeIds: number[]): Fitting => ({
  name: 'Fit',
  shipTypeId: 24698,
  modules: typeIds.map((typeId, slotIndex) => ({
    slot: 'low',
    slotIndex,
    typeId,
    state: 'online',
  })),
  drones: [],
  cargo: [],
});

describe('CompareLoadout', () => {
  it('dims what every Fitting carries and marks the rest, counting copies', () => {
    render(
      <CompareLoadout
        fittings={[low([1, 1, 2]), low([1, 1, 1])]}
        columns={[
          { letter: 'A', position: 0 },
          { letter: 'B', position: 1 },
        ]}
      />
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      '2× Ballistic Control System II',
      'Damage Control II (not in every Fitting)',
      '2× Ballistic Control System II',
      'Ballistic Control System II (not in every Fitting)',
    ]);
  });
});
