import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureClipboard } from '@/lib/clipboard';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { TRADE_HUBS } from '@/market/hubs';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useHaulingCargo } from './haulingCargo';
import type { ListHaulingScanRow } from './haulingData';
import type { HaulingScanState } from './useHaulingScan';
import type { HaulingFillScanState } from './useHaulingFillScan';
import type { HubJumps } from './useHubJumps';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';

const FEES = {
  accountingLevel: 5,
  brokerRelationsLevel: 4,
  standing: { factionStanding: 0, corpStanding: 0 },
};

const JITA = TRADE_HUBS.find((h) => h.id === 'jita')!;
const AMARR = TRADE_HUBS.find((h) => h.id === 'amarr')!;
const DODIXIE = TRADE_HUBS.find((h) => h.id === 'dodixie')!;

const SCAN_ROW: ListHaulingScanRow = {
  mode: 'list',
  fromHub: JITA,
  toHub: AMARR,
  typeId: 2048,
  destBuyLadder: [],
  name: 'Damage Control II',
  groupId: 60,
  categoryId: 7,
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

/** From another category: what the fill offers. */
const FILL_ROW: ListHaulingScanRow = {
  ...SCAN_ROW,
  typeId: 4051,
  name: 'Nitrogen Fuel Block',
  groupId: 1136,
  categoryId: 4,
  sale: { ...SCAN_ROW.sale, demandCapUnits: 40 },
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
        groupId: 60,
        categoryId: 7,
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

let mainState: HaulingScanState | null = null;
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
    const state =
      mainState ?? (from === 'any' ? ANY_FROM_READY : mode === 'instant' ? INSTANT_READY : READY);
    return { state, refresh: vi.fn() };
  },
  useHaulingFees: () => ({ accountingLevel: 5, brokerRelationsLevel: 4, at: () => FEES }),
}));

let fillState: HaulingFillScanState = { status: 'idle' };
const fillCalls: { enabled: boolean }[] = [];
const fillRefresh = vi.fn();
vi.mock('./useHaulingFillScan', () => ({
  useHaulingFillScan: (
    _from: unknown,
    _to: unknown,
    _cat: unknown,
    _mode: unknown,
    enabled: boolean
  ) => {
    fillCalls.push({ enabled });
    return { state: enabled ? fillState : { status: 'idle' }, refresh: fillRefresh };
  },
}));

const jumpCalls: [number | null, number | null][] = [];
vi.mock('./useHubJumps', () => ({
  useHubJumps: (from: number | null, to: number | null): HubJumps => {
    jumpCalls.push([from, to]);
    return from === null || to === null
      ? { status: 'none' }
      : { status: 'known', jumps: 9, preference: 'shortest' };
  },
}));

let phone = false;
vi.mock('@/lib/useIsPhone', () => ({ useIsPhone: () => phone }));

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketGroups: vi.fn(async () => [
    { id: 11, name: 'Ammunition & Charges', parentId: null, hasTypes: true },
    { id: 1320, name: 'Planetary Infrastructure', parentId: null, hasTypes: true },
  ]),
  loadMarketTypes: vi.fn(async () => [
    { typeId: 4051, name: 'Nitrogen Fuel Block', marketGroupId: 1320, volume: 5 },
  ]),
}));

const { HaulingPanel } = await import('./HaulingPanel');

function renderPanel(query = 'from=jita&to=amarr') {
  const actions = fakeItemActions();
  render(
    <MemoryRouter initialEntries={[`/travel/hauling?${query}`]}>
      <FakeItemActions actions={actions}>
        <HaulingPanel />
      </FakeItemActions>
    </MemoryRouter>
  );
  return { actions };
}

const row = (name: RegExp | string = /Damage Control II/) => screen.getByRole('row', { name });
const bringBox = (item = 'Damage Control II') =>
  screen.getByRole('textbox', { name: `Quantity of ${item} to bring` });

function setCargo(m3: number) {
  useHaulingCargo.setState({
    hydrated: true,
    value: { label: 'Hold', holds: [{ kind: 'general', capacityM3: m3 }] },
  });
}

