import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { createFeedStore, type FeedStore } from './data/feedStore';
import { FeedStoreContext } from './data/feedStoreContext';
import { OverviewRefreshContext } from './data/refreshContext';
import { WidgetGrid } from './WidgetGrid';
import { Widget } from './Widget';
import type { Widget as WidgetModel } from './layout';

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
          <Widget
            widget={widget}
            showNew={false}
            headerAll={false}
            onRemove={onRemove}
            {...props}
          />
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
    expect(within(region).getByRole('link', { name: 'Open Mail page' })).toHaveAttribute(
      'href',
      '/mail'
    );
  });

  it('keeps the headline above the rows in List view and counts what the size hides', () => {
    renderWidget(model({ view: 'list', size: 'S' }), (store) =>
      store.set('mail', { data: mailData(9, 5), error: false, loading: false })
    );
    const region = screen.getByRole('region', { name: 'Mail' });
    expect(within(region).getByText('9')).toBeInTheDocument();
    // A Small shows three rows and says how many more there are.
    expect(within(region).getAllByText(/^Subject \d$/)).toHaveLength(3);
    expect(within(region).getByText('+2 more')).toBeInTheDocument();
  });

  it('draws a Chart view as the Number until charts land', () => {
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

  it('draws a kind the next stage fills as empty, never a spinner', () => {
    renderWidget(model({ kind: 'netWorth' }), () => undefined);
    const region = screen.getByRole('region', { name: 'Net worth' });
    expect(region).toHaveAttribute('aria-busy', 'false');
    expect(within(region).getByText('No net worth has been recorded yet.')).toBeInTheDocument();
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

  it('shows an All characters chip when the widget itself reads everyone', () => {
    renderWidget(model({ kind: 'priceWatch', scope: 'all' }), ready);
    expect(screen.getByText('All characters')).toBeInTheDocument();
  });

  it('uses the widget own name when it has one', () => {
    renderWidget(model({ kind: 'priceWatch', title: 'My targets' }), ready);
    expect(screen.getByRole('region', { name: 'My targets' })).toBeInTheDocument();
  });

  it('has a settings button that is inert until the next stage gives it a handler', async () => {
    const user = userEvent.setup();
    renderWidget(model({ kind: 'priceWatch' }), ready);
    expect(screen.getByRole('button', { name: 'Settings for Price watch' })).toBeDisabled();

    const onOpenSettings = vi.fn();
    renderWidget(model({ id: 'w2', kind: 'priceWatch', title: 'Second' }), ready, {
      onOpenSettings,
    });
    await user.click(screen.getByRole('button', { name: 'Settings for Second' }));
    expect(onOpenSettings).toHaveBeenCalledWith('w2');
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
            headerAll={false}
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

  it('says so when there is nothing to draw', () => {
    render(
      <MemoryRouter>
        <WidgetGrid widgets={[]} showNew={false} headerAll={false} onRemove={() => undefined} />
      </MemoryRouter>
    );
    expect(screen.getByText('There are no widgets to show on this Overview.')).toBeInTheDocument();
  });
});
