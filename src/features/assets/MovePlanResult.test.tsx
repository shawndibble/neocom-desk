import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MovePlan } from '@/engine/assets/movePlan';
import { PlanResult } from './MovePlanResult';

const hull = {
  typeId: 648,
  name: 'Badger',
  hullClass: 'Industrial',
  capacityM3: 100,
  owned: false,
};

const plan = {
  perCharacter: [
    {
      characterId: 1,
      name: 'Alice',
      totalM3: 150,
      pickups: [{ locationId: 60003760, lines: [], ships: [], unknownVolume: [], totalM3: 150 }],
    },
  ],
  totals: {
    stacks: 1,
    totalM3: 150,
    characters: 1,
    shipsToFly: 0,
    unknownVolumeCount: 0,
    trips: 2,
  },
  suggested: { hull, trips: 2 },
  comparison: [{ hull, trips: 2 }],
} as MovePlan;

describe('PlanResult', () => {
  it('has one Back control and puts the unit on each trip lane label', () => {
    render(
      <MemoryRouter>
        <PlanResult
          state={{
            plan,
            destinationSystem: null,
            destinationStation: 'Amarr VIII',
            pickupSystems: new Map(),
          }}
          scope={{ characters: [], activeCharacterId: null } as never}
          compareOpen={false}
          onToggleCompare={vi.fn()}
          onBack={vi.fn()}
          onDone={vi.fn()}
          name={() => 'Tritanium'}
          placeLabel={() => 'Jita 4-4'}
          hueOf={() => 0}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /edit items/i })).toBeNull();
    expect(screen.getByText('Trip 1 · 100 m³')).toBeTruthy();
    expect(screen.getByText('Trip 2 · 50 m³')).toBeTruthy();
  });
});