beforeEach(() => {
  useActiveCharacter.setState({ activeCharacterId: null });
  mainState = null;
  fillState = { status: 'idle' };
  fillCalls.length = 0;
  fillRefresh.mockClear();
  jumpCalls.length = 0;
  phone = false;
});
afterEach(() => {
  useHaulingCargo.setState({ value: null });
  configureClipboard(null);
});

describe('HaulingPanel rows select, the rail shows the detail', () => {
  it('has no row ⋮ or row menu; the item’s menu lives in its detail', async () => {
    const user = userEvent.setup();
    const { actions } = renderPanel();
    expect(screen.queryByRole('button', { name: /more actions/i })).toBeNull();
    // The name is the row's handle, not a link.
    expect(screen.queryByRole('link', { name: 'Damage Control II' })).toBeNull();

    await user.click(row());
    await user.click(screen.getByRole('button', { name: 'More actions for Damage Control II' }));
    expect(actions.requestBlueprints).toHaveBeenCalled();
    expect(await screen.findByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
  });

  it('a click selects the row and shows its detail in the rail; a second click clears it', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(row());
    expect(row()).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('link', { name: 'Price history and orders in Amarr' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trip' })).toBeInTheDocument();

    await user.click(row());
    expect(row()).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('link', { name: /Price history/ })).toBeNull();
  });

  it('the Trip crumb goes back to the trip but keeps the row selected', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(row());
    await user.click(screen.getByRole('button', { name: 'Trip' }));
    expect(screen.queryByRole('link', { name: /Price history/ })).toBeNull();
    expect(screen.getByText('Select an item to see its price math.')).toBeInTheDocument();
    expect(row()).toHaveAttribute('aria-current', 'true');
  });

  it('ticking a row or typing in Bring does not select it', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('checkbox', { name: /Include Damage Control II/ }));
    await user.click(bringBox());
    expect(row()).not.toHaveAttribute('aria-current');
  });
});

describe('HaulingPanel table', () => {
  it('lists for sale by default: Profit with its margin, m³, Days; ISK/m³ and Margin start hidden', () => {
    renderPanel();
    expect(scanModes.at(-1)).toBe('list');
    for (const name of [/^Buy/, /^Sell/, /^Profit/, /^m³/, /^Days/, /^Bring/]) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('columnheader', { name: /ISK\/m³/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /^Margin/ })).toBeNull();
    // 70 units (a week of sales), 350 m³, Profit with the margin under it.
    expect(row()).toHaveTextContent('Sells most days');
    expect(row()).toHaveTextContent('350');
    expect(row()).toHaveTextContent(/\+[\d,]+.*% margin/);
    expect(bringBox()).toHaveValue('70');
  });

  it('selling into buy orders hides Days, and the detail shows the buy orders', async () => {
    const user = userEvent.setup();
    renderPanel('from=jita&to=amarr&mode=instant');
    expect(scanModes.at(-1)).toBe('instant');
    expect(screen.queryByRole('columnheader', { name: /^Days/ })).toBeNull();
    // The realised buy-order price: 10 units sold at 130.
    expect(row()).toHaveTextContent('130.00');
    await user.click(row());
    expect(screen.getByText('Buy orders in Amarr')).toBeInTheDocument();
  });

  it('select all in the strip unticks and reticks every row', async () => {
    const user = userEvent.setup();
    renderPanel();
    const all = screen.getByRole('checkbox', { name: 'Select all' });
    const tick = screen.getByRole('checkbox', { name: /Include Damage Control II/ });
    expect(all).toBeChecked();
    expect(screen.getByText('1 of 1 in the trip')).toBeInTheDocument();
    await user.click(all);
    expect(tick).not.toBeChecked();
    expect(screen.getByText('0 of 1 in the trip')).toBeInTheDocument();
    expect(bringBox()).toHaveValue('');
    await user.click(all);
    expect(tick).toBeChecked();
  });
});

