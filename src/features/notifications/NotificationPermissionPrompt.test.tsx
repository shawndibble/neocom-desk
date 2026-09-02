import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { NotificationPermissionPrompt } from './NotificationPermissionPrompt';
import {
  NOTIFICATION_PERMISSION_PROMPT_KEY,
  DEFAULT_NOTIFICATION_PROMPT_STATE,
  useNotificationPromptState,
} from './permission';

const CHAR_ID = 44;

function stubNotification(permission: NotificationPermission, answer: NotificationPermission) {
  const requestPermission = vi.fn(async () => answer);
  vi.stubGlobal('Notification', { permission, requestPermission });
  return requestPermission;
}

beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  useNotificationPromptState.setState({
    value: DEFAULT_NOTIFICATION_PROMPT_STATE,
    hydrated: false,
  });
  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NotificationPermissionPrompt', () => {
  it('offers the explainer once a character is logged in on a fresh device', async () => {
    stubNotification('default', 'granted');
    render(<NotificationPermissionPrompt />);
    expect(await screen.findByText(/turn on notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/skill training, mail, industry jobs/i)).toBeInTheDocument();
  });

  it('requests the real browser permission only once Enable is tapped', async () => {
    const requestPermission = stubNotification('default', 'granted');
    const user = userEvent.setup();
    render(<NotificationPermissionPrompt />);

    await screen.findByText(/turn on notifications/i);
    expect(requestPermission).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^enable$/i }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(async () => {
      expect(await db.settings.get(NOTIFICATION_PERMISSION_PROMPT_KEY)).toEqual({
        key: NOTIFICATION_PERMISSION_PROMPT_KEY,
        value: { seen: true, outcome: 'granted' },
      });
    });
  });

  it('persists a denial too, so the explainer never returns', async () => {
    stubNotification('default', 'denied');
    const user = userEvent.setup();
    render(<NotificationPermissionPrompt />);

    await screen.findByText(/turn on notifications/i);
    await user.click(screen.getByRole('button', { name: /^enable$/i }));
    await waitFor(async () => {
      expect((await db.settings.get(NOTIFICATION_PERMISSION_PROMPT_KEY))?.value).toEqual({
        seen: true,
        outcome: 'denied',
      });
    });
  });

  it('dismissing suppresses it permanently without asking the browser anything', async () => {
    const requestPermission = stubNotification('default', 'granted');
    const user = userEvent.setup();
    const { unmount } = render(<NotificationPermissionPrompt />);

    await screen.findByText(/turn on notifications/i);
    await user.click(screen.getByRole('button', { name: /not now/i }));
    expect(requestPermission).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument()
    );

    unmount();
    useNotificationPromptState.setState({
      value: DEFAULT_NOTIFICATION_PROMPT_STATE,
      hydrated: false,
    });
    render(<NotificationPermissionPrompt />);
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  it('stays away before any character has ever logged in', async () => {
    await db.characters.clear();
    stubNotification('default', 'granted');
    render(<NotificationPermissionPrompt />);
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  it('stays away when the browser has already answered', async () => {
    stubNotification('denied', 'denied');
    render(<NotificationPermissionPrompt />);
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  it('stays away in a browser with no Notification API', async () => {
    render(<NotificationPermissionPrompt />);
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });
});
