import { useMemo, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { createFeedStore } from './data/feedStore';
import { FeedStoreContext } from './data/feedStoreContext';
import { CustomizeBar } from './CustomizeBar';
import { useOverviewEdit } from './editContext';
import { Gallery } from './Gallery';
import { MAX_WIDGETS, type OverviewLayout, type Widget } from './layout';
import { OverviewEditProvider } from './OverviewEditProvider';
import { PhoneCustomizeList } from './PhoneCustomizeList';
import { RoleChooser } from './RoleChooser';
import { WidgetGrid } from './WidgetGrid';

const w = (id: string, kind: string, extra: Partial<Widget> = {}): Widget => ({
  id,
  kind,
  size: 'S',
  view: 'number',
  scope: 'header',
  showOnPhone: true,
  ...extra,
});

const START: OverviewLayout = {
  version: 1,
  widgets: [w('a', 'wallet'), w('b', 'training'), w('c', 'mail')],
};

const ids = (layout: OverviewLayout) => layout.widgets.map((x) => x.id);

function Shell({ phone = false }: { phone?: boolean }) {
  const edit = useOverviewEdit();
  const [gallery, setGallery] = useState(false);
  return (
    <>
      <button type="button" onClick={edit.startEditing}>
        Start customizing
      </button>
      {edit.editing && <CustomizeBar onAdd={() => setGallery(true)} onRoles={() => undefined} />}
      {phone ? (
        <PhoneCustomizeList />
      ) : (
        <WidgetGrid
          widgets={edit.layout.widgets}
          editing={edit.editing}
          onRemove={edit.remove}
          onAdd={() => setGallery(true)}
        />
      )}
      <Gallery open={gallery} onClose={() => setGallery(false)} />
    </>
  );
}

function Host({
  initial = START,
  phone = false,
  onSeen,
}: {
  initial?: OverviewLayout;
  phone?: boolean;
  onSeen?: (layout: OverviewLayout) => void;
}) {
  const [layout, setLayout] = useState(initial);
  const store = useMemo(() => createFeedStore(), []);
  return (
    <MemoryRouter>
      <FeedStoreContext.Provider value={store}>
        <OverviewEditProvider
          layout={layout}
          onLayoutChange={(next) => {
            setLayout(next);
            onSeen?.(next);
          }}
        >
          <Shell phone={phone} />
        </OverviewEditProvider>
      </FeedStoreContext.Provider>
    </MemoryRouter>
  );
}

function setup(props: Parameters<typeof Host>[0] = {}) {
  const seen = { current: props.initial ?? START };
  const user = userEvent.setup();
  render(
    <Host
      {...props}
      onSeen={(next) => {
        seen.current = next;
      }}
    />
  );
  return { user, seen };
}

const order = () =>
  screen
    .getAllByRole('region')
    .map((r) => r.getAttribute('aria-label'))
    .filter((name) => ['Wallet', 'Training', 'Mail'].includes(name ?? ''));

describe('Customize', () => {
  it('shows the edit bar with the widget count, and Done keeps the changes', async () => {
    const { user, seen } = setup();
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    const bar = screen.getByRole('region', { name: 'Customize the Overview' });
    expect(within(bar).getByText('Customizing')).toBeInTheDocument();
    expect(within(bar).getByText(`3 of ${MAX_WIDGETS} widgets`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Move Mail earlier' }));
    expect(ids(seen.current)).toEqual(['a', 'c', 'b']);
    await user.click(within(bar).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Customize the Overview' })).toBeNull();
    expect(ids(seen.current)).toEqual(['a', 'c', 'b']);
  });

  it('Cancel puts back exactly the layout Customize began with', async () => {
    const { user, seen } = setup();
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    await user.click(screen.getByRole('button', { name: 'Move Mail earlier' }));
    await user.click(screen.getByRole('button', { name: 'Remove Wallet' }));
    const sizeGroup = screen.getByRole('group', { name: 'Size of Mail' });
    await user.click(within(sizeGroup).getByRole('button', { name: 'Full' }));
    expect(seen.current).not.toEqual(START);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(seen.current).toEqual(START);
    // Cancel also drops the toast: its Undo would now point behind the snapshot.
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('resizing raises an Undo toast that puts the size back', async () => {
    const { user, seen } = setup();
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    const sizeGroup = screen.getByRole('group', { name: 'Size of Wallet' });
    await user.click(within(sizeGroup).getByRole('button', { name: 'L' }));
    expect(seen.current.widgets[0].size).toBe('L');
    expect(screen.getAllByText('Widget resized').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(seen.current.widgets[0].size).toBe('S');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('removing hands focus to the next widget instead of dropping it', async () => {
    const { user, seen } = setup();
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    await user.click(screen.getByRole('button', { name: 'Remove Training' }));
    expect(ids(seen.current)).toEqual(['a', 'c']);
    expect(screen.getByRole('button', { name: 'Settings for Mail' })).toHaveFocus();
  });

  it('disables Move earlier on the first widget and Move later on the last', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    expect(screen.getByRole('button', { name: 'Move Wallet earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Mail later' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Wallet later' })).toBeEnabled();
  });

  it('gives each widget a drag handle while customizing', async () => {
    const { user } = setup();
    expect(screen.queryByRole('button', { name: 'Move Wallet' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    expect(screen.getByRole('button', { name: 'Move Wallet' })).toBeInTheDocument();
  });

  it('asks before Reset; Keep leaves the layout, Reset replaces it and can be undone', async () => {
    const { user, seen } = setup();
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('Reset the layout?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(seen.current).toEqual(START);
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(seen.current.widgets.length).toBeGreaterThan(3);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(seen.current).toEqual(START);
  });

  it('puts focus on Add widget after a confirmed Reset', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('button', { name: 'Add widget' })).toHaveFocus();
  });

  it('Done drops the Undo toast raised inside Customize', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    await user.click(screen.getByRole('button', { name: 'Remove Wallet' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('Done keeps an Undo toast raised from the settings menu outside Customize', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Settings for Training' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove from Overview' }));
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('reorders and removes on a phone with its own list', async () => {
    const { user, seen } = setup({ phone: true });
    await user.click(screen.getByRole('button', { name: 'Start customizing' }));
    expect(screen.getByText(/set on a larger screen/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move Wallet down' }));
    expect(ids(seen.current)).toEqual(['b', 'a', 'c']);
    await user.click(screen.getByRole('button', { name: 'Remove Mail' }));
    expect(ids(seen.current)).toEqual(['b', 'a']);
  });
});

describe('Widget menu', () => {
  it('switches the view among only the views the kind has', async () => {
    const { user, seen } = setup();
    await user.click(screen.getByRole('button', { name: 'Settings for Wallet' }));
    expect(screen.getByRole('menuitemradio', { name: 'Chart' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitemradio', { name: 'Table' }));
    expect(seen.current.widgets[0].view).toBe('table');

    // Mail has no Chart view.
    await user.click(screen.getByRole('button', { name: 'Settings for Mail' }));
    expect(screen.queryByRole('menuitemradio', { name: 'Chart' })).toBeNull();
    await user.keyboard('{Escape}');
  });

  it('offers Range only to kinds with a time window', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Settings for Wallet' }));
    expect(screen.getByRole('menuitemradio', { name: '90d' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Settings for Mail' }));
    expect(screen.queryByRole('menuitemradio', { name: '90d' })).toBeNull();
  });

  it('offers Where to Skyhook raids, and the jumps radius only under Near me', async () => {
    const raids: OverviewLayout = { version: 1, widgets: [w('r', 'sovRaids', { view: 'table' })] };
    const { user, seen } = setup({ initial: raids });
    await user.click(screen.getByRole('button', { name: 'Settings for Skyhook raids' }));
    expect(screen.getByRole('menuitemradio', { name: 'My alliance' })).toBeChecked();
    expect(screen.queryByRole('menuitemradio', { name: '15 jumps' })).toBeNull();
    await user.click(screen.getByRole('menuitemradio', { name: 'Near me' }));
    expect(seen.current.widgets[0].raidsWhere).toBe('near');

    await user.click(screen.getByRole('button', { name: 'Settings for Skyhook raids' }));
    expect(screen.getByRole('menuitemradio', { name: '8 jumps' })).toBeChecked();
    await user.click(screen.getByRole('menuitemradio', { name: '15 jumps' }));
    expect(seen.current.widgets[0].raidsRadius).toBe(15);
  });

  it('gives a kind with no Where setting no Where group', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Settings for Mail' }));
    expect(screen.queryByRole('menuitemradio', { name: 'Near me' })).toBeNull();
  });

  it('disables All characters for a kind that reads the header Character only, with the reason', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Settings for Mail' }));
    expect(screen.getByRole('menuitemradio', { name: 'All' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByText('This widget shows the header Character only.')).toBeInTheDocument();
  });

  it('duplicates, moves to the bottom and toggles Show on phone', async () => {
    const { user, seen } = setup();
    await user.click(screen.getByRole('button', { name: 'Settings for Wallet' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(seen.current.widgets).toHaveLength(4);
    expect(seen.current.widgets[1].kind).toBe('wallet');
    expect(screen.getAllByText('Widget duplicated').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Settings for Training' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move to bottom' }));
    expect(seen.current.widgets.at(-1)?.id).toBe('b');

    await user.click(screen.getByRole('button', { name: 'Settings for Mail' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Show on phone' }));
    expect(seen.current.widgets.find((x) => x.id === 'c')?.showOnPhone).toBe(false);
  });

  it('disables Duplicate at the 30 widget limit', async () => {
    const full: OverviewLayout = {
      version: 1,
      widgets: Array.from({ length: MAX_WIDGETS }, (_, i) => w(`x${i}`, 'mail')),
    };
    const { user } = setup({ initial: full });
    await user.click(screen.getAllByRole('button', { name: 'Settings for Mail' })[0]);
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('renames through a dialog and clears the name when emptied', async () => {
    const { user, seen } = setup();
    await user.click(screen.getByRole('button', { name: 'Settings for Wallet' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = await screen.findByRole('textbox', { name: 'Name' });
    await user.type(field, 'Main purse');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(seen.current.widgets[0].title).toBe('Main purse');
    expect(screen.getByRole('region', { name: 'Main purse' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings for Main purse' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const again = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(again);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(seen.current.widgets[0].title).toBeUndefined();
  });

  it('removes from the Overview with an Undo', async () => {
    const { user, seen } = setup();
    await user.click(screen.getByRole('button', { name: 'Settings for Training' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove from Overview' }));
    expect(ids(seen.current)).toEqual(['a', 'c']);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(seen.current).toEqual(START);
    expect(order()).toEqual(['Wallet', 'Training', 'Mail']);
  });
});

describe('RoleChooser', () => {
  it('builds the layout from the chosen roles, with the base four always in', async () => {
    const user = userEvent.setup();
    let built: OverviewLayout | null = null;
    render(<RoleChooser firstRun onChoose={(l) => (built = l)} />);
    expect(screen.getByRole('heading', { name: 'What do you do in EVE?' })).toBeInTheDocument();
    expect(
      screen.getByText('Always included: Wallet, Training, Coming up and Mail.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Planetary industry' }));
    await user.click(screen.getByRole('button', { name: 'Build my Overview' }));
    const kinds = (built as OverviewLayout | null)?.widgets.map((x) => x.kind);
    expect(kinds).toEqual(['wallet', 'training', 'comingUp', 'mail', 'planetary']);
  });

  it('Just the basics is the base four', async () => {
    const user = userEvent.setup();
    let built: OverviewLayout | null = null;
    render(<RoleChooser firstRun onChoose={(l) => (built = l)} />);
    await user.click(screen.getByRole('button', { name: 'Just the basics' }));
    expect((built as OverviewLayout | null)?.widgets.map((x) => x.kind)).toEqual([
      'wallet',
      'training',
      'comingUp',
      'mail',
    ]);
  });

  it('offers Cancel instead of Just the basics when reached from Customize', async () => {
    const user = userEvent.setup();
    let cancelled = false;
    render(
      <RoleChooser
        firstRun={false}
        onChoose={() => undefined}
        onCancel={() => (cancelled = true)}
      />
    );
    expect(screen.queryByRole('button', { name: 'Just the basics' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancelled).toBe(true);
  });
});
