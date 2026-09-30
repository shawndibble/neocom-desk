import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { HaulingScanRow } from './haulingData';
import type { HaulingScanState } from './useHaulingScan';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';

const FEES = {
  accountingLevel: 5,
  brokerRelationsLevel: 4,
  standing: { factionStanding: 0, corpStanding: 0 },
};

const SCAN_ROW: HaulingScanRow = {
  mode: 'list',
  typeId: 2048,
  destBuyLadder: [],
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

const INSTANT_READY: HaulingScanState = {
  status: 'ready',
  scan: {
    rows: [
      {
        mode: 'instant',
        typeId: 2048,
        name: 'Damage Control II',
        unitVolumeM3: 5,
        buyLadder: [{ price: 100, units: 10, orders: 1 }],
        destLadder: [],
        destBuyLadder: [{ price: 130, units: 10, orders: 1 }],
      },
    ],
    scanned: 1,
    fetchedAt: 0,
  },
};

const scanModes: string[] = [];
vi.mock('./useHaulingScan', () => ({
  useHaulingScan: (_from: unknown, _to: unknown, _cat: unknown, mode: string) => {
    scanModes.push(mode);
    return { state: mode === 'instant' ? INSTANT_READY : READY, refresh: vi.fn() };
  },
  useHaulingFees: () => FEES,
}));
vi.mock('@/sde/loadMarketSde', () => ({ loadMarketGroups: vi.fn(async () => []) }));

const { HaulingPanel } = await import('./HaulingPanel');

function renderPanel(query = 'from=jita&to=amarr') {
  const actions = fakeItemActions();
  render(
    <MemoryRouter initialEntries={[`/market/hauling?${query}`]}>
      <FakeItemActions actions={actions}>
        <HaulingPanel />
      </FakeItemActions>
    </MemoryRouter>
  );
  return { actions };
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
    const { actions } = renderPanel();
    fireEvent.contextMenu(screen.getByRole('row', { name: /Damage Control II/ }));

    expect(await screen.findByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(actions.showInfo).toHaveBeenCalledWith(2048, 'Damage Control II');
  });

  it('asks for the blueprint catalog the first time a row menu opens', () => {
    const { actions } = renderPanel();
    fireEvent.contextMenu(screen.getByRole('row', { name: /Damage Control II/ }));
    expect(actions.requestBlueprints).toHaveBeenCalled();
  });

  it('offers a visible More actions button on each row', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
  });
});

describe('HaulingPanel modes', () => {
  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: null });
    scanModes.length = 0;
  });

  it('lists for sale by default, with Days, Demand and ISK/m³ columns', () => {
    renderPanel();
    expect(scanModes.at(-1)).toBe('list');
    expect(screen.getByRole('columnheader', { name: /Days/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Demand/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /ISK\/m³/ })).toBeInTheDocument();
  });

  it('selling into buy orders scans that mode and hides Days and Demand', () => {
    renderPanel('from=jita&to=amarr&mode=instant');
    expect(scanModes.at(-1)).toBe('instant');
    expect(screen.queryByRole('columnheader', { name: /Days/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Demand/ })).toBeNull();
    expect(screen.getByRole('columnheader', { name: /ISK\/m³/ })).toBeInTheDocument();
    // The realised buy-order price: 10 units sold at 130.
    expect(screen.getByRole('row', { name: /Damage Control II/ })).toHaveTextContent('130.00');
  });
});
