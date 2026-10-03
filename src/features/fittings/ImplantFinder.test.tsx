import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { LpOfferInput, SourceContext } from '@/engine/fittings/implantSources';
import type {
  Fitting,
  FittingImplantSet,
  FittingStats,
  PilotProfile,
} from '@/engine/fittings/types';

// Two CPU implant families (slots 6 and 10), a speed implant, and a Crash booster for missiles.
const EE = [601, 602, 603, 604, 605, 606];
const WU = [1001, 1002, 1003, 1004, 1005, 1006];
const NN = 3001;
const CRASH = 9947;
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: async () => [
    { id: 1, name: 'Implant Slot 06', parentId: null, hasTypes: true },
    { id: 2, name: 'Implant Slot 10', parentId: null, hasTypes: true },
    { id: 3, name: 'Booster Slot 03', parentId: null, hasTypes: true },
  ],
  loadMarketTypes: async () => [
    ...EE.map((id) => ({
      typeId: id,
      name: `Zainou 'Gypsy' CPU Management EE-${id}`,
      marketGroupId: 1,
      volume: 1,
    })),
    ...WU.map((id) => ({
      typeId: id,
      name: `Zainou 'Gnome' Weapon Upgrades WU-${id}`,
      marketGroupId: 2,
      volume: 1,
    })),
    { typeId: NN, name: "Eifyr and Co. 'Rogue' Navigation NN-606", marketGroupId: 1, volume: 1 },
    { typeId: CRASH, name: 'Standard Crash Booster', marketGroupId: 3, volume: 1 },
  ],
}));

/**
 * Base fit: 418.4 / 400 tf, 300 missile DPS. EE-60x adds x% CPU output;
 * WU-100x trims x% of 225 tf of launchers; Crash adds 10% missile DPS.
 */
function statsFor(set: FittingImplantSet): FittingStats {
  const ee = set.implants.find((id) => EE.includes(id));
  const wu = set.implants.find((id) => WU.includes(id));
  const eeGrade = ee ? ee % 10 : 0;
  const wuGrade = wu ? wu % 10 : 0;
  const missileDps = set.boosters.includes(CRASH) ? 330 : 300;
  return {
    cpuUsed: 418.4 - 225 * (wuGrade / 100),
    cpuTotal: 400 * (1 + eeGrade / 100),
    powergridUsed: 900,
    powergridTotal: 1000,
    capacitorCapacity: 2000,
    capacitorRechargeTime: 300_000,
    ehp: 10000,
    offense: { weapons: [], dps: missileDps, sustainedDps: 0, volley: 0, overheated: null },
    applied: {
      droneControlRange: 0,
      weapons: [
        {
          kind: 'missile',
          dps: missileDps,
          range: 40_000,
          explosionRadius: 100,
          explosionVelocity: 100,
          damageReductionFactor: 0.5,
        },
      ],
    },
    tank: { burstEffective: 0 },
    navigation: {
      maxVelocity: set.implants.includes(NN) ? 1220 : 1150,
      agility: 0.5,
      mass: 0,
      warpSpeed: 0,
    },
    targeting: {
      maxTargetRange: 70000,
      maxLockedTargets: 5,
      scanResolution: 300,
      signatureRadius: 0,
    },
  } as unknown as FittingStats;
}
vi.mock('./useFittingEvaluation', () => ({
  evaluateImplantSet: async (
    _f: unknown,
    _p: unknown,
    _d: unknown,
    _c: unknown,
    set: FittingImplantSet
  ) => statsFor(set),
}));
vi.mock('./damageProfiles', () => ({
  useDamageProfiles: () => ({ hydrated: true, selected: null }),
}));
vi.mock('./statsConditions', async (importOriginal) => {
  const conditions = {};
  return { ...(await importOriginal<object>()), useStatsConditions: () => conditions };
});
vi.mock('./yieldToEventLoop', () => ({ yieldToEventLoop: async () => {} }));
vi.mock('./PriceHubSelect', () => ({ PriceHubSelect: () => null }));
const target = vi.hoisted(() => ({ signatureRadius: 400, velocity: 0 }));
vi.mock('./targetProfiles', () => ({ useTargetProfiles: () => ({ selected: target }) }));
vi.mock('@/features/market/hub', () => ({
  useMarketHub: (pick: (s: { value: string }) => unknown) => pick({ value: 'jita' }),
}));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: async () => new Map() }));
vi.mock('@/features/market/ItemDetailModal', () => ({
  ItemDetailModal: ({ itemName }: { itemName: string }) => <p>Details of {itemName}</p>,
}));

/**
 * Jita sells grade g at g² M ISK (WU-1001: nobody). Caldari Navy's store has
 * EE-603 for 1,000 LP + 0.5M and EE-605 for 4,000 LP + 2M; the pilot holds
 * 3,200 of its LP, valued at 1,000 ISK.
 */
