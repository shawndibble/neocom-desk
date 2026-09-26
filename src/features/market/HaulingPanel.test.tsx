import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { HaulingScanRow } from './haulingData';
import type { HaulingScanState } from './useHaulingScan';

const FEES = {
  accountingLevel: 5,
  brokerRelationsLevel: 4,
  standing: { factionStanding: 0, corpStanding: 0 },
};

const SCAN_ROW: HaulingScanRow = {
  typeId: 2048,
  name: 'Damage Control II',
  unitVolumeM3: 5,
  buyLadder: [{ price: 100, units: 10_000, orders: 3 }],
  destLadder: [{ price: 200, units: 50, orders: 3 }],
  demand: { dailyVolume: 10, daysWithTrades: 25, recentSalePrice: 150, demand: 'most-days' },
  sale: {
    price: 150,
    lowestAsk: 200,
    undercutPrice: 199,
    recentSalePrice: 150,
    unitsAhead: 0,
    dailyVolume: 10,
    daysToSell: 1,
    demandCapUnits: 70,
  },
};

const READY: HaulingScanState = {
  status: 'ready',
  scan: { rows: [SCAN_ROW], scanned: 1, fetchedAt: 0 },
};

vi.mock('./useHaulingScan', () => ({
  useHaulingScan: () => ({ state: READY, refresh: vi.fn() }),
  useHaulingFees: () => FEES,
}));
vi.mock('@/sde/loadMarketSde', () => ({ loadMarketGroups: vi.fn(async () => []) }));

const { HaulingPanel } = await import('./HaulingPanel');

function renderPanel() {
  const props = {
    blueprintCatalog: null,
    onRequestBlueprintCatalog: vi.fn(),
    onAddToQuickbar: vi.fn(),
    quickbarAvailable: true,
    onShowInfo: vi.fn(),
  };
  render(
    <MemoryRouter initialEntries={['/market/hauling?from=jita&to=amarr']}>
      <HaulingPanel {...props} />
    </MemoryRouter>
  );
  return props;
}

describe('HaulingPanel item rows', () => {
  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: null });
  });

  it('links the item name into the Market Browser', () => {
    renderPanel();
    const link = screen.getByRole('link', { name: 'Damage Control II' });
    expect(link.getAttribute('href')).toMatch(/^\/market\/browser\?.*type=2048/);
  });

  it('carries the item context menu on every row', async () => {
    const { onShowInfo } = renderPanel();
    fireEvent.contextMenu(screen.getByRole('row', { name: /Damage Control II/ }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(onShowInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
  });

  it('asks for the blueprint catalog the first time a row menu opens', () => {
    const { onRequestBlueprintCatalog } = renderPanel();
    fireEvent.contextMenu(screen.getByRole('row', { name: /Damage Control II/ }));
    expect(onRequestBlueprintCatalog).toHaveBeenCalled();
  });

  it('offers a visible More actions button on each row', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
  });
});
