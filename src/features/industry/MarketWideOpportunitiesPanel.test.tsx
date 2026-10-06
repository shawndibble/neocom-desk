import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { formatDuration } from '@/lib/duration';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { TradeHub } from '@/market/hubs';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { MarketWideOpportunitiesPanel } from './MarketWideOpportunitiesPanel';
import { fakeItemActions, withItemActions } from '@/features/market/__fixtures__/itemActions';

const row = (
  productTypeID: number,
  productName: string,
  extra: Partial<MarketWideResultRow> = {}
): MarketWideResultRow =>
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
    marginPct: 18.4,
    seconds: 3600,
    ...extra,
  }) as unknown as MarketWideResultRow;

const hookState = vi.hoisted(() => ({
  unavailableSources: [] as string[],
  run: vi.fn(),
  loading: false,
  hasRun: true,
  isPhone: false,
  rows: null as unknown,
}));
vi.mock('@/lib/useIsPhone', () => ({ useIsPhone: () => hookState.isPhone }));
// Below `md` (`useIsNarrow`) is where `FilterBar` turns into its sheet and
// the panel moves the funnel into its title bar; the test's phone is both.
vi.mock('@/lib/useIsNarrow', () => ({ useIsNarrow: () => hookState.isPhone }));
// Below `lg` the ranking is cards rather than the table.
vi.mock('@/lib/useIsDesktop', () => ({ useIsDesktop: () => !hookState.isPhone }));
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
    rows: (hookState.rows as MarketWideResultRow[] | null) ?? [
      row(200, 'Widget Beta'),
      row(300, 'Widget Gamma'),
    ],
    loading: hookState.loading,
    hasRun: hookState.hasRun,
    error: false,
    unavailableSources: hookState.unavailableSources,
    run: hookState.run,
  }),
}));
// Pages of 5, not 200: a few hundred real rows time out in jsdom. The 200
// itself is pinned in `marketWidePage.test.ts`.
vi.mock('./marketWidePage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./marketWidePage')>()),
  MARKET_WIDE_PAGE_SIZE: 5,
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

function renderPanel(
  actions = fakeItemActions(),
  initialEntries = ['/'],
  onStartPlan: () => Promise<boolean> = () => Promise.resolve(false)
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      {withItemActions(
        <MarketWideOpportunitiesPanel
          hub={{ id: 'jita' } as unknown as TradeHub}
          trees={{}}
          catalog={catalog}
          modifiers={{} as CharacterModifiers}
          activeCharacterId={null}
          onStartPlan={onStartPlan}
        />,
        actions
      )}
    </MemoryRouter>
  );
}