describe('HaulingPanel trip rail', () => {
  it('keeps Fill my hold, Clear all and the multibuy list in the trip’s menu', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(screen.queryByLabelText('Multibuy list')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Hauling actions' }));
    expect(screen.getByRole('menuitem', { name: 'Fill my hold' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Clear all' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Show multibuy list' }));

    expect(screen.getByLabelText('Multibuy list')).toHaveTextContent('Damage Control II 70');
  });

  it('opens the multibuy list when the clipboard refuses the copy', async () => {
    const user = userEvent.setup();
    configureClipboard(async () => {
      throw new Error('denied');
    });
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Copy multibuy list' }));
    expect(await screen.findByLabelText('Multibuy list')).toHaveTextContent('Damage Control II');
  });

  it('names the lane and its profit per jump', () => {
    renderPanel();
    expect(jumpCalls.at(-1)).toEqual([JITA.systemId, AMARR.systemId]);
    expect(screen.getByText(/Jita to Amarr · 9 jumps/)).toBeInTheDocument();
    expect(screen.getByText('Profit per jump')).toBeInTheDocument();
  });

  it('with no Cargo Space set, offers no fill', () => {
    renderPanel();
    expect(screen.getByText('Cargo value')).toBeInTheDocument();
    expect(screen.queryByText('Fill the free space')).toBeNull();
  });

  it('says which hold each plan line rides in, one bar per hold', async () => {
    useHaulingCargo.setState({
      hydrated: true,
      value: {
        label: 'Hoarder',
        holds: [
          { kind: 'general', capacityM3: 300 },
          { kind: 'ammo', capacityM3: 41_000 },
        ],
      },
    });
    renderPanel();
    // Damage Control II is a module: it fills the cargo hold, never the ammo hold.
    expect(
      screen.getByRole('img', { name: 'Cargo hold: 300 of 300 cubic metres used' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Ammo hold: 0 of 41,000 cubic metres used' })
    ).toBeInTheDocument();
    await userEvent.hover(bringBox());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '300 m³ · in Cargo hold · limited by space'
    );
  });
});

describe('HaulingPanel fill the free space', () => {
  it('scans only when asked: idle, then loading', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = { status: 'loading', progress: { stage: 'prices', done: 1, total: 3 } };
    renderPanel();
    expect(fillCalls.every((c) => !c.enabled)).toBe(true);
    // 1,000 m³ less Damage Control II's 350.
    await user.click(screen.getByRole('button', { name: 'Find items for the free 650 m³' }));
    expect(fillCalls.at(-1)).toEqual({ enabled: true });
    expect(screen.queryByRole('button', { name: /Find items/ })).toBeNull();
  });

  it('offers other categories’ items, and Add puts the ticked ones in the trip as offered', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = {
      status: 'ready',
      scan: { rows: [FILL_ROW], scanned: 1, fetchedAt: 0 },
    };
    renderPanel();
    await user.click(screen.getByRole('button', { name: /Find items for the free/ }));

    const list = screen.getByRole('list', { name: 'Items that fit the free space' });
    expect(within(list).getByText('Nitrogen Fuel Block')).toBeInTheDocument();
    expect(await within(list).findByText('Planetary Infrastructure · 200 m³')).toBeInTheDocument();
    expect(screen.getByText(/with the fill/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add 1 · +200 m³' }));

    expect(row(/Nitrogen Fuel Block/)).toHaveTextContent('Added from Planetary Infrastructure');
    expect(bringBox('Nitrogen Fuel Block')).toHaveValue('40');
    // The plan already shipped stays as it was.
    expect(bringBox()).toHaveValue('70');
    expect(screen.getByText('2 of 2 in the trip')).toBeInTheDocument();
    expect(screen.getByText('Nothing else on this lane fits.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hauling actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Show multibuy list' }));
    expect(screen.getByLabelText('Multibuy list')).toHaveTextContent('Nitrogen Fuel Block 40');
  });

  it('an unticked item is not added', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = { status: 'ready', scan: { rows: [FILL_ROW], scanned: 1, fetchedAt: 0 } };
    renderPanel();
    await user.click(screen.getByRole('button', { name: /Find items for the free/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Nitrogen Fuel Block' }));
    expect(screen.getByRole('button', { name: /^Add 0/ })).toBeDisabled();
  });

  it('retries a failed scan with a refresh', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = { status: 'error' };
    renderPanel();
    await user.click(screen.getByRole('button', { name: /Find items for the free/ }));
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));
    expect(fillRefresh).toHaveBeenCalled();
  });

  it('is not offered for Everything, which leaves no other category', () => {
    setCargo(1000);
    renderPanel('from=jita&to=amarr&cat=0');
    expect(screen.queryByText('Fill the free space')).toBeNull();
  });
});

