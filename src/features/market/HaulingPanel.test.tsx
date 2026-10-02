import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureClipboard } from '@/lib/clipboard';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { TRADE_HUBS } from '@/market/hubs';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { HaulingScanRow } from './haulingData';
import type { HaulingScanState } from './useHaulingScan';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';

const FEES = {
  accountingLevel: 5,
  brokerRelationsLevel: 4,
  standing: { factionStanding: 0, corpStanding: 0 },
};

const JITA = TRADE_HUBS.find((h) => h.id === 'jita')!;
const AMARR = TRADE_HUBS.find((h) => h.id === 'amarr')!;
const DODIXIE = TRADE_HUBS.find((h) => h.id === 'dodixie')!;

const SCAN_ROW: HaulingScanRow = {
  mode: 'list',
  fromHub: JITA,
  toHub: AMARR,
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
        fromHub: JITA,
        toHub: AMARR,
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

const ANY_FROM_READY: HaulingScanState = {
  status: 'ready',
  scan: { rows: [{ ...SCAN_ROW, fromHub: DODIXIE, toHub: JITA }], scanned: 1, fetchedAt: 0 },
};

const scanModes: string[] = [];
const scanCalls: { from: unknown; to: unknown; enabled: boolean }[] = [];
vi.mock('./useHaulingScan', () => ({
  useHaulingScan: (
    from: unknown,
    to: unknown,
    _cat: unknown,
    mode: string,
    enabled: boolean = true
  ) => {
    scanModes.push(mode);
    scanCalls.push({ from, to, enabled });
    const state = from === 'any' ? ANY_FROM_READY : mode === 'instant' ? INSTANT_READY : READY;
    return { state, refresh: vi.fn() };
  },
  useHaulingFees: () => ({ accountingLevel: 5, brokerRelationsLevel: 4, at: () => FEES }),
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

describe('HaulingPanel trip summary', () => {
  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: null });
  });
  afterEach(() => configureClipboard(null));

  it('select all in the summary row unticks and reticks every row', async () => {
    const user = userEvent.setup();
    renderPanel();
    const all = screen.getByRole('checkbox', { name: 'Select all' });
    const row = screen.getByRole('checkbox', { name: /Include Damage Control II/ });
    expect(all).toBeChecked();
    await user.click(all);
    expect(row).not.toBeChecked();
    expect(screen.getByText('0 of 1')).toBeInTheDocument();
    await user.click(all);
    expect(row).toBeChecked();
  });

  it('keeps Fill my hold, Clear all and the multibuy list in the actions menu', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(screen.queryByLabelText('Multibuy list')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Hauling actions' }));
    expect(screen.getByRole('menuitem', { name: 'Fill my hold' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Clear all' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Show multibuy list' }));

    expect(screen.getByLabelText('Multibuy list')).toHaveTextContent('Damage Control II');
  });

  it('opens the multibuy list when the clipboard refuses the copy', async () => {
    const user = userEvent.setup();
    configureClipboard(async () => {
      throw new Error('denied');
    });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Copy Multibuy' }));

    expect(await screen.findByLabelText('Multibuy list')).toHaveTextContent('Damage Control II');
  });
});

describe('HaulingPanel modes', () => {
  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: null });
    scanModes.length = 0;
  });

  it('lists for sale by default, with Days (carrying demand) and ISK/m³ columns', () => {
    renderPanel();
    expect(scanModes.at(-1)).toBe('list');
    expect(screen.getByRole('columnheader', { name: /^Days/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /ISK\/m³/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Damage Control II/ })).toHaveTextContent(
      'Sells most days'
    );
  });

  it('selling into buy orders scans that mode and hides Days and Demand', () => {
    renderPanel('from=jita&to=amarr&mode=instant');
    expect(scanModes.at(-1)).toBe('instant');
    expect(screen.queryByRole('columnheader', { name: /^Days/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /^Demand/ })).toBeNull();
    expect(screen.getByRole('columnheader', { name: /ISK\/m³/ })).toBeInTheDocument();
    // The realised buy-order price: 10 units sold at 130.
    expect(screen.getByRole('row', { name: /Damage Control II/ })).toHaveTextContent('130.00');
  });
});

describe('HaulingPanel, Any hub', () => {
  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: null });
    scanCalls.length = 0;
  });

  it('reads Any from the link, scans with it, and names each row hub', () => {
    renderPanel('from=any&to=jita');
    expect(scanCalls.at(-1)).toMatchObject({ from: 'any', to: JITA });
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveTextContent('Any hub');
    expect(screen.getByRole('columnheader', { name: /^Hub/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Damage Control II/ })).toHaveTextContent('Dodixie');
  });

  it('picking Any hub writes it to the link and rescans with it', async () => {
    const user = userEvent.setup();
    renderPanel('from=jita&to=amarr');
    await user.click(screen.getByRole('combobox', { name: 'From' }));
    await user.click(screen.getByRole('option', { name: 'Any hub' }));
    expect(scanCalls.at(-1)).toMatchObject({ from: 'any', to: AMARR });
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveTextContent('Any hub');
  });

  it('shows no Hub column on a plain lane', () => {
    renderPanel();
    expect(screen.queryByRole('columnheader', { name: /^Hub/ })).toBeNull();
  });

  it('refuses Any at both ends with a message, and runs no scan', () => {
    renderPanel('from=any&to=any');
    expect(screen.getByText('Any hub works at one end only')).toBeInTheDocument();
    expect(scanCalls.every((call) => !call.enabled)).toBe(true);
  });
});
