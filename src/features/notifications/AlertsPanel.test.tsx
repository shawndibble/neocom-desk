/**
 * The global alerts panel: what the bell opens. The paths worth guarding are
 * the ones that decide what leaves the list: Mark all read sparing danger,
 * Acknowledge standing in for Dismiss on a danger type, Snooze existing only
 * for price alerts, and the chips actually narrowing the rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { IDLE_SYNC_STATUS } from '@/sync/statusFixtures';
import { AlertsPanel } from './AlertsPanel';
import { DEFAULT_NOTIFICATION_PREFERENCES, useNotificationPreferences } from './preferences';
import { useSnoozeStore } from './snooze';

vi.mock('@/sync', () => ({
  getSyncStatus: () => IDLE_SYNC_STATUS,
  setSyncedSetting: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));

function entry(
  id: string,
  eventId: string,
  extra: { eveType?: string; title?: string; firedAt?: number } = {}
) {
  const title = extra.title ?? id;
  return {
    id,
    characterId: 91,
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
  return <output data-testid="path">{useLocation().pathname}</output>;
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

beforeEach(async () => {
  await db.notificationFeed.clear();
  await db.settings.clear();
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: true });
  useSnoozeStore.setState({ value: {}, hydrated: true });
});

describe('AlertsPanel', () => {
  it('lists one row per type with its title, detail and age, and counts them in the heading', async () => {
    await db.notificationFeed.bulkPut([ATTACK, MAIL, { ...MAIL, id: 'mail-2' }]);
    renderPanel();

    expect(await screen.findByText('Alerts, 3 new')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const mailRow = screen.getByText('New mail').closest('li') as HTMLElement;
    expect(within(mailRow).getByText('New Mail body')).toBeInTheDocument();
    expect(within(mailRow).getByText('2 alerts')).toBeInTheDocument();
    expect(within(mailRow).getByText('5m ago')).toBeInTheDocument();
  });

  it('shows the empty state when nothing waits', async () => {
    renderPanel();
    expect(await screen.findByText('You are all caught up')).toBeInTheDocument();
    expect(screen.getByText('Alerts, all read')).toBeInTheDocument();
  });

  it('offers Acknowledge, not Dismiss, on a danger type and dismisses its entries', async () => {
    await db.notificationFeed.bulkPut([ATTACK, MAIL]);
    renderPanel();

    const row = (await screen.findByText('Structure Under Attack')).closest('li') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /^Dismiss/ })).not.toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: /^Acknowledge/ }));

    await waitFor(async () => expect(await liveIds()).toEqual(['mail']));
  });

  it('dismisses a non-danger type with Dismiss', async () => {
    await db.notificationFeed.bulkPut([ATTACK, MAIL]);
    renderPanel();

    const row = (await screen.findByText('New mail')).closest('li') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /^Dismiss/ }));
    await waitFor(async () => expect(await liveIds()).toEqual(['attack']));
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
      within((await screen.findByText('New mail')).closest('li') as HTMLElement).getByRole(
        'button',
        {
          name: /^Dismiss/,
        }
      )
    );
    await waitFor(() => expect(screen.queryByText('New mail')).not.toBeInTheDocument());
    expect(screen.getByText('Structure Under Attack')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mail' })).not.toBeInTheDocument();
  });

  it('offers Snooze 1h on price alerts only, and a snoozed type leaves the list', async () => {
    await db.notificationFeed.bulkPut([MAIL, PRICE]);
    renderPanel();

    const mailRow = (await screen.findByText('New mail')).closest('li') as HTMLElement;
    expect(within(mailRow).queryByRole('button', { name: /Snooze/ })).not.toBeInTheDocument();

    const priceRow = screen.getByText('Quickbar price alert').closest('li') as HTMLElement;
    await userEvent.click(within(priceRow).getByRole('button', { name: /Snooze/ }));

    await waitFor(() => expect(screen.queryByText('Quickbar price alert')).not.toBeInTheDocument());
    expect(useSnoozeStore.getState().value['event:priceAlertTriggered']).toBeGreaterThan(
      Date.now()
    );
    // Snoozing hides it; it does not dismiss it.
    expect(await liveIds()).toEqual(['mail', 'price']);
  });

  it('View goes to the alert page and closes the panel', async () => {
    await db.notificationFeed.bulkPut([MAIL]);
    const { onClose } = renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /^View/ }));
    expect(screen.getByTestId('path')).toHaveTextContent('/mail');
    expect(onClose).toHaveBeenCalled();
  });

  it('View leaves the alert in place by default, and dismisses it with Dismiss on View on', async () => {
    await db.notificationFeed.bulkPut([MAIL]);
    const first = renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /^View/ }));
    expect(first.onClose).toHaveBeenCalled();
    expect(await liveIds()).toEqual(['mail']);

    useNotificationPreferences.setState({
      value: { ...DEFAULT_NOTIFICATION_PREFERENCES, dismissOnView: true },
      hydrated: true,
    });
    await userEvent.click(await screen.findByRole('button', { name: /^View/ }));
    await waitFor(async () => expect(await liveIds()).toEqual([]));
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

  it('as a sheet it leaves Close to the sheet and uses 44px buttons', async () => {
    await db.notificationFeed.bulkPut([MAIL]);
    renderPanel('sheet');

    await screen.findByText('New mail');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^View/ })).toHaveClass('h-11');
  });

  describe('a group of several fires', () => {
    const cal = (n: number) =>
      entry(`cal-${n}`, 'newCalendarEvent', {
        title: `Event ${n}`,
        firedAt: Date.now() - n * 60_000,
      });

    it('opens to list every fire, each with its own body', async () => {
      await db.notificationFeed.bulkPut([cal(1), cal(2), cal(3)]);
      renderPanel();

      const toggle = await screen.findByRole('button', { name: '3 alerts' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Event 2 body')).not.toBeInTheDocument();

      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getAllByText(/^Event \d body$/)).toHaveLength(4); // newest also heads the group
    });

    it('labels the group dismiss with the count and dismisses them all', async () => {
      await db.notificationFeed.bulkPut([cal(1), cal(2)]);
      renderPanel();

      await userEvent.click(await screen.findByRole('button', { name: /^Dismiss all 2 / }));
      await waitFor(async () => expect(await liveIds()).toEqual([]));
    });

    it('dismisses a single fire and leaves the rest', async () => {
      await db.notificationFeed.bulkPut([cal(1), cal(2), cal(3)]);
      renderPanel();

      await userEvent.click(await screen.findByRole('button', { name: '3 alerts' }));
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

        await userEvent.click(await screen.findByRole('button', { name: '3 alerts' }));
        const fireRow = screen.getByText('Event 2 body').closest('li') as HTMLElement;
        await userEvent.click(within(fireRow).getByRole('link', { name: 'Event 2 body' }));

        expect(onClose).toHaveBeenCalled();
        await waitFor(async () => expect(await liveIds()).toEqual(remaining));
      }
    );

    it('lists fires newest first and closes the list when one is left', async () => {
      await db.notificationFeed.bulkPut([cal(3), cal(1), cal(2)]);
      renderPanel();

      await userEvent.click(await screen.findByRole('button', { name: '3 alerts' }));
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
      expect(screen.queryByRole('button', { name: /alerts$/ })).not.toBeInTheDocument();
    });

    it('lists ten fires and reveals the rest on request', async () => {
      await db.notificationFeed.bulkPut(Array.from({ length: 13 }, (_, i) => cal(i + 1)));
      renderPanel();

      await userEvent.click(await screen.findByRole('button', { name: '13 alerts' }));
      expect(screen.getAllByRole('button', { name: /^Dismiss: / })).toHaveLength(10);
      await userEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
      expect(screen.getAllByRole('button', { name: /^Dismiss: / })).toHaveLength(13);
      expect(screen.queryByRole('button', { name: /^Show \d+ more/ })).not.toBeInTheDocument();
    });
  });
});
