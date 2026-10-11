import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
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
          <Widget widget={widget} showNew={false} onRemove={onRemove} {...props} />
        </OverviewRefreshContext.Provider>
      </FeedStoreContext.Provider>
    </MemoryRouter>
  );
  return { onRemove, refresh };
}

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
    expect(within(region).getAllByText(/^Subject \d$/)).toHaveLength(4);
    expect(within(region).getByText('+1 more')).toBeInTheDocument();
  });

  it('shows the name and the key value only at Small', () => {
    renderWidget(model({ view: 'table', size: 'S' }), (store) =>
      store.set('mail', { data: mailData(2, 2), error: false, loading: false })
    );
    expect(screen.queryByText('Sender 1')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mail' }).querySelectorAll('td')).toHaveLength(4);
  });

  it('shows the sender as a third column at Medium', () => {
    renderWidget(model({ view: 'table', size: 'M' }), (store) =>
      store.set('mail', { data: mailData(2, 2), error: false, loading: false })
    );
    expect(screen.getByText('Sender 1')).toBeInTheDocument();
  });

  it('draws a Chart view as the Number for a kind with no chart', () => {
    renderWidget(model({ view: 'chart' }), (store) =>
      store.set('mail', { data: mailData(4), error: false, loading: false })
    );
    expect(within(screen.getByRole('region', { name: 'Mail' })).getByText('4')).toBeInTheDocument();
  });

  it('asks for the permission, with a Grant access action, when the grant lapsed', () => {
    useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
    renderWidget(model(), (store) =>
      store.set('mail', {
        data: { ...mailData(0, 0), needsReauth: true },
        error: false,
        loading: false,
      })
    );
    const region = screen.getByRole('region', { name: 'Mail' });
    expect(within(region).getByText('Needs permission')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Grant access' })).toBeInTheDocument();
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

  it('draws a kind that is coming soon as empty, never a spinner', () => {
    renderWidget(model({ kind: 'survey' }), () => undefined);
    const region = screen.getByRole('region', { name: 'Mining survey' });
    expect(region).toHaveAttribute('aria-busy', 'false');
    expect(within(region).getByText('There is no survey yet.')).toBeInTheDocument();
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

  it('shows the New tag only for a new kind, and only to a returning pilot', () => {
    renderWidget(model({ kind: 'priceWatch' }), ready, { showNew: true });
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('shows no New tag for a first-run layout', () => {
    renderWidget(model({ kind: 'priceWatch' }), ready, { showNew: false });
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

  it('has no title link for a kind with no page of its own yet', () => {
    renderWidget(model({ kind: 'survey' }), () => undefined);
    expect(screen.queryByRole('link', { name: /mining survey/i })).not.toBeInTheDocument();
  });

  it('uses the widget own name when it has one', () => {
    renderWidget(model({ kind: 'priceWatch', title: 'My targets' }), ready);
    expect(screen.getByRole('region', { name: 'My targets' })).toBeInTheDocument();
  });

  it('draws the menu, header start and edit controls it is handed, and only those', () => {
    renderWidget(model({ kind: 'priceWatch' }), ready);
    expect(screen.queryByRole('button', { name: /settings for/i })).not.toBeInTheDocument();

    renderWidget(model({ id: 'w2', kind: 'priceWatch', title: 'Second' }), ready, {
      menu: <button type="button">Menu here</button>,
      headerStart: <span>Handle here</span>,
      editControls: <div>Controls here</div>,
    });
    const region = screen.getByRole('region', { name: 'Second' });
    expect(within(region).getByText('Menu here')).toBeInTheDocument();
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
            showNew={false}
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
          showNew={false}
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
        <WidgetGrid
          widgets={[model({ kind: 'fromTheFuture' })]}
          showNew={false}
          onRemove={() => undefined}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('There are no widgets to show on this Overview.')).toBeInTheDocument();
  });
});

describe('Widget preview', () => {
  it('draws a previewView without starting a live read', () => {
    const spy = vi.mocked(widgetView.useWidgetView);
    spy.mockClear();
    const sample = sampleView('mail');
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
