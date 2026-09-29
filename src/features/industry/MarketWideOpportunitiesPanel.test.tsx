import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { TradeHub } from '@/market/hubs';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { MarketWideOpportunitiesPanel } from './MarketWideOpportunitiesPanel';
import { fakeItemActions, withItemActions } from '@/features/market/__fixtures__/itemActions';

const row = (productTypeID: number, productName: string): MarketWideResultRow =>
  ({
    productTypeID,
    productName,
    blueprintTypeID: productTypeID + 1000,
    blueprintSource: productTypeID === 200 ? 'owned' : 'contract',
    priceCapped: productTypeID === 300,
    iskPerHour: 1_000_000,
    // Gamma is the expensive build, for the build-cost cap.
    buildCost: productTypeID === 300 ? 500_000_000 : 5_000_000,
    orderDepth: 'deep',
  }) as unknown as MarketWideResultRow;

const hookState = vi.hoisted(() => ({
  unavailableSources: [] as string[],
  run: vi.fn(),
  loading: false,
  hasRun: true,
  isPhone: false,
}));
vi.mock('@/lib/useIsPhone', () => ({ useIsPhone: () => hookState.isPhone }));
// Beta sells 1 a day, Gamma 50 — once the filter asks.
vi.mock('./useDailySales', () => ({
  useDailySales: (_ids: readonly number[], enabled: boolean) => ({
    sales: enabled
      ? new Map([
          [200, 1],
          [300, 50],
        ])
      : new Map(),
    pending: 0,
  }),
}));
vi.mock('./useMarketWideOpportunities', () => ({
  useMarketWideOpportunities: () => ({
    rows: [row(200, 'Widget Beta'), row(300, 'Widget Gamma')],
    loading: hookState.loading,
    hasRun: hookState.hasRun,
    error: false,
    unavailableSources: hookState.unavailableSources,
    run: hookState.run,
  }),
}));
vi.mock('@/features/skills/useAccountSkillLevels', () => ({
  useAccountSkillLevels: () => new Map(),
}));
vi.mock('@/features/market/useTradeHubStandings', () => ({
  useTradeHubStandings: () => ({}),
  tradeHubStanding: () => undefined,
}));

// Only Widget Beta has a catalog entry; Widget Gamma has none.
const catalog = {
  entries: [],
  byBlueprintTypeID: new Map(),
  byProductTypeID: new Map([[200, { blueprintTypeID: 1200, productTypeID: 200 }]]),
} as unknown as BlueprintCatalog;

function renderPanel(actions = fakeItemActions()) {
  return render(
    <MemoryRouter>
      {withItemActions(
        <MarketWideOpportunitiesPanel
          hub={{ id: 'jita' } as unknown as TradeHub}
          trees={{}}
          catalog={catalog}
          modifiers={{} as CharacterModifiers}
          activeCharacterId={null}
          onStartPlan={() => Promise.resolve(false)}
        />,
        actions
      )}
    </MemoryRouter>
  );
}

describe('MarketWideOpportunitiesPanel row context menu', () => {
  it('links the product name to its Market listing', () => {
    renderPanel();
    expect(screen.getByRole('link', { name: 'Widget Beta' })).toBeInTheDocument();
  });

  it('opens the item menu for the row product', async () => {
    const actions = fakeItemActions();
    renderPanel(actions);

    fireEvent.contextMenu(screen.getByText('Widget Beta').closest('tr')!);
    fireEvent.click(await screen.findByText('Add to Quickbar'));

    expect(actions.addToQuickbar).toHaveBeenCalledWith(200, 'Widget Beta');
    expect(screen.getAllByRole('button', { name: 'Start a plan' })[0]).toBeInTheDocument();
  });

  it('shows no blueprint for a product the catalog has no entry for', async () => {
    renderPanel();

    fireEvent.contextMenu(screen.getByText('Widget Gamma').closest('tr')!);

    expect(await screen.findByText(/no blueprint/i)).toBeInTheDocument();
  });

  it('gives the row a visible "More actions" button with the same items as its right-click menu (issue #1498)', async () => {
    const actions = fakeItemActions();
    renderPanel(actions);
    const user = userEvent.setup();
    const row = screen.getByText('Widget Beta').closest('tr')!;

    await user.click(within(row).getByRole('button', { name: 'More actions for Widget Beta' }));
    const buttonItems = screen.getAllByRole('menuitem').map((el) => el.textContent);
    await user.keyboard('{Escape}');

    fireEvent.contextMenu(row);
    const contextItems = await screen
      .findAllByRole('menuitem')
      .then((els) => els.map((el) => el.textContent));

    expect(buttonItems).toEqual(contextItems);
  });
});