const caldariNavy = (lpCost: number, iskCost: number): LpOfferInput => ({
  corporationId: 1000035,
  corpName: 'Caldari Navy',
  iskCost,
  lpCost,
  quantity: 1,
  requiredItems: [],
});
vi.mock('./implantPurchase', () => ({
  loadImplantPurchase: async () => {
    const context: SourceContext = {
      selectedHubId: 'jita',
      hubPrices: (id) => {
        const g = id % 10;
        const sellMin = id === 1001 ? null : g * g * 1e6;
        return [{ hubId: 'jita', sellMin, sellVolume: sellMin ? 5 : 0 }];
      },
      turnInPrice: () => null,
      lpRate: () => 1000,
      lpBalance: () => 3200,
      owned: () => 0,
    };
    return {
      offersFor: (id: number) =>
        id === 603
          ? [caldariNavy(1000, 500_000)]
          : id === 605
            ? [caldariNavy(4000, 2_000_000)]
            : [],
      context,
      stores: [
        {
          corporationId: 1000035,
          corpName: 'Caldari Navy',
          balance: 3200,
          rate: { rate: 1000, source: 'market' },
        },
      ],
    };
  },
}));

const { ImplantFinder } = await import('./ImplantFinder');
const { useActiveCharacter } = await import('@/stores/activeCharacter');
useActiveCharacter.setState({ activeCharacterId: 7 });

const fitting = { name: 'Drake', shipTypeId: 24698, modules: [] } as unknown as Fitting;
const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };

function renderFinder(onChange = vi.fn(), set: FittingImplantSet = { implants: [], boosters: [] }) {
  render(
    <ImplantFinder
      open
      fitting={{ ...fitting, implantSet: set }}
      profile={profile}
      basis="fitting"
      implantSet={set}
      onChange={onChange}
    />
  );
  return onChange;
}

describe('ImplantFinder', () => {
  it('offers CPU as the fit’s problem, the fit’s weapons by name, and the rest as not on this fit', async () => {
    renderFinder();
    expect(await screen.findByRole('button', { name: /CPU\s*18\.4 tf over/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Max velocity/ })).toBeInTheDocument();
    const notOnFit = screen.getByText('Not on this fit').parentElement!;
    expect(within(notOnFit).getByRole('button', { name: /Turrets/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Missiles/ })).toBeInTheDocument();
  });

  it('prices from the LP Store when it is cheaper and the pilot can redeem it, else says what’s missing', async () => {
    const user = userEvent.setup();
    const onChange = renderFinder();
    await user.click(await screen.findByRole('button', { name: /CPU\s*18\.4 tf over/ }));

    // EE-603 from Caldari Navy: 0.5M + 1,000 LP × 1,000 = 1.5M, under Jita's 9M.
    const ee603 = (await screen.findByRole('button', { name: /^Add .*EE-603$/ })).closest('li')!;
    expect(ee603).toHaveTextContent('Caldari Navy LP Store · 1,000 LP');
    // EE-605's offer needs 4,000 LP; the pilot has 3,200: market first, the offer shown as cheaper.
    const ee605 = screen.getByRole('button', { name: /^Add .*EE-605$/ }).closest('li')!;
    expect(ee605).toHaveTextContent('Fits · 1.6 tf spare');
    expect(ee605).toHaveTextContent('Cheaper if you could:');
    expect(ee605).toHaveTextContent('800 LP short');
    expect(screen.getByRole('button', { name: /^Add .*WU-1001$/ }).closest('li')).toHaveTextContent(
      'Not for sale at any Trade Hub or LP Store'
    );
    expect(screen.getByText(/Your LP:/).parentElement).toHaveTextContent('Caldari Navy 3,200');

    // Cheapest fix: EE-603 by LP (1.5M) + WU-1003 at Jita (9M).
    const fixes = await screen.findByText('Ways to fix it · cheapest first');
    const firstFix = within(fixes.parentElement!).getAllByRole('listitem')[0]!;
    expect(firstFix).toHaveTextContent('EE-603');
    expect(firstFix).toHaveTextContent('WU-1003');
    expect(firstFix).toHaveTextContent('10,500,000.00 ISK');

    await user.click(within(firstFix).getByRole('button', { name: 'Add all' }));
    expect(onChange).toHaveBeenLastCalledWith({ implants: [603, 1003], boosters: [] });
  });

  it('keeps a family already in the set, with its Remove and its lower grades', async () => {
    const user = userEvent.setup();
    const onChange = renderFinder(vi.fn(), { implants: [606], boosters: [] });
    // EE-606 gives 424 tf: the fit already fits, so CPU is under Fitting, not Fix this fit.
    await user.click(await screen.findByRole('button', { name: /^CPU$/ }));
    const remove = await screen.findByRole('button', { name: /^Remove .*EE-606$/ });
    expect(screen.getByRole('button', { name: /^Replace .*EE-605$/ })).toBeInTheDocument();
    await user.click(remove);
    expect(onChange).toHaveBeenLastCalledWith({ implants: [], boosters: [] });
  });

  it('lists boosters that help a weapon, and adds one to the booster slots', async () => {
    const user = userEvent.setup();
    const onChange = renderFinder();
    await user.click(await screen.findByRole('button', { name: /^Missiles/ }));
    expect(await screen.findByText('Boosters that help · best first')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Add Standard Crash Booster$/ }));
    expect(onChange).toHaveBeenLastCalledWith({ implants: [], boosters: [CRASH] });
  });

  it('opens an implant’s full details from its info button', async () => {
    const user = userEvent.setup();
    renderFinder();
    await user.click(await screen.findByRole('button', { name: /CPU\s*18\.4 tf over/ }));
    await user.click(await screen.findByRole('button', { name: /^Show details of .*EE-605$/ }));
    expect(screen.getByText(/Details of Zainou 'Gypsy' CPU Management EE-605/)).toBeInTheDocument();
  });
});