describe('HaulingPanel on a phone', () => {
  it('has no rail: a trip bar opens the trip, and a card opens its detail in a sheet', async () => {
    phone = true;
    const user = userEvent.setup();
    renderPanel();
    expect(screen.queryByText('Select an item to see its price math.')).toBeNull();
    const bar = screen.getByRole('region', { name: 'Trip' });
    expect(within(bar).getByRole('button', { name: 'Copy multibuy list' })).toBeInTheDocument();

    await user.click(row());
    const sheet = screen.getByRole('dialog', { name: 'Damage Control II' });
    expect(
      within(sheet).getByRole('link', { name: 'Price history and orders in Amarr' })
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(within(bar).getByRole('button', { name: /Trip details/ }));
    const trip = screen.getByRole('dialog', { name: 'Trip' });
    expect(within(trip).getByText('Profit')).toBeInTheDocument();
  });
});

describe('HaulingPanel, Any hub', () => {
  it('reads Any from the link, names each row’s hub, and shows no per-jump figure', () => {
    renderPanel('from=any&to=jita');
    expect(scanCalls.at(-1)).toMatchObject({ from: 'any', to: JITA });
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveTextContent('Any hub');
    expect(screen.getByRole('columnheader', { name: /^Hub/ })).toBeInTheDocument();
    expect(row()).toHaveTextContent('Dodixie');
    expect(jumpCalls.at(-1)).toEqual([null, null]);
    expect(screen.queryByText('Profit per jump')).toBeNull();
  });

  it('picking Any hub writes it to the link and rescans with it', async () => {
    const user = userEvent.setup();
    renderPanel('from=jita&to=amarr');
    await user.click(screen.getByRole('combobox', { name: 'From' }));
    await user.click(screen.getByRole('option', { name: 'Any hub' }));
    expect(scanCalls.at(-1)).toMatchObject({ from: 'any', to: AMARR });
  });

  it('refuses Any at both ends with a message, and runs no scan', () => {
    scanCalls.length = 0;
    renderPanel('from=any&to=any');
    expect(screen.getByText('Any hub works at one end only')).toBeInTheDocument();
    expect(scanCalls.every((call) => !call.enabled)).toBe(true);
  });
});

describe('HaulingPanel states', () => {
  it('says so for the same hub at both ends', () => {
    renderPanel('from=jita&to=jita');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy multibuy list' })).toBeNull();
  });

  it('offers a retry when the scan fails', () => {
    mainState = { status: 'error' };
    renderPanel();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy multibuy list' })).toBeNull();
  });

  it('shows the empty state, with a reset, when nothing passes the filters', () => {
    mainState = { status: 'ready', scan: { rows: [], scanned: 0, fetchedAt: 0 } };
    renderPanel();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeInTheDocument();
  });
});

describe('HaulingPanel data age (#3534)', () => {
  it('hands the ready scan’s fetchedAt up to the page header instead of badging its own filter bar', () => {
    const onRefreshInfoChange = vi.fn();
    const { container } = render(
      <MemoryRouter initialEntries={['/travel/hauling?from=jita&to=amarr']}>
        <FakeItemActions actions={fakeItemActions()}>
          <HaulingPanel onRefreshInfoChange={onRefreshInfoChange} />
        </FakeItemActions>
      </MemoryRouter>
    );

    expect(onRefreshInfoChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: false, fetchedAt: 0 })
    );
    expect(container.querySelector('time')).toBeNull();
  });

  it('hands up no fetchedAt while no scan is ready', () => {
    const onRefreshInfoChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/travel/hauling?from=jita&to=jita']}>
        <FakeItemActions actions={fakeItemActions()}>
          <HaulingPanel onRefreshInfoChange={onRefreshInfoChange} />
        </FakeItemActions>
      </MemoryRouter>
    );

    expect(onRefreshInfoChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true, fetchedAt: null })
    );
  });
});