describe('MarketWideOpportunitiesPanel blueprint sources', () => {
  it('names where each row’s blueprint comes from', () => {
    renderPanel();
    const beta = screen.getByText('Widget Beta').closest('tr')!;
    const gamma = screen.getByText('Widget Gamma').closest('tr')!;
    expect(within(beta).getByText('Owned')).toBeInTheDocument();
    expect(within(gamma).getByText('Contract')).toBeInTheDocument();
  });

  it('says which sources it could not check, since their rows may be missing', () => {
    hookState.unavailableSources = ['contract', 'lpStore'];
    try {
      renderPanel();
      expect(
        screen.getByText(/Couldn't check Contract, LP store — products whose blueprint/)
      ).toBeInTheDocument();
    } finally {
      hookState.unavailableSources = [];
    }
  });

  it('adds no note when every source was read', () => {
    renderPanel();
    expect(screen.queryByText(/Couldn't check/)).not.toBeInTheDocument();
  });
});

describe('MarketWideOpportunitiesPanel filters', () => {
  it('re-scans without a tier the pilot turns off', async () => {
    hookState.run.mockClear();
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    await user.click(screen.getByRole('button', { name: 'Faction' }));

    expect(hookState.run).toHaveBeenCalledTimes(1);
    const [filters] = hookState.run.mock.calls[0]!;
    expect(filters.tiers.has('faction')).toBe(false);
    expect(filters.tiers.has('tech1')).toBe(true);
  });

  it('caps build cost on the ranked rows without re-scanning', async () => {
    hookState.run.mockClear();
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    await user.click(screen.getByRole('combobox', { name: 'Max build cost' }));
    await user.click(await screen.findByRole('option', { name: 'Build cost up to 100M' }));

    expect(screen.getByText('Widget Beta')).toBeInTheDocument();
    expect(screen.queryByText('Widget Gamma')).not.toBeInTheDocument();
    expect(hookState.run).not.toHaveBeenCalled();
  });
});

describe('MarketWideOpportunitiesPanel filters: skill gate, mid-scan, phone', () => {
  it('keeps "Hide skill-gated" among the filters, and toggling it does not re-scan', async () => {
    hookState.run.mockClear();
    const user = userEvent.setup();
    renderPanel();
    const skills = screen.queryByRole('group', { name: 'Skills' });
    expect(skills).toBeNull();
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    await user.click(
      within(screen.getByRole('group', { name: 'Skills' })).getByRole('button', {
        name: 'Hide skill-gated',
      })
    );
    expect(hookState.run).not.toHaveBeenCalled();
  });

  it('re-scans on a tier change while the first scan is still running', async () => {
    hookState.run.mockClear();
    hookState.loading = true;
    hookState.hasRun = false;
    try {
      const user = userEvent.setup();
      renderPanel();
      await user.click(screen.getByRole('button', { name: /Filters/ }));
      await user.click(screen.getByRole('button', { name: 'Faction' }));
      expect(hookState.run).toHaveBeenCalledTimes(1);
    } finally {
      hookState.loading = false;
      hookState.hasRun = true;
    }
  });

  it('puts the filter button beside the sort picker on a phone', () => {
    hookState.isPhone = true;
    try {
      renderPanel();
      const sortPicker = screen.getByRole('combobox', { name: 'Sort by' });
      const sortBar = sortPicker.closest('label')!.parentElement!;
      expect(within(sortBar).getByRole('button', { name: /Filters/ })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Filters/ })).toHaveLength(1);
    } finally {
      hookState.isPhone = false;
    }
  });
});

describe('MarketWideOpportunitiesPanel sales and price sanity', () => {
  it('hides products that rarely sell once the filter is on, and re-scans nothing', async () => {
    hookState.run.mockClear();
    const user = userEvent.setup();
    renderPanel();
    expect(screen.getByText('Widget Beta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    await user.click(screen.getByRole('button', { name: 'Hide rarely sold (under 5/day)' }));

    expect(screen.queryByText('Widget Beta')).not.toBeInTheDocument();
    expect(screen.getByText('Widget Gamma')).toBeInTheDocument();
    expect(hookState.run).not.toHaveBeenCalled();
  });

  it('marks a row priced at the average instead of a troll sell order', () => {
    renderPanel();
    const gamma = screen.getByText('Widget Gamma').closest('tr')!;
    const beta = screen.getByText('Widget Beta').closest('tr')!;
    expect(
      within(gamma).getByRole('button', { name: /Priced at the average/ })
    ).toBeInTheDocument();
    expect(within(beta).queryByRole('button', { name: /Priced at the average/ })).toBeNull();
  });
});
