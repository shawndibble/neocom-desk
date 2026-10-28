import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { createFeedStore, type FeedStore } from './data/feedStore';
import { FeedStoreContext } from './data/feedStoreContext';
import { OverviewRefreshContext } from './data/refreshContext';
import { sampleView } from './gallerySamples';
import * as widgetView from './data/useWidgetView';
import { WidgetGrid } from './WidgetGrid';
import { Widget } from './Widget';
import type { Widget as WidgetModel } from './layout';
import type { KillsEntry } from './data/kindLoaders';
import { heightKey, rememberedBodyHeight, resetRememberedHeights } from './skeletonHeight';

const grant = vi.hoisted(() => ({ begin: vi.fn(async () => undefined) }));
vi.mock('@/app/grantAction', () => ({ beginGrant: grant.begin }));

vi.mock('./data/useWidgetView', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/useWidgetView')>();
  return { ...actual, useWidgetView: vi.fn(actual.useWidgetView) };
});

const NOW = Date.now();

const model = (patch: Partial<WidgetModel> = {}): WidgetModel => ({
  id: 'w1',
  kind: 'mail',
  size: 'M',
  view: 'number',
  scope: 'header',
  showOnPhone: true,
  ...patch,
});

const mailData = (unread: number, recent = 1) => ({
  unread,
  recent: Array.from({ length: recent }, (_, i) => ({
    mailId: i + 1,
    subject: `Subject ${i + 1}`,
    from: `Sender ${i + 1}`,
    atMs: NOW - 3_600_000,
  })),
  needsReauth: false,
  fetchedAt: new Date(NOW - 5 * 60_000),
});

function renderWidget(
  widget: WidgetModel,
  setup: (store: FeedStore) => void,
  props: Partial<React.ComponentProps<typeof Widget>> = {},
  refresh = vi.fn()
) {
  const store = createFeedStore();
  setup(store);
  const onRemove = vi.fn();
  render(
    <MemoryRouter>
      <FeedStoreContext.Provider value={store}>
        <OverviewRefreshContext.Provider value={{ epoch: 0, refresh }}>
          <Widget widget={widget} onRemove={onRemove} {...props} />
        </OverviewRefreshContext.Provider>
      </FeedStoreContext.Provider>
    </MemoryRouter>
  );
  return { onRemove, refresh };
}

describe('remembered skeleton height', () => {
  const reported = 180;
  beforeEach(() => {
    localStorage.clear();
    resetRememberedHeights();
    // Reports a settled body height as soon as a node is observed.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe() {
          this.callback(
            [{ borderBoxSize: [{ blockSize: reported, inlineSize: 300 }] } as never],
            this as never
          );
        }
        disconnect() {}
        unobserve() {}
      }
    );
    return () => vi.unstubAllGlobals();
  });

  const key = () => heightKey(model(), useActiveCharacter.getState().activeCharacterId, false);

  it('remembers a settled body for the next load', () => {
    renderWidget(model(), (store) =>
      store.set('mail', { data: mailData(7), error: false, loading: false })
    );
    expect(rememberedBodyHeight(key())).toBe(reported);
  });

  it('does not remember a failed read, a passing state rather than the widget height', () => {
    renderWidget(model(), (store) =>
      store.set('mail', { data: null, error: true, loading: false })
    );
    expect(rememberedBodyHeight(key())).toBeUndefined();
  });

  it('stands the skeleton at the remembered height', () => {
    renderWidget(model(), (store) =>
      store.set('mail', { data: mailData(7), error: false, loading: false })
    );
    cleanup();
    renderWidget(model(), (store) =>
      store.set('mail', { data: null, error: false, loading: true })
    );
    const region = screen.getByRole('region', { name: 'Mail' });
    expect(within(region).getByText('Loading').parentElement).toHaveStyle({
      minHeight: `${reported}px`,
    });
  });
});

