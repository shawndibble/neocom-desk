import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { NotificationFeedPanel } from './NotificationFeedPanel';
import {
  useNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFS_SETTING_KEY,
} from './preferences';
import { recordFeedEntry } from './feed';

beforeEach(async () => {
  await db.notificationFeed.clear();
  await db.settings.clear();
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: false });
});

async function seed(title: string, body: string, firedAt: number) {
  await recordFeedEntry({ characterId: 1, eventId: 'newMail', title, body, firedAt });
}

describe('NotificationFeedPanel', () => {
  it('lists fired notifications newest first', async () => {
    await seed('Older', 'first body', 1000);
    await seed('Newer', 'second body', 2000);

    render(<NotificationFeedPanel />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Newer');
    expect(items[1]).toHaveTextContent('Older');
  });

  it('shows an empty state with nothing fired', async () => {
    render(<NotificationFeedPanel />);
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss all' })).not.toBeInTheDocument();
  });

  it('dismisses one notification at a time, leaving the rest', async () => {
    await seed('Keep me', 'a', 1000);
    await seed('Dismiss me', 'b', 2000);
    render(<NotificationFeedPanel />);
    await screen.findByText('Dismiss me');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Dismiss me' }));

    await waitFor(() => expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument());
    expect(screen.getByText('Keep me')).toBeInTheDocument();
    expect(await db.notificationFeed.count()).toBe(1);
  });

  it('dismisses every notification in bulk', async () => {
    await seed('One', 'a', 1000);
    await seed('Two', 'b', 2000);
    render(<NotificationFeedPanel />);
    await screen.findByText('Two');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss all' }));

    await waitFor(() => expect(screen.getByText('No notifications yet')).toBeInTheDocument());
    expect(await db.notificationFeed.count()).toBe(0);
  });

  it('renders nothing when the feed channel is switched off', async () => {
    await db.settings.put({
      key: NOTIFICATION_PREFS_SETTING_KEY,
      value: { masterEnabled: true, feedEnabled: false, perCharacter: {} },
    });
    await seed('Hidden', 'a', 1000);

    const { container } = render(<NotificationFeedPanel />);

    await waitFor(() => expect(useNotificationPreferences.getState().hydrated).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the master switch is off', async () => {
    await db.settings.put({
      key: NOTIFICATION_PREFS_SETTING_KEY,
      value: { masterEnabled: false, perCharacter: {} },
    });
    await seed('Hidden', 'a', 1000);

    const { container } = render(<NotificationFeedPanel />);

    await waitFor(() => expect(useNotificationPreferences.getState().hydrated).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });
});
