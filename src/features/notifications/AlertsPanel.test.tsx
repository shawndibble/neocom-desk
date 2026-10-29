/**
 * The global alerts panel: what the bell opens. The paths worth guarding are
 * the ones that decide what leaves the list: Mark all read sparing danger,
 * Acknowledge standing in for Dismiss on a danger type, Snooze existing only
 * for price alerts, the chips actually narrowing the rows, a dismiss waiting on
 * its Undo toast before it writes, and Stop these alerts reaching every
 * Character on the account.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { db } from '@/db';
import { IDLE_SYNC_STATUS } from '@/sync/statusFixtures';
import { AlertsPanel } from './AlertsPanel';
import { characterEventPrefs, characterEveTypePrefs } from './preferencesStore';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isEventEnabledFor,
  isEveTypeEnabledFor,
  useNotificationPreferences,
} from './preferences';
import { useSnoozeStore } from './snooze';

vi.mock('@/sync', () => ({
  getSyncStatus: () => IDLE_SYNC_STATUS,
  setSyncedSetting: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));
vi.mock('./projectionRebuildScheduler', () => ({ scheduleProjectionRebuild: vi.fn() }));

function entry(
  id: string,
  eventId: string,
  extra: { eveType?: string; title?: string; firedAt?: number; characterId?: number } = {}
) {
  const title = extra.title ?? id;
  return {
    id,
    characterId: extra.characterId ?? 91,
    eventId,
    title,
    body: `${title} body`,
    firedAt: extra.firedAt ?? Date.now() - 5 * 60_000,
    eveType: extra.eveType,
  };
}

const ATTACK = entry('attack', 'eveNotification', {
  eveType: 'StructureUnderAttack',
  title: 'Structure Under Attack',
});
const MAIL = entry('mail', 'newMail', { title: 'New Mail' });
const PRICE = entry('price', 'priceAlertTriggered', { title: 'Price Alert' });

function LocationProbe() {
  const { pathname, search } = useLocation();
  return (
    <>
      <output data-testid="path">{pathname}</output>
      <output data-testid="search">{search}</output>
    </>
  );
}

function renderPanel(variant: 'popover' | 'sheet' = 'popover') {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/overview']}>
      <AlertsPanel variant={variant} onClose={onClose} />
      <LocationProbe />
    </MemoryRouter>
  );
  return { onClose };
}

const liveIds = async () =>
  (await db.notificationFeed.toArray())
    .filter((row) => row.dismissedAt === undefined)
    .map((row) => row.id)
    .sort();

/** A dismiss waits on its Undo toast (8s); the page hiding commits what is pending at once. */
const endUndoWindow = () => act(() => void window.dispatchEvent(new Event('pagehide')));

const rowOf = async (name: string) =>
  (await screen.findByText(name)).closest('li[data-group-key]') as HTMLElement;

async function openMenu(row: HTMLElement) {
  await userEvent.click(within(row).getByRole('button', { name: /^More actions for / }));
  return screen.findByRole('menu');
}

beforeEach(async () => {
  await db.notificationFeed.clear();
  await db.characters.clear();
  await db.settings.clear();
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: true });
  useSnoozeStore.setState({ value: {}, hydrated: true });
});