describe('a view still settling', () => {
  beforeEach(() => {
    localStorage.clear();
    resetRememberedHeights();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe() {
          this.callback(
            [{ borderBoxSize: [{ blockSize: 50, inlineSize: 300 }] } as never],
            this as never
          );
        }
        disconnect() {}
        unobserve() {}
      }
    );
    return () => vi.unstubAllGlobals();
  });

  const wallet = model({ kind: 'wallet', view: 'chart', size: 'S' });
  const balance = {
    data: {
      result: { data: 5_000_000, fetchedAt: new Date(NOW), fromCache: false, truncated: false },
      needsReauth: false,
    },
    error: false,
    loading: false,
  };
  const body = () =>
    screen.getByRole('region', { name: 'Wallet' }).querySelector<HTMLElement>(':scope > .flex-1')!;
  const key = () => heightKey(wallet, useActiveCharacter.getState().activeCharacterId, false);

  it('holds the reserved height while a secondary read is out, and does not remember the partial body', () => {
    renderWidget(wallet, (store) => {
      store.set('wallet', balance);
      store.set('journal', { data: null, error: false, loading: true });
    });
    expect(screen.getByRole('region', { name: 'Wallet' })).toHaveAttribute('aria-busy', 'false');
    expect(body().style.minHeight).toBe('148px');
    expect(rememberedBodyHeight(key())).toBeUndefined();
  });

  it('treats an empty view the same while a read is still out', () => {
    const sample = sampleView('wallet', i18n.t.bind(i18n))!;
    vi.mocked(widgetView.useWidgetView).mockReturnValueOnce({
      ...sample,
      status: { ...sample.status, isEmpty: true },
      settling: true,
    });
    renderWidget(wallet, () => undefined);
    expect(body().style.minHeight).toBe('148px');
    expect(rememberedBodyHeight(key())).toBeUndefined();
  });

  it('lets go of the reserve once every read is in', () => {
    renderWidget(wallet, (store) => {
      store.set('wallet', balance);
      store.set('journal', { data: null, error: true, loading: false });
    });
    expect(body().style.minHeight).toBe('');
    expect(rememberedBodyHeight(key())).toBe(50);
  });
});

