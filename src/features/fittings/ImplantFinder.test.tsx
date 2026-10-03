import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';

// Two CPU implant families (slots 6 and 10) and one speed implant, priced at Jita.
const EE = [601, 602, 603, 604, 605, 606];
const WU = [1001, 1002, 1003, 1004, 1005, 1006];
const NN = 3001;
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: async () => [
    { id: 1, name: 'Implant Slot 06', parentId: null, hasTypes: true },
    { id: 2, name: 'Implant Slot 10', parentId: null, hasTypes: true },
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
  ],
}));

/** Base fit: 418.4 / 400 tf. EE-60x adds x% CPU output; WU-100x trims x% of 225 tf of launchers. */
function statsFor(implants: readonly number[]): FittingStats {
  const ee = implants.find((id) => EE.includes(id));
  const wu = implants.find((id) => WU.includes(id));
  const eeGrade = ee ? ee % 10 : 0;
  const wuGrade = wu ? wu % 10 : 0;
  return {
    cpuUsed: 418.4 - 225 * (wuGrade / 100),
    cpuTotal: 400 * (1 + eeGrade / 100),
    powergridUsed: 900,
    powergridTotal: 1000,
    capacitorCapacity: 2000,
    capacitorRechargeTime: 300,
    ehp: 10000,
    offense: { weapons: [], dps: 0, sustainedDps: 0, volley: 0, overheated: null },
    tank: { burstEffective: 0 },
    navigation: {
      maxVelocity: implants.includes(NN) ? 1220 : 1150,
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
    implants: readonly number[]
  ) => statsFor(implants),
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
vi.mock('@/features/market/hub', () => ({
  useMarketHub: (pick: (s: { value: string }) => unknown) => pick({ value: 'jita' }),
}));
// Jita prices grade g at g² M ISK; WU-1001 has no sellers anywhere.
vi.mock('@/market/prices', () => ({
  getHubPrices: async (hub: { id: string }, typeIds: number[]) =>
    new Map(
      typeIds.map((id) => {
        const g = id % 10;
        const sellMin = hub.id === 'jita' && id !== 1001 ? g * g * 1e6 : null;
        return [id, { sellMin, buyMax: null, sellVolume: sellMin ? 5 : 0, buyVolume: 0 }];
      })
    ),
}));

const { ImplantFinder } = await import('./ImplantFinder');

const fitting = { name: 'Drake', shipTypeId: 24698, modules: [] } as unknown as Fitting;
const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };

function renderFinder(onChange = vi.fn()) {
  render(
    <ImplantFinder
      open
      fitting={fitting}
      profile={profile}
      basis="fitting"
      implantSet={{ implants: [], boosters: [] }}
      onChange={onChange}
    />
  );
  return onChange;
}

describe('ImplantFinder', () => {
  it('offers CPU as the fit’s problem, and lists only goals an implant moves', async () => {
    renderFinder();
    const cpu = await screen.findByRole('button', { name: /CPU\s*18\.4 tf over/ });
    expect(cpu).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Max velocity/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Damage/ })).not.toBeInTheDocument();
  });

  it('shows each grade’s effect on the fit, and the cheapest way back under CPU', async () => {
    const user = userEvent.setup();
    const onChange = renderFinder();
    await user.click(await screen.findByRole('button', { name: /CPU\s*18\.4 tf over/ }));

    // EE-605 alone fits (420 tf); EE-603 + WU-1003 fits for 9M + 9M = 18M, cheaper than 25M.
    const fixes = await screen.findByText('Ways to fix it · cheapest first');
    const firstFix = within(fixes.parentElement!).getAllByRole('listitem')[0]!;
    expect(firstFix).toHaveTextContent('EE-603');
    expect(firstFix).toHaveTextContent('WU-1003');
    expect(firstFix).toHaveTextContent('18M ISK');

    const ee605 = screen.getByRole('button', { name: /^Add .*EE-605$/ });
    expect(ee605.closest('li')).toHaveTextContent('Fits · 1.6 tf spare');
    expect(screen.getByRole('button', { name: /^Add .*EE-604$/ }).closest('li')).toHaveTextContent(
      'Still 2.4 tf over'
    );
    expect(screen.getByRole('button', { name: /^Add .*WU-1001$/ }).closest('li')).toHaveTextContent(
      'Not for sale at any trade hub'
    );

    await user.click(within(firstFix).getByRole('button', { name: 'Add all' }));
    expect(onChange).toHaveBeenLastCalledWith({ implants: [603, 1003], boosters: [] });
  });
});
