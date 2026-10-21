import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { createFeedStore } from './data/feedStore';
import { FeedStoreContext } from './data/feedStoreContext';
import { Gallery } from './Gallery';
import { boardKinds } from './kinds';

const OVERVIEW_KINDS = boardKinds('overview');
import { MAX_WIDGETS, type OverviewLayout, type Widget } from './layout';
import { OverviewEditProvider } from './OverviewEditProvider';

const phone = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/useIsPhone', () => ({ useIsPhone: () => phone.value }));

const w = (id: string, kind: string): Widget => ({
  id,
  kind,
  size: 'S',
  view: 'number',
  scope: 'header',
  showOnPhone: true,
});

const START: OverviewLayout = {
  version: 1,
  widgets: [w('a', 'wallet'), w('b', 'training'), w('c', 'mail')],
};

function Host({ initial }: { initial: OverviewLayout }) {
  const [layout, setLayout] = useState(initial);
  const [open, setOpen] = useState(false);
  const store = useMemo(() => createFeedStore(), []);
  return (
    <MemoryRouter>
      <FeedStoreContext.Provider value={store}>
        <OverviewEditProvider layout={layout} onLayoutChange={setLayout}>
          <button type="button" onClick={() => setOpen(true)}>
            Add widget
          </button>
          <Gallery open={open} onClose={() => setOpen(false)} />
        </OverviewEditProvider>
      </FeedStoreContext.Provider>
    </MemoryRouter>
  );
}

async function openGallery({
  initial = START,
  isPhone = false,
}: { initial?: OverviewLayout; isPhone?: boolean } = {}) {
  phone.value = isPhone;
  const user = userEvent.setup();
  render(<Host initial={initial} />);
  await user.click(screen.getByRole('button', { name: 'Add widget' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add a widget' });
  return { user, dialog };
}

const itemOf = (dialog: HTMLElement, title: string) =>
  within(dialog).getByText(title, { selector: 'div' }).closest('li') as HTMLElement;

const SUBTITLE = `${OVERVIEW_KINDS.length} widgets · 3 on your Overview`;

describe('Gallery', () => {
  it('says how many widgets there are and how many are on the Overview', async () => {
    const { dialog } = await openGallery();
    expect(within(dialog).getByText(SUBTITLE)).toBeInTheDocument();
  });

  it('groups items under quiet category headings while All is chosen', async () => {
    const { user, dialog } = await openGallery();
    const headings = within(dialog)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      'Character',
      'Money and market',
      'Industry and mining',
      'Planets and structures',
      'Space and travel',
      'Messages and schedule',
    ]);
    // A category on its own is one flat list: no headings.
    await user.click(within(dialog).getByRole('button', { name: /^Character/ }));
    expect(within(dialog).queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(within(dialog).getByText('Training')).toBeInTheDocument();
    expect(within(dialog).queryByText('Wallet')).toBeNull();
  });

  it('puts the categories in one row, with counts', async () => {
    const { dialog } = await openGallery();
    const row = within(dialog).getByRole('group', { name: 'Categories' });
    expect(within(row).getAllByRole('button')).toHaveLength(7);
    expect(within(row).getByRole('button', { name: /^All/ })).toHaveTextContent(
      String(OVERVIEW_KINDS.length)
    );
  });

  it('searches, says when nothing matches, and clears the search', async () => {
    const { user, dialog } = await openGallery();
    const search = within(dialog).getByRole('searchbox', { name: 'Search widgets' });
    await user.type(search, 'incursion');
    expect(within(dialog).getByRole('button', { name: 'Add Incursions' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Wallet')).toBeNull();

    await user.clear(search);
    await user.type(search, 'zzzz');
    expect(within(dialog).getByText('No widget matches "zzzz".')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Clear search' }));
    expect(search).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'Add Incursions' })).toBeInTheDocument();
  });

  it('shows the views a kind supports and its default size', async () => {
    const { dialog } = await openGallery();
    const facts = within(itemOf(dialog, 'Net worth')).getByRole('list', {
      name: 'Views and default size',
    });
    expect(
      within(facts)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Number', 'Chart', 'Table', 'Size M']);
  });

  it('adds a kind, confirms it, and offers Add another', async () => {
    const { user, dialog } = await openGallery();
    await user.click(within(dialog).getByRole('button', { name: 'Add Open orders' }));
    const item = itemOf(dialog, 'Open orders');
    expect(within(item).getByRole('status')).toHaveTextContent('Added');
    expect(
      within(item).getByRole('button', { name: 'Add another Open orders' })
    ).toBeInTheDocument();
    // The drawer stays open on a desktop.
    expect(screen.getByRole('dialog', { name: 'Add a widget' })).toBeInTheDocument();
  });

  it('says a kind is on the Overview, with Add another and no second primary', async () => {
    const { dialog } = await openGallery();
    const item = itemOf(dialog, 'Mail');
    expect(within(item).getByText('On your Overview ×1')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Add another Mail' })).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: 'Add Mail' })).toBeNull();
  });

  it('counts a kind added again once the confirmation fades', async () => {
    const { user, dialog } = await openGallery();
    await user.click(within(dialog).getByRole('button', { name: 'Add another Mail' }));
    const status = () => within(itemOf(dialog, 'Mail')).getByRole('status');
    expect(status()).toHaveTextContent('Added');
    await waitFor(() => expect(status()).toHaveTextContent('On your Overview ×2'), {
      timeout: 4000,
    });
  });

  it('says Limit reached at 30 widgets', async () => {
    const full: OverviewLayout = {
      version: 1,
      widgets: Array.from({ length: MAX_WIDGETS }, (_, i) => w(`x${i}`, 'mail')),
    };
    const { dialog } = await openGallery({ initial: full });
    expect(within(dialog).queryByRole('button', { name: /^Add/ })).toBeNull();
    expect(within(dialog).getAllByText('Limit reached').length).toBeGreaterThan(0);
  });

  it('has no New tags or Recently added filter: every widget is new', async () => {
    const { dialog } = await openGallery();
    expect(within(dialog).queryByRole('button', { name: /^Recently added/ })).toBeNull();
    expect(within(dialog).queryByText('New')).toBeNull();
  });

  it('previews the widget body, inert, without repeating its title', async () => {
    const { dialog } = await openGallery();
    const preview = within(itemOf(dialog, 'Wallet')).getByTestId('gallery-preview');
    expect(preview).toHaveAttribute('aria-hidden', 'true');
    expect(preview).toHaveAttribute('inert');
    expect(preview.querySelector('section')).not.toBeNull();
    expect(preview.querySelector('h2')).toBeNull();
    expect(preview.textContent).toContain('3.8');
  });

  it('moves focus to the search box on open, closes on Escape and gives focus back', async () => {
    const { user } = await openGallery();
    await waitFor(() =>
      expect(screen.getByRole('searchbox', { name: 'Search widgets' })).toHaveFocus()
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Add a widget' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add widget' })).toHaveFocus();
  });
});

describe('Gallery on a phone', () => {
  it('lists the same items without previews, and closes after Add', async () => {
    const { user, dialog } = await openGallery({ isPhone: true });
    expect(within(dialog).queryByTestId('gallery-preview')).toBeNull();
    expect(within(dialog).getByText('Open orders')).toBeInTheDocument();
    expect(within(dialog).getByText(SUBTITLE)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add Open orders' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a widget' })).toBeNull());
  });

  it('gives the actions a 44px target', async () => {
    const { dialog } = await openGallery({ isPhone: true });
    expect(within(dialog).getByRole('button', { name: 'Add Open orders' }).className).toContain(
      'min-h-11'
    );
  });
});
