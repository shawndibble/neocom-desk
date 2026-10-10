import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
          onPackShip={vi.fn()}
          rigsOf={() => 0}
          canPack={() => true}
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

  it('folds equal full trips into one range', () => {
    const big = { ...plan, totals: { ...plan.totals, totalM3: 350, trips: 4 } } as MovePlan;
    render(
      <MemoryRouter>
        <PlanResult
          state={{
            plan: big,
            destinationSystem: null,
            destinationStation: 'Amarr VIII',
            pickupSystems: new Map(),
          }}
          scope={{ characters: [], activeCharacterId: null } as never}
          compareOpen={false}
          onToggleCompare={vi.fn()}
          onBack={vi.fn()}
          onDone={vi.fn()}
          onPackShip={vi.fn()}
          rigsOf={() => 0}
          canPack={() => true}
          name={() => 'Tritanium'}
          placeLabel={() => 'Jita 4-4'}
          hueOf={() => 0}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Trips 1–3 · 100 m³ each')).toBeTruthy();
    expect(screen.getByText('Trip 4 · 50 m³')).toBeTruthy();
  });

  describe('Pack instead', () => {
    const shipPlan = {
      ...plan,
      perCharacter: [
        {
          ...plan.perCharacter[0],
          pickups: [
            {
              ...plan.perCharacter[0].pickups[0],
              ships: [{ itemId: 77, typeId: 648 }],
            },
          ],
        },
      ],
    } as MovePlan;
    const setup = (rigs: number) => {
      const onPackShip = vi.fn();
      render(
        <MemoryRouter>
          <PlanResult
            state={{
              plan: shipPlan,
              destinationSystem: null,
              destinationStation: 'Amarr VIII',
              pickupSystems: new Map(),
            }}
            scope={{ characters: [], activeCharacterId: null } as never}
            compareOpen={false}
            onToggleCompare={vi.fn()}
            onBack={vi.fn()}
            onDone={vi.fn()}
            onPackShip={onPackShip}
            rigsOf={() => rigs}
            canPack={() => true}
            name={() => 'Badger'}
            placeLabel={() => 'Jita 4-4'}
            hueOf={() => 0}
          />
        </MemoryRouter>
      );
      return onPackShip;
    };

    it('names each ship being flown beside the cargo trips', () => {
      setup(0);
      expect(screen.getByText('Fly Badger')).toBeTruthy();
    });

    it('still names the ship when nothing is hauled', () => {
      const none = {
        ...shipPlan,
        totals: { ...shipPlan.totals, totalM3: 0, trips: null },
        perCharacter: [
          {
            ...shipPlan.perCharacter[0],
            totalM3: 0,
            pickups: [{ ...shipPlan.perCharacter[0].pickups[0], totalM3: 0 }],
          },
        ],
        suggested: null,
        comparison: [],
      } as MovePlan;
      render(
        <MemoryRouter>
          <PlanResult
            state={{
              plan: none,
              destinationSystem: null,
              destinationStation: 'Amarr VIII',
              pickupSystems: new Map(),
            }}
            scope={{ characters: [], activeCharacterId: null } as never}
            compareOpen={false}
            onToggleCompare={vi.fn()}
            onBack={vi.fn()}
            onDone={vi.fn()}
            onPackShip={vi.fn()}
            rigsOf={() => 0}
            canPack={() => true}
            name={() => 'Badger'}
            placeLabel={() => 'Jita 4-4'}
            hueOf={() => 0}
          />
        </MemoryRouter>
      );
      expect(screen.getByText('Fly Badger')).toBeTruthy();
    });

    it('packs a ship with no rigs straight away', async () => {
      const onPackShip = setup(0);
      await userEvent.click(screen.getByRole('button', { name: 'Pack instead' }));
      expect(onPackShip).toHaveBeenCalledWith(77);
    });

    it('warns about fitted rigs first, and packs only once confirmed', async () => {
      const onPackShip = setup(2);
      await userEvent.click(screen.getByRole('button', { name: 'Pack instead' }));
      expect(onPackShip).not.toHaveBeenCalled();
      expect(await screen.findByText(/2 rigs fitted/)).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: "Don't remind me again" })).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Pack anyway' }));
      expect(onPackShip).toHaveBeenCalledWith(77);
    });
  });
});
