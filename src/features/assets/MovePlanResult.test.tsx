import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { Haul, HaulerOption, MovePlan } from '@/engine/assets/movePlan';
import { PlanResult } from './MovePlanResult';

const hull = {
  typeId: 648,
  name: 'Badger',
  hullClass: 'Industrial',
  capacityM3: 100,
  holds: [{ kind: 'cargo' as const, capacityM3: 100 }],
  owned: false,
  canFly: true,
};

const cargoHaul = (m3: number): Haul => ({
  usedM3: m3,
  iskValue: 0,
  holds: [
    {
      kind: 'cargo',
      capacityM3: 100,
      usedM3: m3,
      lines: [{ typeId: 34, quantity: m3, m3 }],
    },
  ],
});

const hauledBy = (hauls: Haul[], unfit: never[] = []) => ({
  hull,
  trips: hauls.length,
  unfitCount: unfit.length,
  overLimitCount: 0,
  tooBigCount: 0,
  pickups: [{ characterId: 1, locationId: 60003760, hauls, unfit, overLimit: [], tooBigShips: [] }],
});

const plan = {
  perCharacter: [
    {
      characterId: 1,
      name: 'Alice',
      totalM3: 150,
      pickups: [
        {
          locationId: 60003760,
          lines: [],
          ships: [],
          packed: [],
          unknownVolume: [],
          totalM3: 150,
        },
      ],
    },
  ],
  totals: {
    stacks: 1,
    totalM3: 150,
    characters: 1,
    shipsToFly: 0,
    unknownVolumeCount: 0,
    unpricedCount: 0,
    trips: 2,
  },
  suggested: hauledBy([cargoHaul(100), cargoHaul(50)]),
  active: null,
  comparison: [hauledBy([cargoHaul(100), cargoHaul(50)])],
} as MovePlan;

/** Fixtures set `suggested`; with no override the active hauler is that. */
const withActive = (p: MovePlan): MovePlan => ({ ...p, active: p.suggested });

