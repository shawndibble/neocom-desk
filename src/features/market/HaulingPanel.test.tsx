import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { configureClipboard } from '@/lib/clipboard';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { TRADE_HUBS } from '@/market/hubs';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useHaulingBudget, useHaulingCargo } from './haulingCargo';
import { DEFAULT_HAULING_FILTER, useHaulingFilterPref } from './haulingFilterPref';
import type { ListHaulingScanRow } from './haulingData';
import type { HaulingScanState } from './useHaulingScan';
import type { HaulingFillScanInput, HaulingFillScanState } from './useHaulingFillScan';
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
  demand: {
    dailyVolume: 10,
    daysWithTrades: 25,
    recentSalePrice: 150,
    latestDay: null,
    demand: 'most-days',
  },
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
  scan: { rows: [SCAN_ROW], scanned: 1, examinedTypeIds: [], overMaxPrice: 0, fetchedAt: 0 },
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
    examinedTypeIds: [],
    overMaxPrice: 0,
    fetchedAt: 0,
  },
};

const ANY_FROM_READY: HaulingScanState = {
  status: 'ready',
  scan: {
    rows: [{ ...SCAN_ROW, fromHub: DODIXIE, toHub: JITA }],
    scanned: 1,
    examinedTypeIds: [],
    overMaxPrice: 0,
    fetchedAt: 0,
  },
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
/** The input the panel last gave the fill: its exclusions and its sizing. */
let fillInput: HaulingFillScanInput | null = null;
const fillFind = vi.fn();
const fillMore = vi.fn();
const fillStop = vi.fn();
const fillReset = vi.fn();
vi.mock('./useHaulingFillScan', async () => {
  const { useState } = await import('react');
  return {
    useHaulingFillScan: (input: HaulingFillScanInput) => {
      fillInput = input;
      const lane = input.laneKey;
      const [asked, setAsked] = useState<string | null>(null);
      return {
        // A new lane is idle until asked again, like the real hook.
        state: asked === lane ? fillState : { status: 'idle' },
        find: () => {
          fillFind();
          setAsked(lane);
        },
        more: () => {
          fillMore();
          setAsked(lane);
        },
        stop: fillStop,
        reset: () => {
          fillReset();
          setAsked(null);
        },
      };
    },
  };
});

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
/** The panel's measured width (rem): every `useElementNarrowerThan` reads it. jsdom measures nothing, so wide by default. */
let panelRem = Infinity;
vi.mock('@/lib/useElementNarrowerThan', () => ({
  useElementNarrowerThan: (rems: readonly number[]) => [
    () => {},
    rems.map((rem) => panelRem < rem),
  ],
}));

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

/** The link as the panel last wrote it, read back by `linkParam`. */
function LocationSpy() {
  return (
    <output data-testid="link" hidden>
      {useLocation().search}
    </output>
  );
}
const linkParam = (key: string) =>
  new URLSearchParams(screen.getByTestId('link').textContent ?? '').get(key);

function renderPanel(query = 'from=jita&to=amarr') {
  const actions = fakeItemActions();
  render(
    <MemoryRouter initialEntries={[`/market/hauling?${query}`]}>
      <FakeItemActions actions={actions}>
        <HaulingPanel />
      </FakeItemActions>
      <LocationSpy />
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
  fillInput = null;
  fillFind.mockClear();
  fillMore.mockClear();
  fillStop.mockClear();
  fillReset.mockClear();
  jumpCalls.length = 0;
  phone = false;
  panelRem = Infinity;
  // Hydrated, so a value one test remembers never leaks into the next through storage.
  useHaulingFilterPref.setState({ hydrated: true, value: DEFAULT_HAULING_FILTER });
  useHaulingBudget.setState({ hydrated: true, value: null });
});
afterEach(() => {
  useHaulingCargo.setState({ value: null });
  useHaulingBudget.setState({ value: null });
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
    expect(screen.getByRole('link', { name: 'Amarr market' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trip' })).toBeInTheDocument();

    await user.click(row());
    expect(row()).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('link', { name: /Price history/ })).toBeNull();
  });

  it('opens each row’s detail with its folds closed', async () => {
    const user = userEvent.setup();
    mainState = {
      status: 'ready',
      scan: {
        rows: [SCAN_ROW, { ...SCAN_ROW, typeId: 2205, name: 'Hammerhead II' }],
        scanned: 2,
        examinedTypeIds: [],
        overMaxPrice: 0,
        fetchedAt: 0,
      },
    };
    renderPanel();
    await user.click(row());
    await user.click(screen.getByRole('button', { name: 'Show the math' }));
    expect(screen.getByRole('button', { name: 'Show the math' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await user.click(row(/Hammerhead II/));
    expect(screen.getByRole('button', { name: 'Show the math' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('counts what ships, not what is ticked: a row Max spend sizes to nothing is not in the trip', () => {
    mainState = {
      status: 'ready',
      scan: {
        rows: [SCAN_ROW, { ...SCAN_ROW, typeId: 2205, name: 'Hammerhead II' }],
        scanned: 2,
        examinedTypeIds: [],
        overMaxPrice: 0,
        fetchedAt: 0,
      },
    };
    // 70 Damage Control II at 100 each: nothing left for the second.
    useHaulingBudget.setState({ hydrated: true, value: 7_000 });
    renderPanel();
    expect(screen.getByText('1 of 2 in the trip')).toBeInTheDocument();
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
    expect(screen.getByText('Profit per jump (9)')).toBeInTheDocument();
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
      screen.getByRole('progressbar', { name: 'Cargo hold: 300 of 300 cubic metres used' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Ammo hold: 0 of 41,000 cubic metres used' })
    ).toBeInTheDocument();
    await userEvent.hover(bringBox());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '300 m³ · in Cargo hold · limited by space'
    );
  });
});

/** The fill once its batches stopped, with `rows` found. */
const fillDone = (
  rows: ListHaulingScanRow[],
  reason: Extract<HaulingFillScanState, { status: 'ready' }>['reason'] = 'nothing-left'
): HaulingFillScanState => ({ status: 'ready', rows, reason, batches: 1 });

describe('HaulingPanel fill the free space', () => {
  it('scans only when asked: idle, then the running batch with Stop', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = {
      status: 'loading',
      batch: 2,
      progress: { stage: 'prices', done: 1, total: 3 },
      rows: [],
      freeM3: 300,
    };
    renderPanel();
    expect(fillFind).not.toHaveBeenCalled();
    // 1,000 m³ less Damage Control II's 350.
    expect(screen.getByText(/fit the free 650 m³/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));
    expect(fillFind).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /Find items/ })).toBeNull();
    expect(screen.getByRole('status', { name: 'Batch 2 · 300 m³ free' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(fillStop).toHaveBeenCalledOnce();
  });

  it('never scans the table’s own rows again, and sizes each batch as the list would', async () => {
    setCargo(1000);
    renderPanel();
    expect([...fillInput!.excludeIds()]).toEqual([2048]);
    // 200 m³ of the 650 free: one line, from this batch.
    expect(fillInput!.measure([FILL_ROW], new Set([4051]))).toEqual({
      freeM3: 450,
      capacityM3: 1000,
      binding: 'sales',
      newLines: 1,
      batchRows: 1,
    });
    expect(fillInput!.measure([FILL_ROW], new Set())).toMatchObject({ newLines: 0 });
  });

  it('never spends a batch on what the category scan examined either', () => {
    setCargo(1000);
    mainState = {
      status: 'ready',
      scan: {
        rows: [SCAN_ROW],
        scanned: 3,
        examinedTypeIds: [2048, 77],
        overMaxPrice: 0,
        fetchedAt: 0,
      },
    };
    renderPanel();
    expect(new Set(fillInput!.excludeIds())).toEqual(new Set([2048, 77]));
  });

  it('sizes only rows the user’s filters let through', async () => {
    setCargo(1000);
    renderPanel('from=jita&to=amarr&margin=90');
    // Filtered out, it is no row of the batch either: the batch counts as empty.
    expect(fillInput!.measure([FILL_ROW], new Set([4051]))).toMatchObject({
      freeM3: 1000,
      newLines: 0,
      batchRows: 0,
    });
  });

  it('offers what the batches found; Add puts the ticked ones in the trip and says what it loaded', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = fillDone([FILL_ROW]);
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));

    const list = screen.getByRole('list', { name: 'Items that fit the free space' });
    expect(within(list).getByText('Nitrogen Fuel Block')).toBeInTheDocument();
    expect(within(list).getByText('200 m³')).toBeInTheDocument();
    expect(await within(list).findByText('· Planetary Infrastructure')).toBeInTheDocument();
    expect(screen.getByText(/with the fill/)).toBeInTheDocument();
    expect(
      screen.getByText('Nothing else on this lane is profitable.', { selector: 'p' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add 1 · +200 m³' }));

    expect(row(/Nitrogen Fuel Block/)).toHaveTextContent('Added from Planetary Infrastructure');
    expect(bringBox('Nitrogen Fuel Block')).toHaveValue('40');
    // The plan already shipped stays as it was.
    expect(bringBox()).toHaveValue('70');
    expect(screen.getByText('2 of 2 in the trip')).toBeInTheDocument();
    expect(
      screen.getByText('Added 1 item · +200 m³ · 450 m³ still free', { selector: 'p' })
    ).toBeInTheDocument();
    // Nothing is left on the lane: no Find more.
    expect(screen.queryByRole('button', { name: 'Find more' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Hauling actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Show multibuy list' }));
    expect(screen.getByLabelText('Multibuy list')).toHaveTextContent('Nitrogen Fuel Block 40');
  });

  it('keeps the added rows in the table while Find more runs, and excludes them', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = fillDone([FILL_ROW], 'batch-cap');
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));
    await user.click(screen.getByRole('button', { name: /^Add 1/ }));
    expect([...fillInput!.excludeIds()]).toEqual([2048, 4051]);

    fillState = { status: 'loading', batch: 2, progress: null, rows: [FILL_ROW], freeM3: null };
    await user.click(screen.getByRole('button', { name: 'Find more' }));
    expect(fillMore).toHaveBeenCalledOnce();
    expect(row(/Nitrogen Fuel Block/)).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Batch 2 · 450 m³ free' })).toBeInTheDocument();
  });

  it('says why it stopped, and offers Find more while the hold has room', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = fillDone([], 'batch-cap');
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));
    expect(
      screen.getByText('Stopped after 8 batches; press Find more to keep going.', { selector: 'p' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find more' }));
    expect(fillMore).toHaveBeenCalledOnce();
  });

  it('offers no Find more while Max spend binds: more items could not be bought', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    // Damage Control II takes 7,000 ISK; 1,000 is left for the fill.
    useHaulingBudget.setState({ hydrated: true, value: 8_000 });
    fillState = fillDone([FILL_ROW], 'budget');
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));
    expect(screen.getByText('Your Max spend is the limit.', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Find more' })).toBeNull();
  });

  it('sizes the ticked items again: unticking one frees its room for the rest', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    // Two of 500 m³ each for the 650 m³ free: the second gets only what is left.
    const big = (typeId: number, name: string, price: number): ListHaulingScanRow => ({
      ...FILL_ROW,
      typeId,
      name,
      sale: { ...FILL_ROW.sale, price, demandCapUnits: 100 },
    });
    fillState = fillDone([
      big(4051, 'Nitrogen Fuel Block', 160),
      big(4246, 'Hydrogen Fuel Block', 150),
    ]);
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));
    const list = screen.getByRole('list', { name: 'Items that fit the free space' });
    expect(within(list).getByText('150 m³')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Nitrogen Fuel Block' }));
    expect(within(list).getAllByText('500 m³')).toHaveLength(2);
    expect(within(list).queryByText('150 m³')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add 1 · +500 m³' }));
    expect(bringBox('Hydrogen Fuel Block')).toHaveValue('100');
  });

  it('drops the fill and the added items with a new lane, and with a reload', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = fillDone([FILL_ROW]);
    let info: { refresh: () => void } | null = null;
    render(
      <MemoryRouter initialEntries={['/market/hauling?from=jita&to=amarr']}>
        <FakeItemActions actions={fakeItemActions()}>
          <HaulingPanel onRefreshInfoChange={(next) => (info = next)} />
        </FakeItemActions>
      </MemoryRouter>
    );
    const addOne = async () => {
      await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));
      await user.click(screen.getByRole('button', { name: /^Add 1/ }));
      expect(row(/Nitrogen Fuel Block/)).toBeInTheDocument();
    };

    await addOne();
    act(() => info!.refresh());
    expect(fillReset).toHaveBeenCalledOnce();
    expect(screen.queryByRole('row', { name: /Nitrogen Fuel Block/ })).toBeNull();
    // Add's pins go with the rows: nothing is left edited for Fill my hold to undo.
    await user.click(screen.getByRole('button', { name: 'Hauling actions' }));
    expect(screen.getByRole('menuitem', { name: 'Fill my hold' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await user.keyboard('{Escape}');

    await addOne();
    await user.click(screen.getByRole('combobox', { name: 'From' }));
    await user.click(screen.getByRole('option', { name: 'Dodixie' }));
    expect(screen.queryByRole('row', { name: /Nitrogen Fuel Block/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Find items to fill it' })).toBeInTheDocument();
  });

  it('an unticked item is not added', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = fillDone([FILL_ROW]);
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));
    await user.click(screen.getByRole('checkbox', { name: 'Nitrogen Fuel Block' }));
    expect(screen.getByRole('button', { name: /^Add 0/ })).toBeDisabled();
  });

  it('keeps what earlier batches found addable when a batch fails', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = { status: 'error', rows: [FILL_ROW], batches: 1 };
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add 1 · +200 m³' }));
    expect(row(/Nitrogen Fuel Block/)).toBeInTheDocument();
  });

  it('gives the fill the Max price, and a new one starts it over like a new lane', () => {
    setCargo(1000);
    renderPanel('from=jita&to=amarr&maxprice=500');
    expect(fillInput!.maxUnitPrice).toBe(500);
    expect(fillInput!.laneKey).toMatch(/:max500$/);
  });

  it('retries a failed batch by carrying on', async () => {
    const user = userEvent.setup();
    setCargo(1000);
    fillState = { status: 'error', rows: [], batches: 0 };
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));
    expect(fillMore).toHaveBeenCalledOnce();
  });

  it('is not offered with Any hub at an end: it would scan every hub', () => {
    setCargo(1000);
    renderPanel('from=any&to=jita');
    expect(screen.queryByText('Fill the free space')).toBeNull();
  });

  it('is offered for Everything too', () => {
    setCargo(1000);
    renderPanel('from=jita&to=amarr&cat=0');
    expect(screen.getByRole('button', { name: 'Find items to fill it' })).toBeInTheDocument();
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
    // The item's ⋮ rides in the sheet's title row, once.
    expect(
      within(sheet).getAllByRole('button', { name: 'More actions for Damage Control II' })
    ).toHaveLength(1);
    expect(within(sheet).getByRole('link', { name: 'Amarr market' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(within(bar).getByRole('button', { name: /Trip details/ }));
    const trip = screen.getByRole('dialog', { name: 'Trip' });
    expect(within(trip).getByText('Profit')).toBeInTheDocument();
  });
});

describe('HaulingPanel too narrow for the rail, not a phone', () => {
  it('keeps the rail down to a phone-wide column beside it', () => {
    panelRem = 50;
    renderPanel();
    expect(screen.getByText('Select an item to see its price math.')).toBeInTheDocument();
  });

  it('slides the detail and the trip in over the right edge instead of a sheet', async () => {
    panelRem = 40;
    const user = userEvent.setup();
    renderPanel();
    expect(screen.queryByText('Select an item to see its price math.')).toBeNull();
    const bar = screen.getByRole('region', { name: 'Trip' });

    await user.click(row());
    const panel = screen.getByRole('dialog', { name: 'Damage Control II' });
    expect(panel).not.toHaveAttribute('aria-modal', 'true');
    expect(
      within(panel).getAllByRole('button', { name: 'More actions for Damage Control II' })
    ).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(within(bar).getByRole('button', { name: /Trip details/ }));
    expect(
      within(screen.getByRole('dialog', { name: 'Trip' })).getByText('Profit')
    ).toBeInTheDocument();
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
    expect(screen.queryByText(/Profit per jump/)).toBeNull();
  });

  it('picking Any hub writes it to the link and rescans with it', async () => {
    const user = userEvent.setup();
    renderPanel('from=jita&to=amarr');
    await user.click(screen.getByRole('combobox', { name: 'From' }));
    await user.click(screen.getByRole('option', { name: 'Any hub' }));
    expect(scanCalls.at(-1)).toMatchObject({ from: 'any', to: AMARR });
  });

  it('the arrow between the hubs swaps them, in the link and the scan', async () => {
    const user = userEvent.setup();
    renderPanel('from=jita&to=amarr');
    await user.click(screen.getByRole('button', { name: 'Swap origin and destination' }));
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveTextContent('Amarr');
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveTextContent('Jita');
    expect(scanCalls.at(-1)).toMatchObject({ from: AMARR, to: JITA });
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
    mainState = {
      status: 'ready',
      scan: { rows: [], scanned: 0, examinedTypeIds: [], overMaxPrice: 0, fetchedAt: 0 },
    };
    renderPanel();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeInTheDocument();
  });
});

describe('HaulingPanel data age (#3534)', () => {
  it('hands the ready scan’s fetchedAt up to the page header instead of badging its own filter bar', () => {
    const onRefreshInfoChange = vi.fn();
    const { container } = render(
      <MemoryRouter initialEntries={['/market/hauling?from=jita&to=amarr']}>
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
      <MemoryRouter initialEntries={['/market/hauling?from=jita&to=jita']}>
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

/** Buys at 5,000 ISK at the origin; sells well enough to pass the other filters. */
const DEAR_ROW: ListHaulingScanRow = {
  ...SCAN_ROW,
  typeId: 3001,
  name: 'Expensive Widget',
  buyLadder: [{ price: 5_000, units: 100, orders: 1 }],
  destLadder: [{ price: 10_000, units: 50, orders: 3 }],
  sale: { ...SCAN_ROW.sale, price: 7_500, lowestAsk: 10_000, undercutPrice: 9_999 },
};
const WITH_DEAR: HaulingScanState = {
  status: 'ready',
  scan: {
    rows: [SCAN_ROW, DEAR_ROW],
    scanned: 2,
    examinedTypeIds: [],
    overMaxPrice: 0,
    fetchedAt: 0,
  },
};

describe('HaulingPanel filters: Max price per item and Max spend', () => {
  it('counts what the scan’s own price pass dropped for Max price in the hidden line', () => {
    mainState = {
      status: 'ready',
      scan: { rows: [SCAN_ROW], scanned: 9, examinedTypeIds: [], overMaxPrice: 4, fetchedAt: 0 },
    };
    renderPanel('from=jita&to=amarr&maxprice=1000');
    expect(screen.getByText(/4 cost more than your max price per item/)).toBeInTheDocument();
  });

  it('Max price per item hides the dearer rows, says so, and is written to the link and remembered', async () => {
    mainState = WITH_DEAR;
    const user = userEvent.setup();
    renderPanel();
    expect(row(/Expensive Widget/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.type(screen.getByRole('textbox', { name: 'Max price per item' }), '1000{Enter}');
    expect(screen.queryByRole('row', { name: /Expensive Widget/ })).toBeNull();
    expect(row()).toBeInTheDocument();
    expect(screen.getByText(/1 cost more than your max price per item/)).toBeInTheDocument();
    expect(linkParam('maxprice')).toBe('1000');
    expect(useHaulingFilterPref.getState().value.maxprice).toBe(1_000);
    expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeInTheDocument();
    // Cleared: no limit, gone from the link and from storage.
    await user.clear(screen.getByRole('textbox', { name: 'Max price per item' }));
    await user.keyboard('{Enter}');
    expect(row(/Expensive Widget/)).toBeInTheDocument();
    expect(linkParam('maxprice')).toBeNull();
    expect(useHaulingFilterPref.getState().value.maxprice).toBeNull();
  });

  it('on a wide screen commits on Enter or blur, not per keystroke: the rows and the selection stay', async () => {
    mainState = WITH_DEAR;
    const user = userEvent.setup();
    renderPanel();
    await user.click(row());
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const field = screen.getByRole('textbox', { name: 'Max price per item' });
    // `250m` passes through 2 ISK, which would hide every row.
    await user.type(field, '250m');
    expect(linkParam('maxprice')).toBeNull();
    expect(row()).toHaveAttribute('aria-current', 'true');
    expect(row(/Expensive Widget/)).toBeInTheDocument();
    await user.tab();
    expect(linkParam('maxprice')).toBe('250000000');
    expect(row()).toHaveAttribute('aria-current', 'true');
    // Enter commits too.
    await user.clear(field);
    await user.type(field, '1000');
    expect(row(/Expensive Widget/)).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('row', { name: /Expensive Widget/ })).toBeNull();
    expect(row()).toHaveAttribute('aria-current', 'true');
  });

  it('a half-typed figure left on blur or Enter reverts to the committed one', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const field = screen.getByRole('textbox', { name: 'Max price per item' });
    await user.type(field, '1.5');
    await user.tab();
    expect(field).toHaveValue('');
    expect(linkParam('maxprice')).toBeNull();
    await user.type(field, '1000{Enter}');
    await user.clear(field);
    await user.type(field, '2.5{Enter}');
    expect(field).toHaveValue('1000');
    expect(linkParam('maxprice')).toBe('1000');
  });

  it('keeps shorthand typed on its way to a figure: 1.5b commits 1,500,000,000', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const field = screen.getByRole('textbox', { name: 'Max price per item' });
    await user.type(field, '1.5b{Enter}');
    expect(field).toHaveValue('1.5b');
    expect(linkParam('maxprice')).toBe('1500000000'); // 2.01 × 1e6 is 2009999.99… in floating point: it still commits the whole figure, and the text stays.
    await user.clear(field);
    await user.type(field, '2.01m');
    await user.tab();
    expect(field).toHaveValue('2.01m');
    expect(linkParam('maxprice')).toBe('2010000');
  });

  it('names Max price in the hidden line only when it hid something', () => {
    mainState = WITH_DEAR;
    renderPanel('from=jita&to=amarr&maxprice=1000000&margin=100');
    expect(screen.queryByText(/max price per item/)).toBeNull();
  });

  it('a remembered max price applies when the link has none; the link’s own wins', () => {
    mainState = WITH_DEAR;
    useHaulingFilterPref.setState({ value: { ...DEFAULT_HAULING_FILTER, maxprice: 1_000 } });
    renderPanel();
    expect(screen.queryByRole('row', { name: /Expensive Widget/ })).toBeNull();
    cleanupAndRender('from=jita&to=amarr&maxprice=9000');
    expect(row(/Expensive Widget/)).toBeInTheDocument();
  });

  it('Reset filters brings back rows Max price hid, and leaves Max spend alone', async () => {
    mainState = {
      status: 'ready',
      scan: { rows: [DEAR_ROW], scanned: 1, examinedTypeIds: [], overMaxPrice: 0, fetchedAt: 0 },
    };
    useHaulingBudget.setState({ value: 2_000_000 });
    const user = userEvent.setup();
    renderPanel('from=jita&to=amarr&maxprice=1000');
    expect(screen.getByText(/1 cost more than your max price per item/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(row(/Expensive Widget/)).toBeInTheDocument();
    expect(linkParam('maxprice')).toBeNull();
    expect(useHaulingBudget.getState().value).toBe(2_000_000);
  });

  it('Max spend edits the Trip Plan budget, and the plan stays within it', async () => {
    setCargo(100_000);
    const user = userEvent.setup();
    renderPanel();
    expect(bringBox()).toHaveValue('70');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const field = screen.getByRole('textbox', { name: 'Max spend' });
    expect(field).toHaveAccessibleDescription(/For the whole trip/);
    await user.type(field, '1000');
    await user.tab();
    // 100 ISK a unit: 1,000 ISK buys 10.
    expect(bringBox()).toHaveValue('10');
    expect(useHaulingBudget.getState().value).toBe(1_000);
    expect(linkParam('spend')).toBe('1000');
  });

  it('a saved budget shows in Max spend, and a link’s spend wins without being saved', async () => {
    setCargo(100_000);
    useHaulingBudget.setState({ value: 2_000 });
    const user = userEvent.setup();
    renderPanel('from=jita&to=amarr&spend=500');
    expect(bringBox()).toHaveValue('5');
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('textbox', { name: 'Max spend' })).toHaveValue('500');
    expect(useHaulingBudget.getState().value).toBe(2_000);
  });

  it('on a phone, Max spend in the filter sheet commits without an Apply step', async () => {
    phone = true;
    panelRem = 20;
    // jsdom's `matchMedia` never matches; the filter sheet needs the narrow query to.
    const realMatchMedia = window.matchMedia;
    window.matchMedia = (media: string) =>
      ({
        media,
        matches: media === NARROW_QUERY,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    onTestFinished(() => {
      window.matchMedia = realMatchMedia;
    });
    setCargo(100_000);
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog');
    await user.type(within(sheet).getByRole('textbox', { name: 'Max spend' }), '1000');
    await user.keyboard('{Enter}');
    expect(useHaulingBudget.getState().value).toBe(1_000);
    expect(linkParam('spend')).toBe('1000');
  });
});

function cleanupAndRender(query: string) {
  cleanup();
  renderPanel(query);
}