describe('AlertsPanel', () => {
  it('lists one row per type with its topic, title, detail and age, and counts them in the heading', async () => {
    await db.notificationFeed.bulkPut([ATTACK, MAIL, { ...MAIL, id: 'mail-2' }]);
    renderPanel();

    expect(await screen.findByText('Alerts, 3 new')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const mailRow = await rowOf('New mail');
    expect(within(mailRow).getByText('New Mail body')).toBeInTheDocument();
    expect(within(mailRow).getByText('2 alerts')).toBeInTheDocument();
    expect(within(mailRow).getByText('5m ago')).toBeInTheDocument();
    // The eyebrow names the topic; a type with no chip files under "Alerts".
    expect(mailRow).toHaveTextContent(/Mail · 5m ago/);
    expect(await rowOf('Structure Under Attack')).toHaveTextContent(/Structures · 5m ago/);
  });

  it('shows the empty state when nothing waits', async () => {
    renderPanel();
    expect(await screen.findByText('You are all caught up')).toBeInTheDocument();
    expect(screen.getByText('Alerts, all read')).toBeInTheDocument();
  });

  it('gives a danger row a worded Acknowledge and no ×, no ⋮, and dismisses it at once', async () => {
    await db.notificationFeed.bulkPut([ATTACK, MAIL]);
    renderPanel();

    const row = await rowOf('Structure Under Attack');
    expect(within(row).queryByRole('button', { name: /^Dismiss/ })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^More actions/ })).not.toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: /^Acknowledge/ }));

    await waitFor(async () => expect(await liveIds()).toEqual(['mail']));
  });

  describe('dismissing with the ×', () => {
    it('hides the row and raises an Undo toast, and writes only when the toast ends', async () => {
      await db.notificationFeed.bulkPut([ATTACK, MAIL]);
      renderPanel();

      await userEvent.click(
        within(await rowOf('New mail')).getByRole('button', { name: 'Dismiss New mail' })
      );

      expect(await screen.findAllByText('New mail dismissed')).not.toHaveLength(0);
      expect(await screen.findByText('Alerts, 1 new')).toBeInTheDocument();
      expect(await liveIds()).toEqual(['attack', 'mail']);

      await endUndoWindow();
      await waitFor(async () => expect(await liveIds()).toEqual(['attack']));
    });

    it('Undo brings the row back and the entries are never dismissed', async () => {
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      renderPanel();

      await userEvent.click(
        within(await rowOf('New mail')).getByRole('button', { name: 'Dismiss New mail' })
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

      expect(await screen.findByText('Alerts, 2 new')).toBeInTheDocument();
      await endUndoWindow();
      expect(await liveIds()).toEqual(['mail', 'price']);
    });

    it('names the scope of a group of many in its label and its toast', async () => {
      await db.notificationFeed.bulkPut([
        entry('cal-1', 'newCalendarEvent'),
        entry('cal-2', 'newCalendarEvent'),
      ]);
      renderPanel();

      await userEvent.click(await screen.findByRole('button', { name: /^Dismiss all 2 / }));
      expect(await screen.findAllByText(/dismissed · 2 alerts$/)).not.toHaveLength(0);
      await endUndoWindow();
      await waitFor(async () => expect(await liveIds()).toEqual([]));
    });

    it('moves focus to the next row’s ×, the previous one if it was last, else the heading', async () => {
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      renderPanel();

      // Worst first: New mail (watch) sits above the price alert (clear).
      await userEvent.click(
        within(await rowOf('New mail')).getByRole('button', { name: 'Dismiss New mail' })
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Dismiss Quickbar price alert' })).toHaveFocus()
      );

      await userEvent.click(screen.getByRole('button', { name: 'Dismiss Quickbar price alert' }));
      await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveFocus());
    });

    it('does not close the popover when Undo, which sits outside it, is pressed', async () => {
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      const onOpenChange = vi.fn();
      render(
        <MemoryRouter initialEntries={['/overview']}>
          <Popover open onOpenChange={onOpenChange}>
            <PopoverTrigger>bell</PopoverTrigger>
            <PopoverContent>
              <AlertsPanel variant="popover" onClose={vi.fn()} />
            </PopoverContent>
          </Popover>
        </MemoryRouter>
      );

      await userEvent.click(
        within(await rowOf('New mail')).getByRole('button', { name: 'Dismiss New mail' })
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(await screen.findByText('New mail')).toBeInTheDocument();
      await endUndoWindow();
      expect(await liveIds()).toEqual(['mail', 'price']);
    });
  });

  it('Mark all read dismisses everything except danger', async () => {
    await db.notificationFeed.bulkPut([ATTACK, MAIL, PRICE]);
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    await waitFor(async () => expect(await liveIds()).toEqual(['attack']));
    expect(await screen.findByText('Structure Under Attack')).toBeInTheDocument();
  });

  it('filters the rows by chip', async () => {
    await db.notificationFeed.bulkPut([ATTACK, MAIL, PRICE]);
    renderPanel();
    await screen.findByText('New mail');

    await userEvent.click(screen.getByRole('button', { name: 'Mail' }));
    expect(screen.getByRole('button', { name: 'Mail' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('Structure Under Attack')).not.toBeInTheDocument();

    // A chip with no alerts behind it is not offered.
    expect(screen.queryByRole('button', { name: 'Industry' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Danger' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Structure Under Attack')).toBeInTheDocument();
  });

  it('shows no chips when there is nothing to filter, and drops a chip once its alerts are gone', async () => {
    await db.notificationFeed.bulkPut([MAIL]);
    renderPanel();
    await screen.findByText('New mail');
    expect(screen.queryByRole('group', { name: 'Alert types' })).not.toBeInTheDocument();

    await db.notificationFeed.bulkPut([ATTACK]);
    await userEvent.click(await screen.findByRole('button', { name: 'Mail' }));
    await userEvent.click(
      within(await rowOf('New mail')).getByRole('button', { name: 'Dismiss New mail' })
    );
    await waitFor(() => expect(screen.queryByText('New mail')).not.toBeInTheDocument());
    expect(screen.getByText('Structure Under Attack')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mail' })).not.toBeInTheDocument();
  });

  describe('the row click', () => {
    it('on a single fire goes to the alert page and closes the panel', async () => {
      await db.notificationFeed.bulkPut([MAIL]);
      const { onClose } = renderPanel();

      await userEvent.click(await screen.findByRole('button', { name: 'View New mail' }));
      expect(screen.getByTestId('path')).toHaveTextContent('/mail');
      expect(onClose).toHaveBeenCalled();
    });

    it('leaves the alert in place by default, and dismisses it with Dismiss on View on', async () => {
      await db.notificationFeed.bulkPut([MAIL]);
      const first = renderPanel();
      await userEvent.click(await screen.findByRole('button', { name: 'View New mail' }));
      expect(first.onClose).toHaveBeenCalled();
      expect(await liveIds()).toEqual(['mail']);

      useNotificationPreferences.setState({
        value: { ...DEFAULT_NOTIFICATION_PREFERENCES, dismissOnView: true },
        hydrated: true,
      });
      await userEvent.click(await screen.findByRole('button', { name: 'View New mail' }));
      await waitFor(async () => expect(await liveIds()).toEqual([]));
    });
  });

  describe('the ⋮ menu', () => {
    it('holds Stop these alerts and the settings, and Snooze only on a price alert', async () => {
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      renderPanel();

      const mailMenu = await openMenu(await rowOf('New mail'));
      expect(within(mailMenu).getByRole('menuitem', { name: 'Stop these alerts' })).toBeVisible();
      expect(
        within(mailMenu).getByRole('menuitem', { name: 'Notification settings' })
      ).toBeVisible();
      expect(within(mailMenu).queryByRole('menuitem', { name: /Snooze/ })).not.toBeInTheDocument();
      // Dismiss is the row's ×, never a second place.
      expect(within(mailMenu).queryByRole('menuitem', { name: /Dismiss/ })).not.toBeInTheDocument();
      await userEvent.keyboard('{Escape}');

      const priceMenu = await openMenu(await rowOf('Quickbar price alert'));
      expect(within(priceMenu).getByRole('menuitem', { name: 'Snooze 1h' })).toBeVisible();
    });

    it('opens from a right-click on the row too', async () => {
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      renderPanel();

      fireEvent.contextMenu(within(await rowOf('New mail')).getByRole('button', { name: /^View/ }));
      expect(await screen.findByRole('menuitem', { name: 'Stop these alerts' })).toBeVisible();
    });

    it('rests dim with a pointer and full on touch, while the × is never dimmed', async () => {
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      renderPanel();

      const row = await rowOf('New mail');
      const more = within(row).getByRole('button', { name: /^More actions/ });
      expect(more).toHaveClass('opacity-60', 'group-hover:opacity-100', 'touch:opacity-100');
      expect(within(row).getByRole('button', { name: 'Dismiss New mail' }).className).not.toMatch(
        /(^|\s)opacity-/
      );
    });

    it('Snooze hides the type without dismissing it', async () => {
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      renderPanel();

      await userEvent.click(
        within(await openMenu(await rowOf('Quickbar price alert'))).getByRole('menuitem', {
          name: 'Snooze 1h',
        })
      );

      await waitFor(() =>
        expect(screen.queryByText('Quickbar price alert')).not.toBeInTheDocument()
      );
      expect(useSnoozeStore.getState().value['event:priceAlertTriggered']).toBeGreaterThan(
        Date.now()
      );
      expect(await liveIds()).toEqual(['mail', 'price']);
    });

    it('Notification settings opens Settings narrowed to the type’s label and closes the panel', async () => {
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      const { onClose } = renderPanel();

      await userEvent.click(
        within(await openMenu(await rowOf('New mail'))).getByRole('menuitem', {
          name: 'Notification settings',
        })
      );

      expect(screen.getByTestId('path')).toHaveTextContent('/settings/notifications');
      expect(screen.getByTestId('search')).toHaveTextContent('?search=New%20mail');
      expect(onClose).toHaveBeenCalled();
    });

    it('searches an EVE notification by its label, not its type id', async () => {
      await db.notificationFeed.bulkPut([
        entry('fuel', 'eveNotification', { eveType: 'StructureFuelAlert' }),
        PRICE,
      ]);
      renderPanel();

      await userEvent.click(
        within(await openMenu(await rowOf('Structure Low on Fuel'))).getByRole('menuitem', {
          name: 'Notification settings',
        })
      );
      expect(decodeURIComponent(screen.getByTestId('search').textContent ?? '')).toBe(
        '?search=Structure Low on Fuel'
      );
    });
  });

  describe('Stop these alerts', () => {
    const OTHER = 92;
    const THIRD = 93;
    const character = (characterId: number) => ({
      characterId,
      name: `Pilot ${characterId}`,
      ownerHash: `hash-${characterId}`,
      addedAt: 1,
    });
    const stopFor = async (name: string) =>
      userEvent.click(
        within(await openMenu(await rowOf(name))).getByRole('menuitem', {
          name: 'Stop these alerts',
        })
      );
    const prefs = () => useNotificationPreferences.getState().value;

    it('turns the type off on both channels for every Character on the account, after the Undo window', async () => {
      await db.characters.bulkPut([character(91), character(OTHER), character(THIRD)]);
      // Only 91 has fired; the others must be muted too.
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      renderPanel();

      await stopFor('New mail');
      expect(await screen.findAllByText('New mail alerts off for all characters')).not.toHaveLength(
        0
      );
      // Held back: nothing is muted or dismissed until the toast ends.
      expect(isEventEnabledFor(characterEventPrefs(prefs(), OTHER), 'newMail', 'feed')).toBe(true);
      expect(await liveIds()).toEqual(['mail', 'price']);

      await endUndoWindow();
      await waitFor(async () => expect(await liveIds()).toEqual(['price']));
      for (const id of [91, OTHER, THIRD]) {
        for (const channel of ['feed', 'browser'] as const) {
          expect(isEventEnabledFor(characterEventPrefs(prefs(), id), 'newMail', channel)).toBe(
            false
          );
        }
        // A sibling type is untouched.
        expect(
          isEventEnabledFor(characterEventPrefs(prefs(), id), 'priceAlertTriggered', 'feed')
        ).toBe(true);
      }
    });

    it('mutes an EVE notification type through its own preference map, and a Character that fired but left the roster', async () => {
      await db.characters.bulkPut([character(91)]);
      await db.notificationFeed.bulkPut([
        entry('fuel', 'eveNotification', { eveType: 'StructureFuelAlert', characterId: 777 }),
        MAIL,
      ]);
      renderPanel();

      await stopFor('Structure Low on Fuel');
      await endUndoWindow();

      await waitFor(async () => expect(await liveIds()).toEqual(['mail']));
      for (const id of [91, 777]) {
        expect(
          isEveTypeEnabledFor(characterEveTypePrefs(prefs(), id), 'StructureFuelAlert', 'feed')
        ).toBe(false);
      }
    });

    it('Undo leaves the type on and the alerts listed', async () => {
      await db.characters.bulkPut([character(91), character(OTHER)]);
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      renderPanel();

      await stopFor('New mail');
      await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
      await endUndoWindow();

      expect(await liveIds()).toEqual(['mail', 'price']);
      expect(isEventEnabledFor(characterEventPrefs(prefs(), 91), 'newMail', 'feed')).toBe(true);
      expect(await screen.findByText('New mail')).toBeInTheDocument();
    });

    it('does not say "all characters" on a one-Character device', async () => {
      await db.characters.bulkPut([character(91)]);
      await db.notificationFeed.bulkPut([MAIL, PRICE]);
      renderPanel();

      await stopFor('New mail');
      expect(await screen.findAllByText('New mail alerts off')).not.toHaveLength(0);
    });
  });

  it('Close closes the popover, and the footer points at the notification settings', async () => {
    const { onClose } = renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();

    expect(screen.queryByRole('link', { name: /Older alerts/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Manage Notification Settings' })).toHaveAttribute(
      'href',
      '/settings/notifications'
    );
    expect(screen.getByText('Push on this device: Off')).toBeInTheDocument();
    expect(screen.queryByText(/appear as a banner/)).toBeNull();
  });

  it('as a sheet it leaves Close to the sheet', async () => {
    await db.notificationFeed.bulkPut([MAIL]);
    renderPanel('sheet');

    await screen.findByText('New mail');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  describe('a group of several fires', () => {
    const cal = (n: number) =>
      entry(`cal-${n}`, 'newCalendarEvent', {
        title: `Event ${n}`,
        firedAt: Date.now() - n * 60_000,
      });
    const expander = (count: number) =>
      screen.findByRole('button', { name: new RegExp(`, ${count} alerts$`) });

    it('opens on the row click to list every fire, each with its own body', async () => {
      await db.notificationFeed.bulkPut([cal(1), cal(2), cal(3)]);
      renderPanel();

      const row = await expander(3);
      expect(row).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Event 2 body')).not.toBeInTheDocument();

      await userEvent.click(row);
      expect(row).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getAllByText(/^Event \d body$/)).toHaveLength(4); // newest also heads the group
      expect(screen.getByTestId('path')).toHaveTextContent('/overview');

      await userEvent.click(row);
      expect(row).toHaveAttribute('aria-expanded', 'false');
    });

    it('dismisses a single fire at once and leaves the rest', async () => {
      await db.notificationFeed.bulkPut([cal(1), cal(2), cal(3)]);
      renderPanel();

      await userEvent.click(await expander(3));
      await userEvent.click(screen.getByRole('button', { name: 'Dismiss: Event 2 body' }));
      await waitFor(async () => expect(await liveIds()).toEqual(['cal-1', 'cal-3']));
      expect(await screen.findByText('Alerts, 2 new')).toBeInTheDocument();
    });

    it.each([
      [false, ['cal-1', 'cal-2', 'cal-3']],
      [true, ['cal-1', 'cal-3']],
    ])(
      'following one fire link with Dismiss on View %s dismisses only that fire',
      async (dismissOnView, remaining) => {
        await db.notificationFeed.bulkPut([cal(1), cal(2), cal(3)]);
        useNotificationPreferences.setState({
          value: { ...DEFAULT_NOTIFICATION_PREFERENCES, dismissOnView },
          hydrated: true,
        });
        const { onClose } = renderPanel();

        await userEvent.click(await expander(3));
        const fireRow = screen.getByText('Event 2 body').closest('li') as HTMLElement;
        await userEvent.click(within(fireRow).getByRole('link', { name: 'Event 2 body' }));

        expect(onClose).toHaveBeenCalled();
        await waitFor(async () => expect(await liveIds()).toEqual(remaining));
      }
    );

    it('lists fires newest first and closes the list when one is left', async () => {
      await db.notificationFeed.bulkPut([cal(3), cal(1), cal(2)]);
      renderPanel();

      await userEvent.click(await expander(3));
      const fireBodies = screen
        .getAllByRole('button', { name: /^Dismiss: / })
        .map((b) => b.getAttribute('aria-label'));
      expect(fireBodies).toEqual([
        'Dismiss: Event 1 body',
        'Dismiss: Event 2 body',
        'Dismiss: Event 3 body',
      ]);

      await userEvent.click(screen.getByRole('button', { name: 'Dismiss: Event 3 body' }));
      await waitFor(() => expect(screen.queryByText('Event 3 body')).not.toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: 'Dismiss: Event 2 body' }));
      await waitFor(async () => expect(await liveIds()).toEqual(['cal-1']));
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /^Dismiss: / })).not.toBeInTheDocument()
      );
      expect(screen.queryByRole('button', { name: /, \d+ alerts$/ })).not.toBeInTheDocument();
    });

    it('lists ten fires and reveals the rest on request', async () => {
      await db.notificationFeed.bulkPut(Array.from({ length: 13 }, (_, i) => cal(i + 1)));
      renderPanel();

      await userEvent.click(await expander(13));
      expect(screen.getAllByRole('button', { name: /^Dismiss: / })).toHaveLength(10);
      await userEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
      expect(screen.getAllByRole('button', { name: /^Dismiss: / })).toHaveLength(13);
      expect(screen.queryByRole('button', { name: /^Show \d+ more/ })).not.toBeInTheDocument();
    });
  });
});