describe('Widget states', () => {
  it('shows a busy skeleton with hidden text while the first read is in flight', () => {
    renderWidget(model(), (store) =>
      store.set('mail', { data: null, error: false, loading: true })
    );
    const region = screen.getByRole('region', { name: 'Mail' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(within(region).getByText('Loading')).toHaveClass('sr-only');
  });

  it('draws the headline number with its unit and note when the read is ok', () => {
    renderWidget(model(), (store) =>
      store.set('mail', { data: mailData(7), error: false, loading: false })
    );
    const region = screen.getByRole('region', { name: 'Mail' });
    expect(region).toHaveAttribute('aria-busy', 'false');
    expect(within(region).getByText('7')).toBeInTheDocument();
    expect(within(region).getByText('unread')).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Mail' })).toHaveAttribute('href', '/mail');
  });

  it('keeps the headline above the rows in Table view and counts what the size hides', () => {
    renderWidget(model({ view: 'table', size: 'S' }), (store) =>
      store.set('mail', { data: mailData(9, 5), error: false, loading: false })
    );
    const region = screen.getByRole('region', { name: 'Mail' });
    expect(within(region).getByText('9')).toBeInTheDocument();
    // A Small shows four rows and says how many more there are.
    expect(within(region).getAllByText(/^Sender [0-9]$/)).toHaveLength(4);
    expect(within(region).getByText('+1 more')).toBeInTheDocument();
  });

  it('shows the sender and the age only at Small', () => {
    renderWidget(model({ view: 'table', size: 'S' }), (store) =>
      store.set('mail', { data: mailData(2, 2), error: false, loading: false })
    );
    expect(screen.queryByText('Subject 1')).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Mail' }).querySelectorAll('td:not([aria-hidden])')
    ).toHaveLength(4);
  });

  it('shows the subject as a third column at Medium', () => {
    renderWidget(model({ view: 'table', size: 'M' }), (store) =>
      store.set('mail', { data: mailData(2, 2), error: false, loading: false })
    );
    expect(screen.getByText('Subject 1')).toBeInTheDocument();
  });

  it('draws a Chart view as the Number for a kind with no chart', () => {
    renderWidget(model({ view: 'chart' }), (store) =>
      store.set('mail', { data: mailData(4), error: false, loading: false })
    );
    expect(within(screen.getByRole('region', { name: 'Mail' })).getByText('4')).toBeInTheDocument();
  });

  it('asks for the permission, with a Grant access action, when the grant lapsed and nothing was saved', () => {
    useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
    renderWidget(model(), (store) =>
      store.set('mail', {
        // Nothing was ever read (no `fetchedAt`): there is no saved mail to keep on screen.
        data: { ...mailData(0, 0), needsReauth: true, fetchedAt: null },
        error: false,
        loading: false,
      })
    );
    const region = screen.getByRole('region', { name: 'Mail' });
    expect(within(region).getByText('Needs permission')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Grant access' })).toBeInTheDocument();
  });

  it('keeps a saved wallet balance on screen, with a small sign-in note, when the grant lapsed over it', () => {
    useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
    renderWidget(model({ kind: 'wallet', view: 'number' }), (store) =>
      store.set('wallet', {
        data: {
          result: {
            data: 5_000_000,
            fetchedAt: new Date(NOW - 60_000),
            fromCache: true,
            truncated: false,
          },
          needsReauth: true,
        },
        error: false,
        loading: false,
      })
    );
    const region = screen.getByRole('region', { name: 'Wallet' });
    expect(within(region).queryByText('Needs permission')).not.toBeInTheDocument();
    expect(within(region).getByText('5,000,000 ISK')).toBeInTheDocument();
    expect(
      within(region).getByRole('button', { name: 'Log in again with EVE Online' })
    ).toBeInTheDocument();
  });

  it('says it could not load, dims the last good value and retries from the refresh epoch', async () => {
    const user = userEvent.setup();
    const { refresh } = renderWidget(model(), (store) =>
      store.set('mail', { data: mailData(7), error: true, loading: false })
    );
    const region = screen.getByRole('region', { name: 'Mail' });
    expect(within(region).getByRole('alert')).toHaveTextContent('Could not load');
    expect(within(region).getByText(/Last good value 5m ago/)).toBeInTheDocument();
    expect(within(region).getByText('7').closest('.opacity-45')).not.toBeNull();
    await user.click(within(region).getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('says there is nothing to show when it failed with nothing saved', () => {
    renderWidget(model(), (store) =>
      store.set('mail', { data: null, error: true, loading: false })
    );
    const region = screen.getByRole('region', { name: 'Mail' });
    expect(within(region).getByText('Nothing was saved to show.')).toBeInTheDocument();
  });

  it('says what the kind has nothing of, with a Remove widget action', async () => {
    const user = userEvent.setup();
    const { onRemove } = renderWidget(model({ kind: 'priceWatch' }), (store) =>
      store.set('priceAlerts', {
        data: { alerts: [], checkedAt: null },
        error: false,
        loading: false,
      })
    );
    const region = screen.getByRole('region', { name: 'Price watch' });
    expect(within(region).getByText(/No Quickbar item has a price target/)).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Remove widget' }));
    expect(onRemove).toHaveBeenCalledWith('w1');
  });

  it('links the Mining survey empty state to the Mining Survey tab', () => {
    renderWidget(model({ kind: 'survey' }), (store) =>
      store.set('survey', {
        data: { hasSurvey: false, location: null, summary: null, fetchedAt: null },
        error: false,
        loading: false,
      })
    );
    const region = screen.getByRole('region', { name: 'Mining survey' });
    expect(within(region).getByText('No survey yet')).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Open Mining Survey' })).toHaveAttribute(
      'href',
      '/mining/survey'
    );
  });

  it('links the Hauling empty state to the Hauling tab', () => {
    renderWidget(model({ kind: 'hauling' }), (store) =>
      store.set('hauling', {
        data: { hasScan: false, routes: [], fetchedAt: null },
        error: false,
        loading: false,
      })
    );
    const region = screen.getByRole('region', { name: 'Hauling' });
    expect(within(region).getByText('No scan yet')).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Open Hauling' })).toHaveAttribute(
      'href',
      '/market/hauling'
    );
  });

  it('offers Grant access for the one Jump timer it cannot read, beside the one it can', () => {
    useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
    renderWidget(model({ kind: 'jumpTimers' }), (store) =>
      store.set('jumpTimers', {
        data: {
          clone: { state: 'read', endsAt: null },
          fatigue: { state: 'needsPermission' },
          fetchedAt: new Date(),
        },
        error: false,
        loading: false,
      })
    );
    const region = screen.getByRole('region', { name: 'Jump timers' });
    expect(within(region).getAllByText('Ready').length).toBeGreaterThan(0);
    expect(within(region).getByRole('button', { name: 'Grant access' })).toBeInTheDocument();
  });

  it('mining tax shows the Characters that granted it, with no prompt for one that did not', () => {
    useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
    renderWidget(model({ kind: 'miningTax' }), (store) =>
      store.set('mining', {
        data: {
          unpaidIsk: 10_900_000,
          payeeCount: 1,
          unassignedCount: 0,
          oldestUnpaidDays: 3,
          needsReauth: false,
          fetchedAt: new Date(),
          characterCount: 2,
          missingCharacterNames: ['Shadow Ruler'],
          missingCharacterIds: [92],
        },
        error: false,
        loading: false,
      })
    );
    const region = screen.getByRole('region', { name: 'Mining tax' });
    expect(within(region).getByText('10.9M')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Grant access' })).toBeNull();
  });

  it('mining tax, when no Character can read, asks one that lacks it rather than the active one', async () => {
    useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
    renderWidget(model({ kind: 'miningTax' }), (store) =>
      store.set('mining', {
        data: {
          unpaidIsk: 0,
          payeeCount: 0,
          unassignedCount: 0,
          oldestUnpaidDays: null,
          needsReauth: true,
          fetchedAt: new Date(),
          characterCount: 1,
          missingCharacterNames: ['Shadow Ruler'],
          missingCharacterIds: [92],
        },
        error: false,
        loading: false,
      })
    );
    const region = screen.getByRole('region', { name: 'Mining tax' });
    expect(within(region).getByText(/Shadow Ruler/)).toBeInTheDocument();
    await userEvent.click(within(region).getByRole('button', { name: 'Grant access' }));
    expect(grant.begin).toHaveBeenCalledWith(92, ['getCharacterMining']);
  });

  it('asks for permission outright when neither Jump timer can be read', () => {
    useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
    renderWidget(model({ kind: 'jumpTimers' }), (store) =>
      store.set('jumpTimers', {
        data: {
          clone: { state: 'needsPermission' },
          fatigue: { state: 'needsPermission' },
          fetchedAt: null,
        },
        error: false,
        loading: false,
      })
    );
    const region = screen.getByRole('region', { name: 'Jump timers' });
    expect(within(region).getByRole('button', { name: 'Grant access' })).toBeInTheDocument();
  });
});

describe('Widget charts', () => {
  const netWorthFeed = (store: FeedStore) =>
    store.set('netWorth', {
      data: {
        characters: [
          {
            characterId: 91,
            day: '2026-10-10',
            covered: true,
            layers: {
              isk: 4_000_000_000,
              assets: 29_000_000_000,
              escrow: 0,
              sellOrders: 6_000_000_000,
              contracts: 0,
            },
            history: [],
          },
        ],
      },
      error: false,
      loading: false,
    });

  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
  });

  const legend = (region: HTMLElement) =>
    [...region.querySelectorAll('li')].map((li) => li.textContent);

  it('keeps the headline above the chart in the Chart view, with a hidden text summary and a legend', () => {
    renderWidget(model({ kind: 'netWorth', view: 'chart', size: 'L' }), netWorthFeed);
    const region = screen.getByRole('region', { name: 'Net worth' });
    // The "as of" day is the chart's caption now, not a line under the number.
    expect(within(region).getAllByText(/2026-10-10/).length).toBeGreaterThan(0);
    // The legend names every layer in bar order, so colour is never the only signal.
    expect(legend(region)).toEqual(['Assets 29B', 'Sell orders 6B', 'ISK 4B']);
    const summary = region.querySelector('p.sr-only');
    expect(summary?.textContent).toContain('Net worth 39B');
    expect(summary?.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('draws a number and nothing else in the Number view, at every size', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      renderWidget(
        model({ id: 'n' + size, kind: 'netWorth', view: 'number', size, title: 'Net ' + size }),
        netWorthFeed
      );
      const region = screen.getByRole('region', { name: 'Net ' + size });
      expect(legend(region), size).toHaveLength(0);
      expect(region.querySelector('svg:not([aria-hidden="true"])'), size).toBeNull();
      expect(region.querySelector('p.sr-only'), size).toBeNull();
    }
  });

  it('puts the table beside the chart at Large, and not at Medium', () => {
    renderWidget(
      model({ id: 'l', kind: 'netWorth', view: 'chart', size: 'L', title: 'Large' }),
      netWorthFeed
    );
    renderWidget(
      model({ id: 'm', kind: 'netWorth', view: 'chart', size: 'M', title: 'Medium' }),
      netWorthFeed
    );
    expect(
      within(screen.getByRole('region', { name: 'Large' })).getByRole('table')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Medium' })).queryByRole('table')
    ).not.toBeInTheDocument();
  });
});

describe('Route safety widget', () => {
  const day = (store: FeedStore, over: Record<string, unknown> = {}) =>
    store.set('routeSafety', {
      data: {
        hasRoute: true,
        href: '/travel/route?from=1&stops=3',
        systems: [
          { systemId: 1, name: 'Efa', kills: [] },
          { systemId: 2, name: 'Niarja', kills: [Date.now() - 60_000, Date.now() - 120_000] },
        ],
        raidable: [],
        fetchedAt: new Date(),
        ...over,
      },
      error: false,
      loading: false,
    });

  it('draws kills per hour with its max, its range and a text equivalent', () => {
    renderWidget(model({ kind: 'routeSafety', view: 'chart' }), (store) => day(store));
    const region = screen.getByRole('region', { name: 'Route safety' });
    expect(within(region).getByText('max 2 per hour')).toBeInTheDocument();
    expect(within(region).getByText('24 h ago')).toBeInTheDocument();
    expect(within(region).getByText(/2 player kills in the last 24 hours/)).toBeInTheDocument();
    expect(within(region).getByText('0')).toBeInTheDocument();
  });

  it('says No saved route, with a link to Route Safety, when none was drawn', () => {
    renderWidget(model({ kind: 'routeSafety', view: 'chart' }), (store) =>
      day(store, { hasRoute: false, href: null, systems: [] })
    );
    const region = screen.getByRole('region', { name: 'Route safety' });
    expect(within(region).getByText('No saved route')).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Open Route Safety' })).toHaveAttribute(
      'href',
      '/travel/route'
    );
  });
});

describe('Kills and losses widget', () => {
  const feed = (store: FeedStore, entries: KillsEntry[], error = false) =>
    store.set('kills', {
      data: {
        entries,
        reach: { 1: null },
        failedIds: [],
        trackedIds: [1],
        systemNames: new Map([[30000142, 'Jita']]),
        typeNames: new Map([[626, 'Vexor']]),
        fetchedAt: new Date(NOW),
      },
      error,
      loading: false,
    });
  const kill = (id: number, side: 'kill' | 'loss'): KillsEntry => ({
    characterId: 1,
    killmailId: id,
    side,
    timeMs: NOW - 3_600_000,
    systemId: 30000142,
    shipTypeId: 626,
    value: 5_000_000,
  });

  it('draws kills per day with its max and a text equivalent', () => {
    renderWidget(model({ kind: 'kills', view: 'chart', range: 30, scope: 'all' }), (store) =>
      feed(store, [kill(1, 'kill'), kill(2, 'loss')])
    );
    const region = screen.getByRole('region', { name: 'Kills and losses' });
    expect(within(region).getByText('max 2 per day')).toBeInTheDocument();
    expect(within(region).getByText(/2 kills and losses in the last 30 days/)).toBeInTheDocument();
  });

  it('says No kills or losses in this range when the range holds none', () => {
    renderWidget(model({ kind: 'kills', range: 7 }), (store) => feed(store, []));
    const region = screen.getByRole('region', { name: 'Kills and losses' });
    expect(within(region).getByText('No kills or losses in this range')).toBeInTheDocument();
  });

  it('says it could not load, keeps the last value and retries', async () => {
    const user = userEvent.setup();
    const { refresh } = renderWidget(model({ kind: 'kills', range: 30, scope: 'all' }), (store) =>
      feed(store, [kill(1, 'kill')], true)
    );
    const region = screen.getByRole('region', { name: 'Kills and losses' });
    expect(within(region).getByRole('alert')).toHaveTextContent('Could not load');
    expect(within(region).getByText('1').closest('.opacity-45')).not.toBeNull();
    await user.click(within(region).getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('Widget header', () => {
  const ready = (store: FeedStore) =>
    store.set('priceAlerts', {
      data: {
        alerts: [
          {
            typeId: 1,
            name: 'Tritanium',
            targetPrice: 4,
            direction: 'below',
            price: 5,
            crossed: false,
          },
        ],
        checkedAt: NOW,
      },
      error: false,
      loading: false,
    });

  it('draws no New tag: every widget is new', () => {
    renderWidget(model({ kind: 'priceWatch' }), ready);
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });

  it('says All characters, with the count, when the widget itself reads everyone', async () => {
    await db.characters.clear();
    await db.characters.bulkPut([
      { characterId: 1, name: 'One', ownerHash: 'a', addedAt: 1 },
      { characterId: 2, name: 'Two', ownerHash: 'b', addedAt: 2 },
    ]);
    renderWidget(model({ kind: 'priceWatch', scope: 'all' }), ready);
    expect(await screen.findByText('All characters · 2')).toBeInTheDocument();
  });

  it('uses the widget own name when it has one', () => {
    renderWidget(model({ kind: 'priceWatch', title: 'My targets' }), ready);
    expect(screen.getByRole('region', { name: 'My targets' })).toBeInTheDocument();
  });

  it('draws the menu, header start and edit controls it is handed, and only those', () => {
    renderWidget(model({ kind: 'priceWatch' }), ready);
    expect(screen.queryByRole('button', { name: /settings for/i })).not.toBeInTheDocument();

    renderWidget(model({ id: 'w2', kind: 'priceWatch', title: 'Second' }), ready, {
      menu: (card) => (
        <div>
          {card}
          <span>Menu here</span>
        </div>
      ),
      headerStart: <span>Handle here</span>,
      editControls: <div>Controls here</div>,
    });
    const region = screen.getByRole('region', { name: 'Second' });
    expect(screen.getByText('Menu here')).toBeInTheDocument();
    expect(within(region).getByText('Handle here')).toBeInTheDocument();
    expect(within(region).getByText('Controls here')).toBeInTheDocument();
  });

  it('draws nothing for a kind from a newer build', () => {
    renderWidget(model({ kind: 'fromTheFuture' }), () => undefined);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});

describe('WidgetGrid', () => {
  it('draws every widget the build knows, in layout order, and none it does not', () => {
    const store = createFeedStore();
    render(
      <MemoryRouter>
        <FeedStoreContext.Provider value={store}>
          <WidgetGrid
            widgets={[
              model({ id: 'a', kind: 'wallet', size: 'S' }),
              model({ id: 'b', kind: 'fromTheFuture' }),
              model({ id: 'c', kind: 'mail', size: 'F' }),
            ]}
            onRemove={() => undefined}
          />
        </FeedStoreContext.Provider>
      </MemoryRouter>
    );
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Wallet',
      'Mail',
    ]);
  });

  it('offers Add widget and Start from a role on an empty Overview', () => {
    const onAdd = vi.fn();
    render(
      <MemoryRouter>
        <WidgetGrid
          widgets={[]}
          onRemove={() => undefined}
          onAdd={onAdd}
          onRoles={() => undefined}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Your Overview is empty')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Add widget' }).click();
    expect(onAdd).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start from a role' })).toBeInTheDocument();
  });

  it('says so when none of the stored widgets can be drawn', () => {
    render(
      <MemoryRouter>
        <WidgetGrid widgets={[model({ kind: 'fromTheFuture' })]} onRemove={() => undefined} />
      </MemoryRouter>
    );
    expect(screen.getByText('There are no widgets to show on this Overview.')).toBeInTheDocument();
  });
});

describe('Widget preview', () => {
  it('draws a previewView without starting a live read', () => {
    const spy = vi.mocked(widgetView.useWidgetView);
    spy.mockClear();
    const sample = sampleView('mail', i18n.t.bind(i18n));
    expect(sample).toBeDefined();
    renderWidget(model(), () => undefined, { previewView: sample });
    expect(screen.getByRole('region', { name: 'Mail' })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('reads live when no previewView is given', () => {
    const spy = vi.mocked(widgetView.useWidgetView);
    spy.mockClear();
    renderWidget(model(), (store) =>
      store.set('mail', { data: null, error: false, loading: true })
    );
    expect(spy).toHaveBeenCalled();
  });
});
