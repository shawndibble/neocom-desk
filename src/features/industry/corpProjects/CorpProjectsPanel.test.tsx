import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { CorpManufactureProject } from '@/engine/corpProjects/corpProjects';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import type { BuildResult } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { BlueprintCatalog, BlueprintCatalogEntry } from '../blueprintCatalog';
import { DEFAULT_ACTIVITY_FACILITY_DEFAULTS } from '../facilityDefaults';
import { PRICING_INPUTS_FIXTURE } from '../pricingInputsFixtures.testutil';
import type { ComparedBuildRow } from '../useComparedBuildResults';

const desktop = vi.hoisted(() => ({ value: true }));
vi.mock('@/lib/useIsDesktop', () => ({ useIsDesktop: () => desktop.value }));

/**
 * Prices every plan at 1M per run, so profit is (reward - 1M) x units. Rows are
 * memoised on `plans` like the real hook's state: a fresh array each render
 * would loop through `onPriced`.
 */
vi.mock('../useComparedBuildResults', async () => {
  const { useMemo } = await import('react');
  return {
    useComparedBuildResults: ({ plans }: { plans: readonly BuildPlanRecord[] }) =>
      useMemo(
        (): ComparedBuildRow[] =>
          plans.map((plan) => ({
            planId: plan.id,
            planName: plan.name,
            productName: plan.name,
            runs: plan.runs,
            loading: false,
            groupResult: null,
            error: null,
            result: { totalCost: plan.runs * 1_000_000, materials: [] } as unknown as BuildResult,
          })),
        [plans]
      ),
  };
});

import { CorpProjectsPanel } from './CorpProjectsPanel';

const entryFor = (blueprintTypeID: number, productTypeID: number, name: string) =>
  ({
    blueprintTypeID,
    blueprint: {
      name: `${name} Blueprint`,
      time: 600,
      materials: [{ typeID: 34, quantity: 10 }],
      products: [{ typeID: productTypeID, quantity: 1 }],
      skills: [],
      activity: 'manufacturing',
    },
    productTypeID,
    productName: name,
    productNameLower: name.toLowerCase(),
  }) satisfies BlueprintCatalogEntry;

const HURRICANE = entryFor(100, 24702, 'Hurricane');
const DRAKE = entryFor(200, 24698, 'Drake');
const CATALOG: BlueprintCatalog = {
  entries: [HURRICANE, DRAKE],
  byBlueprintTypeID: new Map([HURRICANE, DRAKE].map((e) => [e.blueprintTypeID, e])),
  byProductTypeID: new Map([HURRICANE, DRAKE].map((e) => [e.productTypeID, e])),
  typesById: {},
};

const project = (over: Partial<CorpManufactureProject>): CorpManufactureProject => ({
  id: 'p',
  name: 'Project',
  typeId: 24702,
  rewardEach: 5_000_000,
  poolInitial: 100_000_000,
  poolRemaining: 100_000_000,
  cap: 10,
  contributed: 3,
  expires: null,
  ...over,
});

const original: CharacterBlueprint = {
  item_id: 1,
  type_id: 100,
  quantity: 1,
  runs: -1,
  material_efficiency: 10,
  time_efficiency: 20,
  location_id: 1,
  location_flag: 'Hangar',
};

function renderPanel(
  props: Partial<React.ComponentProps<typeof CorpProjectsPanel>> = {},
  onAddToCompare = vi.fn()
) {
  render(
    <CorpProjectsPanel
      title="Build"
      meta={null}
      entries={[
        {
          characterId: 7,
          corporationId: 500,
          projects: [
            project({ id: 'hurricane', typeId: 24702 }), // 7 units left: profit 4M x 7 = 28M
            project({ id: 'drake', typeId: 24698, rewardEach: 9_000_000, contributed: 0 }), // 10 units: 80M
          ],
        },
      ]}
      loading={false}
      catalog={CATALOG}
      pi={null}
      pricingInputs={PRICING_INPUTS_FIXTURE}
      facilityDefaults={DEFAULT_ACTIVITY_FACILITY_DEFAULTS}
      assumedMe={0}
      ownedStockSnapshot={
        { sources: [], characterNames: new Map(), incompleteCharacterIds: [] } as never
      }
      ownedByCharacter={new Map([[7, [original]]])}
      characterNames={new Map([[7, 'Kestrel Vane']])}
      hubFor={() => DEFAULT_TRADE_HUB}
      modifiersByCharacter={new Map([[7, NO_CHARACTER_MODIFIERS]])}
      onAddToCompare={onAddToCompare}
      {...props}
    />
  );
  return onAddToCompare;
}

describe('CorpProjectsPanel', () => {
  it('lists projects best profit first, with the blueprint source and units left', () => {
    desktop.value = true;
    renderPanel();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Drake')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/10 units/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText('+80,000,000')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Hurricane')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/7 units/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Owned')).toBeInTheDocument();
    // No copy for sale and no blueprint held: the amber assumption.
    expect(within(rows[0]!).getByText('Assuming a copy')).toBeInTheDocument();
  });

  it('seeds Compare with the ticked rows’ plans, runs = the units still to contribute', async () => {
    desktop.value = true;
    const onAddToCompare = renderPanel();
    expect(screen.queryByRole('button', { name: /to Compare/ })).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: /Select Drake/ }));
    expect(screen.queryByRole('button', { name: /to Compare/ })).toBeNull(); // one is not a comparison
    await userEvent.click(screen.getByRole('checkbox', { name: /Select Hurricane/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 2 to Compare' }));

    const plans = onAddToCompare.mock.calls[0]![0] as BuildPlanRecord[];
    expect(plans.map((p) => [p.blueprintTypeID, p.runs])).toEqual([
      [100, 7],
      [200, 10],
    ]);
  });

  it('leaves out a project with nothing left to contribute and one it cannot build', () => {
    desktop.value = true;
    renderPanel({
      entries: [
        {
          characterId: 7,
          corporationId: 500,
          projects: [
            project({ id: 'capped', contributed: 10 }),
            project({ id: 'unknown-item', typeId: 999_999 }),
          ],
        },
      ],
    });
    expect(screen.getByText('No open manufacture projects')).toBeInTheDocument();
  });

  it('shows a spinner while the projects are being read', () => {
    desktop.value = true;
    renderPanel({ loading: true, entries: [] });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('draws cards on a phone, one per project, opening to the working', async () => {
    desktop.value = false;
    renderPanel();
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'Open manufacture corporation projects' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(within(list).getByRole('button', { name: /Drake/ }));
    expect(screen.getByText('Your share of the cap')).toBeInTheDocument();
  });
});