describe('MarketWideOpportunitiesPanel row context menu', () => {
  it('shows the product name as plain text: the row click is Start plan', () => {
    renderPanel();
    expect(screen.queryByRole('link', { name: 'Widget Beta' })).not.toBeInTheDocument();
    expect(screen.getByText('Widget Beta')).toBeInTheDocument();
  });

  it('starts the plan on a row click; a row with no catalog entry is inert', () => {
    const onStartPlan = vi.fn(() => Promise.resolve(false));
    renderPanel(fakeItemActions(), ['/'], onStartPlan);
    const beta = screen.getByText('Widget Beta').closest('tr')!;
    const gamma = screen.getByText('Widget Gamma').closest('tr')!;
    expect(gamma).not.toHaveAttribute('tabindex');
    fireEvent.click(gamma);
    expect(onStartPlan).not.toHaveBeenCalled();
    expect(beta).toHaveAttribute('tabindex', '0');
    fireEvent.click(screen.getByText('Widget Beta'));
    expect(onStartPlan).toHaveBeenCalledTimes(1);
  });

  it('has no row menu: Start plan is the row’s one control', () => {
    renderPanel();
    const row = screen.getByText('Widget Beta').closest('tr')!;
    expect(within(row).queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Plan' })).toBeInTheDocument();
    fireEvent.contextMenu(row);
    expect(screen.queryByRole('menuitem', { name: /Quickbar|Show info/ })).toBeNull();
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
    await user.click(screen.getByRole('button', { name: /^Tier:/ }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Faction' }));

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
      await user.click(screen.getByRole('button', { name: /^Tier:/ }));
      await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Faction' }));
      expect(hookState.run).toHaveBeenCalledTimes(1);
    } finally {
      hookState.loading = false;
      hookState.hasRun = true;
    }
  });

  it("sizes the title-bar filter button to Scan's own on a phone", () => {
    hookState.isPhone = true;
    try {
      renderPanel();
      const filters = screen.getByRole('button', { name: /Filters/ });
      const scan = screen.getByRole('button', { name: 'Scan' });
      const header = scan.closest('header')!;
      expect(header).toContainElement(filters);
      expect(screen.getAllByRole('button', { name: /Filters/ })).toHaveLength(1);
      // `IconButton size="sm"` and `Button size="sm"` share one control tier:
      // 36px on a phone, 28px with a pointer.
      expect(filters).toHaveClass('size-9', 'md:size-7');
      expect(scan).toHaveClass('h-9', 'md:h-7');
    } finally {
      hookState.isPhone = false;
    }
  });

  it('puts the filter button in the title bar beside Scan with a pointer too, opening a popover', async () => {
    const user = userEvent.setup();
    renderPanel();
    const filters = screen.getByRole('button', { name: /Filters/ });
    expect(screen.getByRole('button', { name: 'Scan' }).closest('header')).toContainElement(
      filters
    );
    await user.click(filters);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toContainElement(
      screen.getByRole('combobox', { name: 'Max build cost' })
    );
  });
});

describe('MarketWideOpportunitiesPanel on a phone', () => {
  it('ranks the scan as cards rather than table rows', () => {
    hookState.isPhone = true;
    try {
      renderPanel();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText('2 products')).toBeInTheDocument();
      const beta = screen.getByText('Widget Beta').closest('li')!;
      expect(within(beta).getByText('#1')).toBeInTheDocument();
      expect(
        within(beta).getByRole('button', { name: 'Start a plan for Widget Beta' })
      ).toBeInTheDocument();
    } finally {
      hookState.isPhone = false;
    }
  });
});

describe('MarketWideOpportunitiesPanel paging', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      row(10_000 + i, `Widget ${i}`, { iskPerHour: 1_000_000 - i })
    );

  afterEach(() => {
    hookState.rows = null;
  });

  it('shows the top page, then the next on request', async () => {
    hookState.rows = many(12);
    const user = userEvent.setup();
    renderPanel();
    expect(screen.getByText('Showing 5 of 12')).toBeInTheDocument();
    expect(screen.queryByText('Widget 5')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show next 5' }));
    expect(screen.getByText('Showing 10 of 12')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show the last 2' }));
    expect(screen.getByText('Widget 11')).toBeInTheDocument();
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Show (next|the last)/ })).not.toBeInTheDocument();
  });

  it('starts back at the top page on a new scan', async () => {
    hookState.rows = many(12);
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Show next 5' }));
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    expect(screen.getByText('Showing 5 of 12')).toBeInTheDocument();
  });

  it('cuts the page from the whole ranking under the URL sort, not the ISK/hour top page', () => {
    // Widget 9 is outside the ISK/hour top 5 but the cheapest build.
    hookState.rows = many(12).map((r, i) => (i === 9 ? { ...r, buildCost: 1 } : r));
    renderPanel(undefined, ['/?marketWide.sort=buildCost:asc']);
    expect(screen.getByText('Widget 9')).toBeInTheDocument();
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

describe('MarketWideOpportunitiesPanel margin and time (issue #2297)', () => {
  const productOrder = () =>
    screen
      .getAllByText(/^Widget/)
      .map((node) => node.textContent)
      .filter((name) => name?.startsWith('Widget'));

  afterEach(() => {
    hookState.rows = null;
  });

  it('shows Margin then Time, both before ISK/hour', () => {
    renderPanel();
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent ?? '');
    const at = (label: string) => headers.findIndex((h) => h.startsWith(label));
    expect(at('Margin')).toBeGreaterThan(-1);
    expect(at('Margin')).toBeLessThan(at('Time'));
    expect(at('Time')).toBeLessThan(at('ISK/hour'));
    const beta = screen.getByText('Widget Beta').closest('tr')!;
    expect(within(beta).getByText('18.4%')).toBeInTheDocument();
    expect(within(beta).getByText(formatDuration(3600))).toBeInTheDocument();
  });

  it('sorts by margin from the URL, with an unknown margin last', () => {
    hookState.rows = [
      row(200, 'Widget Beta', { marginPct: null }),
      row(300, 'Widget Gamma', { marginPct: 40 }),
      row(400, 'Widget Delta', { marginPct: 10 }),
    ];
    renderPanel(undefined, ['/?marketWide.sort=margin:desc']);
    expect(productOrder()).toEqual(['Widget Gamma', 'Widget Delta', 'Widget Beta']);
    expect(
      within(screen.getByText('Widget Beta').closest('tr')!).getByText(i18n.t('common.unknown'))
    ).toBeInTheDocument();
  });

  it('sorts by time from the URL', () => {
    hookState.rows = [
      row(200, 'Widget Beta', { seconds: 7200 }),
      row(300, 'Widget Gamma', { seconds: 1800 }),
      row(400, 'Widget Delta', { seconds: 3600 }),
    ];
    renderPanel(undefined, ['/?marketWide.sort=duration:asc']);
    expect(productOrder()).toEqual(['Widget Gamma', 'Widget Delta', 'Widget Beta']);
  });
});
