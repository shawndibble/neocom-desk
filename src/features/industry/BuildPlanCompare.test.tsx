import { describe, it, expect, vi } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BuildPlanCompare } from './BuildPlanCompare';
import { PRICING_INPUTS_FIXTURE } from './pricingInputsFixtures';
import { useComparedBuildResults, type ComparedBuildRow } from './useComparedBuildResults';
import type { BuildPlanRecord } from '@/db';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { BuildResult } from '@/engine/industry/types';

vi.mock('@/market/fuzzwork', () => ({
  fetchOrderCounts: vi.fn(
    async () => new Map([[587, { buyOrders: 28, sellOrders: 44, buyVolume: 9, sellVolume: 8 }]])
  ),
}));

vi.mock('./useComparedBuildResults', async () => {
  const actual = await vi.importActual<typeof import('./useComparedBuildResults')>(
    './useComparedBuildResults'
  );
  return { ...actual, useComparedBuildResults: vi.fn() };
});

const mockedUseComparedBuildResults = vi.mocked(useComparedBuildResults);

const EMPTY_CATALOG: BlueprintCatalog = {
  entries: [],
  byBlueprintTypeID: new Map(),
  byProductTypeID: new Map(),
  typesById: {},
};

function plan(overrides: Partial<BuildPlanRecord> & { id: string }): BuildPlanRecord {
  return {
    characterId: 1,
    name: 'Plan',
    blueprintTypeID: 1,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 0,
    ...overrides,
  };
}

const RESULT: BuildResult = {
  materials: [],
  seconds: 7200,
  jobFee: { eiv: 1000, grossCost: 50, sccSurcharge: 10, facilityTax: 5, total: 65 },
  materialCost: 500,
  totalCost: 565,
  buyCost: 1000,
  revenue: 1000,
  salesTax: 10,
  brokerFee: 5,
  netRevenue: 985,
  profit: 435,
  marginPct: 77,
  iskPerHour: 220,
  grossProfit: 460,
  grossMargin: 82,
  grossIskPerHour: 230,
  breakEvenPrice: 92.5,
  unpricedMaterials: [],
  unpriceable: false,
  recommendation: 'build',
};

function row(overrides: Partial<ComparedBuildRow> & { planId: string }): ComparedBuildRow {
  return {
    planName: 'Plan',
    productName: 'Widget',
    runs: 1,
    loading: false,
    result: null,
    groupResult: null,
    error: null,
    ...overrides,
  };
}

function renderCompare(rows: ComparedBuildRow[], onDone = vi.fn(), onOpenPlan = vi.fn()) {
  mockedUseComparedBuildResults.mockReturnValue(rows);
  return {
    onDone,
    onOpenPlan,
    ...render(
      <MemoryRouter>
        <BuildPlanCompare
          plans={rows.map((r) => plan({ id: r.planId }))}
          catalog={EMPTY_CATALOG}
          pi={null}
          ownedBlueprints={[]}
          modifiers={NO_CHARACTER_MODIFIERS}
          pricingInputs={PRICING_INPUTS_FIXTURE}
          onDone={onDone}
          onOpenPlan={onOpenPlan}
        />
      </MemoryRouter>
    ),
  };
}

describe('BuildPlanCompare', () => {
  it('shows a resolved row with every metric column', () => {
    renderCompare([
      row({
        planId: 'a',
        planName: 'Raven mission fit',
        productName: 'Raven',
        runs: 5,
        result: RESULT,
      }),
    ]);

    expect(screen.getByText('Raven mission fit')).toBeInTheDocument();
    expect(screen.getByText('Raven')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2h 0m')).toBeInTheDocument();
    expect(screen.getByText('565')).toBeInTheDocument(); // totalCost
    expect(screen.getByText('435')).toBeInTheDocument(); // profit
    expect(screen.getByText('77.0%')).toBeInTheDocument(); // marginPct
    expect(screen.getByText('220')).toBeInTheDocument(); // iskPerHour
  });

  it('shows an unresolved plan as "—" rather than dropping it, with an explanatory tooltip', () => {
    renderCompare([
      row({
        planId: 'a',
        planName: 'Orphan',
        productName: 'Mystery item',
        error: 'blueprint missing',
      }),
      row({ planId: 'b', planName: 'Fine', productName: 'Widget', result: RESULT }),
    ]);

    expect(screen.getByText('Orphan')).toBeInTheDocument();
    expect(screen.getByText('Fine')).toBeInTheDocument();
    // Both plans present — the unresolved one is not dropped from the table.
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 rows
    expect(screen.getByRole('button', { name: "Orphan couldn't be priced" })).toBeInTheDocument();
  });

  it('shows an unpriceable-but-computed plan with a tooltip, not just a silent "—"', () => {
    renderCompare([
      row({
        planId: 'a',
        planName: 'Rare hull',
        productName: 'Exotic component',
        result: {
          ...RESULT,
          profit: null,
          marginPct: null,
          iskPerHour: null,
          unpriceable: true,
          unpricedMaterials: [34],
        },
      }),
    ]);

    expect(screen.getByText('Rare hull')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: "Rare hull couldn't be priced" })
    ).toBeInTheDocument();
  });

  it('shows a loading indicator for a row still fetching', () => {
    renderCompare([row({ planId: 'a', planName: 'Loading plan', loading: true })]);
    expect(screen.getAllByText('…').length).toBeGreaterThan(0);
  });

  it('calls onDone when the Done action is clicked', async () => {
    const { onDone } = renderCompare([
      row({ planId: 'a', planName: 'A', result: RESULT }),
      row({ planId: 'b', planName: 'B', result: RESULT }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('calls onOpenPlan with the row planId when the plan name is clicked', async () => {
    const { onOpenPlan } = renderCompare([
      row({ planId: 'a', planName: 'Raven mission fit', result: RESULT }),
    ]);
    await userEvent.click(screen.getByRole('link', { name: 'Raven mission fit' }));
    expect(onOpenPlan).toHaveBeenCalledWith('a');
  });

  it('shows the buy orders of the plan product at its hub, and lets the picker add more columns', async () => {
    const catalog = {
      ...EMPTY_CATALOG,
      byBlueprintTypeID: new Map([[1, { productTypeID: 587 }]]),
    } as unknown as BlueprintCatalog;
    mockedUseComparedBuildResults.mockReturnValue([
      row({ planId: 'a', planName: 'Rifter run', productName: 'Rifter', result: RESULT }),
    ]);
    render(
      <MemoryRouter>
        <BuildPlanCompare
          plans={[plan({ id: 'a' })]}
          catalog={catalog}
          pi={null}
          ownedBlueprints={[]}
          modifiers={NO_CHARACTER_MODIFIERS}
          pricingInputs={PRICING_INPUTS_FIXTURE}
          onDone={vi.fn()}
          onOpenPlan={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('28')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Buy orders at hub/ })).toBeInTheDocument();
    // The extras start unticked.
    expect(screen.queryByRole('columnheader', { name: /Sell orders at hub/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Sell orders at hub' })
    );
    expect(await screen.findByText('44')).toBeInTheDocument();
  });
});
