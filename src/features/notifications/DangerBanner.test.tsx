import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { IDLE_SYNC_STATUS } from '@/sync/statusFixtures';
import { DangerBanner } from './DangerBanner';
import { DEFAULT_NOTIFICATION_PREFERENCES, useNotificationPreferences } from './preferences';
import { useSnoozeStore } from './snooze';

vi.mock('@/sync', () => ({
  getSyncStatus: () => IDLE_SYNC_STATUS,
  setSyncedSetting: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));

function attack(id: string, firedAt: number, title = 'Structure Under Attack') {
  return {
    id,
    characterId: 91,
    eventId: 'eveNotification',
    eveType: 'StructureUnderAttack',
    title,
    body: `${title} at Tama`,
    firedAt,
  };
}

function LocationProbe() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderBanner() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <h1>Pilot</h1>
      <DangerBanner />
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await db.notificationFeed.clear();
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: true });
  useSnoozeStore.setState({ value: {}, hydrated: true });
});

describe('DangerBanner', () => {
  it('renders nothing when no danger alert waits', async () => {
    await db.notificationFeed.put({
      id: 'mail',
      characterId: 91,
      eventId: 'newMail',
      title: 'New Mail',
      body: 'x',
      firedAt: Date.now(),
    });
    const { container } = renderBanner();
    // Give the live query a turn to resolve before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the newest danger alert as an alert strip with its detail and age', async () => {
    const now = Date.now();
    await db.notificationFeed.bulkPut([
      attack('old', now - 3_600_000, 'Older Attack'),
      attack('new', now - 2 * 60_000),
    ]);
    renderBanner();

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Danger');
    expect(banner).toHaveTextContent('Structure Under Attack');
    expect(banner).toHaveTextContent('Structure Under Attack at Tama');
    expect(banner).toHaveTextContent(/[12]m ago/);
    expect(banner).not.toHaveTextContent('Older Attack');
  });

  it('View goes to the structures page', async () => {
    await db.notificationFeed.put(attack('a', Date.now()));
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: /^View/ }));
    expect(screen.getByTestId('path')).toHaveTextContent('/corp');
  });

  it('View also dismisses the alert when Dismiss on View is on', async () => {
    useNotificationPreferences.setState({
      value: { ...DEFAULT_NOTIFICATION_PREFERENCES, dismissOnView: true },
      hydrated: true,
    });
    await db.notificationFeed.put(attack('a', Date.now()));
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: /^View/ }));
    expect(screen.getByTestId('path')).toHaveTextContent('/corp');
    await waitFor(async () => {
      const live = (await db.notificationFeed.toArray()).filter(
        (row) => row.dismissedAt === undefined
      );
      expect(live).toEqual([]);
    });
  });

  it('Acknowledge dismisses the alert and the banner goes away', async () => {
    await db.notificationFeed.bulkPut([attack('a', Date.now()), attack('b', Date.now() - 1000)]);
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: /^Acknowledge/ }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    const live = (await db.notificationFeed.toArray()).filter(
      (row) => row.dismissedAt === undefined
    );
    expect(live).toEqual([]);
  });

  it('moves focus to the page heading when Acknowledge removes the strip', async () => {
    await db.notificationFeed.put(attack('focus-1', Date.now()));
    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: /^Acknowledge/ }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Pilot' })).toHaveFocus());
  });

  it('announces a danger entry once: a later mount renders it as a status', async () => {
    await db.notificationFeed.put(attack('once-1', Date.now()));
    const first = renderBanner();
    expect(await screen.findByRole('alert')).toHaveTextContent('Structure Under Attack');
    first.unmount();

    renderBanner();
    const strip = await screen.findByText('Danger').then((el) => el.parentElement!);
    expect(strip).toHaveAttribute('role', 'status');
    expect(strip).toHaveTextContent('Structure Under Attack');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
