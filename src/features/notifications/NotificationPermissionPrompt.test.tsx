import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
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

const navigateRef: { current: NavigateFunction | null } = { current: null };

function CaptureNavigate() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  return null;
}

/** Renders past the deferral (issue #1788) by navigating to a second route first. */
function renderPastFirstScreen() {
  const utils = render(
    <MemoryRouter initialEntries={['/characters']}>
      <CaptureNavigate />
      <NotificationPermissionPrompt />
    </MemoryRouter>
  );
  navigateRef.current?.('/plans');
  return utils;
}

beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  sessionStorage.clear();
  navigateRef.current = null;
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
  // issue #1788: eligibility must wait for a second route, so it never
  // competes with the very first screen a new player sees.
  it('stays away on the very first screen, even once fully eligible otherwise', async () => {
    stubNotification('default', 'granted');
    render(
      <MemoryRouter initialEntries={['/characters']}>
        <NotificationPermissionPrompt />
      </MemoryRouter>
    );
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  it('appears once the player has navigated to a second route', async () => {
    stubNotification('default', 'granted');
    renderPastFirstScreen();
    expect(await screen.findByText(/turn on notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/skill training, mail, industry jobs/i)).toBeInTheDocument();
  });

  it('requests the real browser permission only once Enable is tapped', async () => {
    const requestPermission = stubNotification('default', 'granted');
    const user = userEvent.setup();
    renderPastFirstScreen();

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
    renderPastFirstScreen();

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
    const { unmount } = renderPastFirstScreen();

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
    renderPastFirstScreen();
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  it('stays away before any character has ever logged in', async () => {
    await db.characters.clear();
    stubNotification('default', 'granted');
    renderPastFirstScreen();
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  it('stays away when the browser has already answered', async () => {
    stubNotification('denied', 'denied');
    renderPastFirstScreen();
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  it('stays away in a browser with no Notification API', async () => {
    renderPastFirstScreen();
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });
});