const shipPlan = {
  ...plan,
  totals: { ...plan.totals, shipsToFly: 1 },
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

describe('PlanResult', () => {
  it('has one Back control and lists each haul with what goes in each hold', () => {
    render(
      <MemoryRouter>
        <PlanResult
          maxIsk={null}
          onChangeMaxIsk={() => {}}
          state={{
            plan: withActive(plan),
            destinationSystem: null,
            destinationStation: 'Amarr VIII',
            pickupSystems: new Map(),
          }}
          compareOpen={false}
          headingRef={{ current: null }}
          onToggleCompare={vi.fn()}
          haulerOverride={undefined}
          onPickHauler={vi.fn()}
          onBack={vi.fn()}
          onPackShip={vi.fn()}
          onUnpackShip={vi.fn()}
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
    expect(screen.getByRole('heading', { name: 'Haul 1 of 2' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Haul 2 of 2' })).toBeTruthy();
    expect(screen.getAllByText('Cargo hold')).toHaveLength(2);
    expect(screen.getByText('50 of 100 m³')).toBeTruthy();
  });

  it('folds equal full hauls into one range', () => {
    const hauls = [cargoHaul(100), cargoHaul(100), cargoHaul(100), cargoHaul(50)];
    const big = {
      ...plan,
      totals: { ...plan.totals, totalM3: 350, trips: 4 },
      suggested: hauledBy(hauls),
    } as MovePlan;
    render(
      <MemoryRouter>
        <PlanResult
          maxIsk={null}
          onChangeMaxIsk={() => {}}
          state={{
            plan: withActive(big),
            destinationSystem: null,
            destinationStation: 'Amarr VIII',
            pickupSystems: new Map(),
          }}
          compareOpen={false}
          headingRef={{ current: null }}
          onToggleCompare={vi.fn()}
          haulerOverride={undefined}
          onPickHauler={vi.fn()}
          onBack={vi.fn()}
          onPackShip={vi.fn()}
          onUnpackShip={vi.fn()}
          rigsOf={() => 0}
          canPack={() => true}
          name={() => 'Tritanium'}
          placeLabel={() => 'Jita 4-4'}
          hueOf={() => 0}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Hauls 1–3 of 4 · same load each' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Haul 4 of 4' })).toBeTruthy();
  });

  it('shows the fleet hangar apart from the cargo hold, and what the hauler leaves behind', () => {
    const haul: Haul = {
      usedM3: 50_100,
      iskValue: 0,
      holds: [
        {
          kind: 'fleetHangar',
          capacityM3: 50_000,
          usedM3: 50_000,
          lines: [{ typeId: 47466, quantity: 1, m3: 50_000 }],
        },
        {
          kind: 'cargo',
          capacityM3: 4_500,
          usedM3: 100,
          lines: [{ typeId: 34, quantity: 100, m3: 100 }],
        },
      ],
    };
    const withUnfit = {
      ...plan,
      suggested: {
        ...hauledBy([haul]),
        unfitCount: 1,
        overLimitCount: 0,
        pickups: [
          {
            characterId: 1,
            locationId: 60003760,
            hauls: [haul],
            unfit: [{ typeId: 28661, quantity: 1, unitM3: 50_000 }],
            overLimit: [],
            tooBigShips: [],
          },
        ],
      },
    } as MovePlan;
    render(
      <MemoryRouter>
        <PlanResult
          maxIsk={null}
          onChangeMaxIsk={() => {}}
          state={{
            plan: withActive(withUnfit),
            destinationSystem: null,
            destinationStation: 'Amarr VIII',
            pickupSystems: new Map(),
          }}
          compareOpen={false}
          headingRef={{ current: null }}
          onToggleCompare={vi.fn()}
          haulerOverride={undefined}
          onPickHauler={vi.fn()}
          onBack={vi.fn()}
          onPackShip={vi.fn()}
          onUnpackShip={vi.fn()}
          rigsOf={() => 0}
          canPack={() => true}
          name={(typeId) =>
            typeId === 47466 ? 'Praxis' : typeId === 28661 ? 'Kronos' : 'Tritanium'
          }
          placeLabel={() => 'Jita 4-4'}
          hueOf={() => 0}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Fleet hangar')).toBeTruthy();
    expect(screen.getByText('Cargo hold')).toBeTruthy();
    expect(screen.getByText('50,000 of 50,000 m³')).toBeTruthy();
    expect(screen.getByText('Praxis')).toBeTruthy();
    expect(screen.getByRole('heading', { name: "Won't fit this hauler" })).toBeTruthy();
    expect(screen.getByText('Kronos')).toBeTruthy();
    expect(screen.getByText(/cannot carry 1 stack whole/)).toBeTruthy();
  });

  it('says which compared haulers leave stacks behind, so fewer trips are not misread', () => {
    const lesser = {
      ...hauledBy([cargoHaul(100)]),
      hull: { ...hull, typeId: 649, name: 'Wreathe' },
      unfitCount: 1,
      overLimitCount: 0,
    };
    const many = {
      ...plan,
      suggested: hauledBy([cargoHaul(100), cargoHaul(50)]),
      comparison: [hauledBy([cargoHaul(100), cargoHaul(50)]), lesser],
    } as MovePlan;
    render(
      <MemoryRouter>
        <PlanResult
          maxIsk={null}
          onChangeMaxIsk={() => {}}
          state={{
            plan: withActive(many),
            destinationSystem: null,
            destinationStation: 'Amarr VIII',
            pickupSystems: new Map(),
          }}
          compareOpen={false}
          headingRef={{ current: null }}
          onToggleCompare={vi.fn()}
          haulerOverride={undefined}
          onPickHauler={vi.fn()}
          onBack={vi.fn()}
          onPackShip={vi.fn()}
          onUnpackShip={vi.fn()}
          rigsOf={() => 0}
          canPack={() => true}
          name={() => 'Tritanium'}
          placeLabel={() => 'Jita 4-4'}
          hueOf={() => 0}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/leaves 1 stack behind/)).toBeTruthy();
  });

  it('lists a packed ship with Fly instead, and flags one too big for the hauler', async () => {
    const onUnpackShip = vi.fn();
    const tooBigPlan = {
      ...plan,
      perCharacter: [
        {
          ...plan.perCharacter[0],
          pickups: [
            {
              ...plan.perCharacter[0].pickups[0],
              packed: [{ itemId: 9, typeId: 47466 }],
            },
          ],
        },
      ],
      suggested: {
        ...hauledBy([cargoHaul(100)]),
        tooBigCount: 1,
        pickups: [
          {
            characterId: 1,
            locationId: 60003760,
            hauls: [cargoHaul(100)],
            unfit: [],
            overLimit: [],
            tooBigShips: [{ typeId: 47466, quantity: 1, unitM3: 50_000 }],
          },
        ],
      },
    } as MovePlan;
    render(
      <MemoryRouter>
        <PlanResult
          maxIsk={null}
          onChangeMaxIsk={() => {}}
          state={{
            plan: withActive(tooBigPlan),
            destinationSystem: null,
            destinationStation: 'Amarr VIII',
            pickupSystems: new Map(),
          }}
          compareOpen={false}
          headingRef={{ current: null }}
          onToggleCompare={vi.fn()}
          haulerOverride={undefined}
          onPickHauler={vi.fn()}
          onBack={vi.fn()}
          onPackShip={vi.fn()}
          onUnpackShip={onUnpackShip}
          rigsOf={() => 0}
          canPack={() => true}
          name={(typeId) => (typeId === 47466 ? 'Praxis' : 'Tritanium')}
          placeLabel={() => 'Jita 4-4'}
          hueOf={() => 0}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/1 packed ship is too big for Badger/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Too big to carry/ })).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Fly Praxis instead of packing it' }));
    expect(onUnpackShip).toHaveBeenCalledWith(9);
    // 1 haul + 1 forced flight
    expect(screen.getByText('trips').parentElement?.textContent).toBe('2trips');
  });

  describe('Pack instead', () => {
    const setup = (rigs: number) => {
      const onPackShip = vi.fn();
      render(
        <MemoryRouter>
          <PlanResult
            maxIsk={null}
            onChangeMaxIsk={() => {}}
            state={{
              plan: withActive(shipPlan),
              destinationSystem: null,
              destinationStation: 'Amarr VIII',
              pickupSystems: new Map(),
            }}
            compareOpen={false}
            headingRef={{ current: null }}
            onToggleCompare={vi.fn()}
            haulerOverride={undefined}
            onPickHauler={vi.fn()}
            onBack={vi.fn()}
            onPackShip={onPackShip}
            onUnpackShip={vi.fn()}
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

    it('counts each flown ship as a trip on top of the hauls', () => {
      setup(0);
      expect(screen.getByText('2 hauls + 1 ship')).toBeTruthy();
      expect(screen.getByText('trips').parentElement?.textContent).toBe('3trips');
    });

    it('names each ship being flown under one labelled section', () => {
      setup(0);
      expect(screen.getByText('Flying instead of packing:').parentElement?.textContent).toContain(
        'Badger'
      );
      expect(screen.queryByText('Fly Badger')).toBeNull();
    });

    it('groups duplicate hulls with a count', () => {
      const two = {
        ...shipPlan,
        perCharacter: [
          {
            ...shipPlan.perCharacter[0],
            pickups: [
              {
                ...shipPlan.perCharacter[0].pickups[0],
                ships: [
                  ...shipPlan.perCharacter[0].pickups[0].ships,
                  { ...shipPlan.perCharacter[0].pickups[0].ships[0], itemId: 501 },
                ],
              },
            ],
          },
        ],
      } as MovePlan;
      render(
        <MemoryRouter>
          <PlanResult
            maxIsk={null}
            onChangeMaxIsk={() => {}}
            state={{
              plan: withActive(two),
              destinationSystem: null,
              destinationStation: 'Amarr VIII',
              pickupSystems: new Map(),
            }}
            compareOpen={false}
            headingRef={{ current: null }}
            onToggleCompare={vi.fn()}
            haulerOverride={undefined}
            onPickHauler={vi.fn()}
            onBack={vi.fn()}
            onPackShip={vi.fn()}
            onUnpackShip={vi.fn()}
            rigsOf={() => 0}
            canPack={() => true}
            name={() => 'Badger'}
            placeLabel={() => 'Jita 4-4'}
            hueOf={() => 0}
          />
        </MemoryRouter>
      );
      expect(screen.getByText('Flying instead of packing:').parentElement?.textContent).toContain(
        'Badger ×2'
      );
    });

    it('still names the ship when nothing is hauled', () => {
      // no hauler to suggest: the ship trips still head the plan
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
            maxIsk={null}
            onChangeMaxIsk={() => {}}
            state={{
              plan: withActive(none),
              destinationSystem: null,
              destinationStation: 'Amarr VIII',
              pickupSystems: new Map(),
            }}
            compareOpen={false}
            headingRef={{ current: null }}
            onToggleCompare={vi.fn()}
            haulerOverride={undefined}
            onPickHauler={vi.fn()}
            onBack={vi.fn()}
            onPackShip={vi.fn()}
            onUnpackShip={vi.fn()}
            rigsOf={() => 0}
            canPack={() => true}
            name={() => 'Badger'}
            placeLabel={() => 'Jita 4-4'}
            hueOf={() => 0}
          />
        </MemoryRouter>
      );
      expect(screen.getByText('Flying instead of packing:').parentElement?.textContent).toContain(
        'Badger'
      );
      expect(screen.getByText('1 ship')).toBeTruthy();
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

  describe('focus after Pack instead', () => {
    /** Packing moves the ship from `ships` to `lines`, so the Pack button disappears. */
    function Harness({ rigs }: { rigs: number }) {
      const [packed, setPacked] = useState(false);
      const pickup = shipPlan.perCharacter[0].pickups[0];
      const next = packed
        ? ({
            ...shipPlan,
            perCharacter: [
              {
                ...shipPlan.perCharacter[0],
                pickups: [{ ...pickup, ships: [], lines: [{ typeId: 648, quantity: 1, m3: 5 }] }],
              },
            ],
          } as MovePlan)
        : shipPlan;
      return (
        <MemoryRouter>
          <PlanResult
            maxIsk={null}
            onChangeMaxIsk={() => {}}
            state={{
              plan: withActive(next),
              destinationSystem: null,
              destinationStation: 'Amarr VIII',
              pickupSystems: new Map(),
            }}
            compareOpen={false}
            headingRef={{ current: null }}
            onToggleCompare={vi.fn()}
            haulerOverride={undefined}
            onPickHauler={vi.fn()}
            onBack={vi.fn()}
            onPackShip={() => setPacked(true)}
            onUnpackShip={() => setPacked(false)}
            rigsOf={() => rigs}
            canPack={() => true}
            name={() => 'Badger'}
            placeLabel={() => 'Jita 4-4'}
            hueOf={() => 0}
          />
        </MemoryRouter>
      );
    }

    it('lands on the pickup heading when the ship packs straight away', async () => {
      render(<Harness rigs={0} />);
      await userEvent.click(screen.getByRole('button', { name: 'Pack instead' }));
      expect(screen.queryByRole('button', { name: 'Pack instead' })).toBeNull();
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('heading', { name: /Jita 4-4/ }))
      );
    });

    it('lands on the pickup heading after the rig warning closes', async () => {
      render(<Harness rigs={2} />);
      await userEvent.click(screen.getByRole('button', { name: 'Pack instead' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Pack anyway' }));
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('heading', { name: /Jita 4-4/ }))
      );
    });
  });

  const renderWith = (
    p: MovePlan,
    onShowRoute: (() => void) | undefined,
    destinationSystem: number | null
  ) =>
    render(
      <MemoryRouter>
        <PlanResult
          maxIsk={null}
          onChangeMaxIsk={() => {}}
          state={{
            plan: p,
            destinationSystem,
            destinationStation: 'Amarr VIII',
            pickupSystems: new Map(),
          }}
          compareOpen={false}
          headingRef={{ current: null }}
          onToggleCompare={vi.fn()}
          haulerOverride={undefined}
          onPickHauler={vi.fn()}
          onBack={vi.fn()}
          onShowRoute={onShowRoute}
          onPackShip={vi.fn()}
          onUnpackShip={vi.fn()}
          rigsOf={() => 0}
          canPack={() => true}
          name={() => 'Tritanium'}
          placeLabel={() => 'Jita 4-4'}
          hueOf={() => 0}
        />
      </MemoryRouter>
    );

  it('offers one Show my route for the plan, and no Route Safety link per pickup', async () => {
    const onShowRoute = vi.fn();
    renderWith(withActive(plan), onShowRoute, 30000142);
    await userEvent.click(screen.getByRole('button', { name: 'Show my route' }));
    expect(onShowRoute).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: /Route Safety/ })).toBeNull();
  });

  it('offers Show my route when only ships are picked, with no hauler to plan', async () => {
    const onShowRoute = vi.fn();
    renderWith({ ...shipPlan, active: null }, onShowRoute, 30000142);
    await userEvent.click(screen.getByRole('button', { name: 'Show my route' }));
    expect(onShowRoute).toHaveBeenCalledTimes(1);
  });

  it('has no Show my route without a hauler', () => {
    renderWith(plan, vi.fn(), 30000142);
    expect(screen.queryByRole('button', { name: 'Show my route' })).toBeNull();
  });

  describe('max ISK per haul', () => {
    const limited = (over: Partial<MovePlan['totals']>, active: Partial<HaulerOption> = {}) =>
      withActive({
        ...plan,
        totals: { ...plan.totals, ...over },
        suggested: { ...plan.suggested!, ...active },
      } as MovePlan);
    const show = (p: MovePlan, maxIsk: number | null, pricesUnavailable = false) =>
      render(
        <MemoryRouter>
          <PlanResult
            maxIsk={maxIsk}
            onChangeMaxIsk={() => {}}
            state={{
              plan: p,
              destinationSystem: null,
              destinationStation: 'Amarr VIII',
              pickupSystems: new Map(),
              pricesUnavailable,
            }}
            compareOpen={false}
            headingRef={{ current: null }}
            onToggleCompare={vi.fn()}
            haulerOverride={undefined}
            onPickHauler={vi.fn()}
            onBack={vi.fn()}
            onPackShip={vi.fn()}
            onUnpackShip={vi.fn()}
            rigsOf={() => 0}
            canPack={() => true}
            name={() => 'Tritanium'}
            placeLabel={() => 'Jita 4-4'}
            hueOf={() => 0}
          />
        </MemoryRouter>
      );

    it('shows the input beside the hauler picker', () => {
      show(limited({}), null);
      expect(screen.getByRole('textbox', { name: /max isk per haul/i })).toBeTruthy();
    });

    it('names the unpriced stacks only once a limit is set', () => {
      const { unmount } = show(limited({ unpricedCount: 2 }), 1_000_000);
      expect(screen.getByText(/2 stacks have no price/)).toBeTruthy();
      unmount();
      show(limited({ unpricedCount: 2 }), null);
      expect(screen.queryByText(/have no price/)).toBeNull();
    });

    it('says so when prices could not load, instead of a silent no-limit', () => {
      show(limited({ unpricedCount: 2 }), 1_000_000, true);
      expect(screen.getByText(/Prices could not be loaded/)).toBeTruthy();
    });

    it('labels over-limit stacks apart from the ones that do not fit', () => {
      show(limited({}, { overLimitCount: 1, unfitCount: 0 }), 1_000_000);
      expect(screen.getByText(/1 stack is left behind: one unit is worth more/)).toBeTruthy();
      expect(screen.queryByText(/cannot carry/)).toBeNull();
    });
  });
});
