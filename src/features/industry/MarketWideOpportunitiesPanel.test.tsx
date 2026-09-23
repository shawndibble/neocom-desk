import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { TradeHub } from '@/market/hubs';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { MarketWideOpportunitiesPanel } from './MarketWideOpportunitiesPanel';

const row = (productTypeID: number, productName: string): MarketWideResultRow =>
  ({
    productTypeID,
    productName,
    blueprintTypeID: productTypeID + 1000,
    iskPerHour: 1_000_000,
    buildCost: 5_000_000,
    orderDepth: 'deep',
  }) as unknown as MarketWideResultRow;

vi.mock('./useMarketWideOpportunities', () => ({
  useMarketWideOpportunities: () => ({
    rows: [row(200, 'Widget Beta'), row(300, 'Widget Gamma')],
    loading: false,
    hasRun: true,
    error: false,
    run: () => {},
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

function renderPanel(props: { onAddToQuickbar?: () => void; quickbarAvailable?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <MarketWideOpportunitiesPanel
        hub={{ id: 'jita' } as unknown as TradeHub}
        trees={{}}
        catalog={catalog}
        modifiers={{} as CharacterModifiers}
        activeCharacterId={null}
        onStartPlan={() => {}}
        onAddToQuickbar={props.onAddToQuickbar ?? (() => {})}
        quickbarAvailable={props.quickbarAvailable ?? true}
        onShowInfo={() => {}}
      />
    </MemoryRouter>
  );
}

describe('MarketWideOpportunitiesPanel row context menu', () => {
  it('opens the item menu for the row product', async () => {
    const onAddToQuickbar = vi.fn();
    renderPanel({ onAddToQuickbar });

    fireEvent.contextMenu(screen.getByText('Widget Beta').closest('tr')!);
    fireEvent.click(await screen.findByText('Add to Quickbar'));

    expect(onAddToQuickbar).toHaveBeenCalledWith(200, 'Widget Beta');
    expect(screen.getAllByRole('button', { name: 'Start a plan' })[0]).toBeInTheDocument();
  });

  it('shows no blueprint for a product the catalog has no entry for', async () => {
    renderPanel();

    fireEvent.contextMenu(screen.getByText('Widget Gamma').closest('tr')!);

    expect(await screen.findByText(/no blueprint/i)).toBeInTheDocument();
  });
});
