import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { NotificationExplainer } from './NotificationExplainer';
import { ALERTS_OFFER_SEEN_KEY, useAlertsOfferSeen } from './permission';
import { beginAlertsLogin } from '@/app/loginFlow';

vi.mock('@/app/loginFlow', () => ({ beginAlertsLogin: vi.fn(async () => undefined) }));
import {
  NOTIFICATION_PERMISSION_PROMPT_KEY,
  DEFAULT_NOTIFICATION_PROMPT_STATE,
  useNotificationPromptState,
} from './permission';

const CHAR_ID = 44;

function stubNotification(permission: NotificationPermission, answer: NotificationPermission) {
  const stub = { permission, requestPermission: vi.fn() };
  // Like a real browser: the live permission changes once the ask resolves.
  stub.requestPermission.mockImplementation(async () => {
    stub.permission = answer;
    return answer;
  });
  vi.stubGlobal('Notification', stub);
  return stub.requestPermission;
}

function renderExplainer() {
  return render(<NotificationExplainer />);
}

beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  vi.mocked(beginAlertsLogin).mockClear();
  useAlertsOfferSeen.setState({ value: false, hydrated: false });
  useNotificationPromptState.setState({
    value: DEFAULT_NOTIFICATION_PROMPT_STATE,
    hydrated: false,
  });
  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'onLine');
});

function goOffline(): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

describe('NotificationExplainer', () => {
  it('shows the explainer with Enable and Not now side by side', async () => {
    stubNotification('default', 'granted');
    renderExplainer();
    expect(await screen.findByText(/turn on notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/skill training, mail, industry jobs/i)).toBeInTheDocument();
    const enable = screen.getByRole('button', { name: /^enable$/i });
    const notNow = screen.getByRole('button', { name: /not now/i });
    expect(enable.parentElement).toBe(notNow.parentElement);
  });

  it('requests the real browser permission only once Enable is tapped', async () => {
    const requestPermission = stubNotification('default', 'granted');
    const user = userEvent.setup();
    renderExplainer();

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

  it('does not guard the plain notification Enable while offline: it never leaves the app', async () => {
    const requestPermission = stubNotification('default', 'granted');
    const user = userEvent.setup();
    renderExplainer();

    const enable = await screen.findByRole('button', { name: /^enable$/i });
    goOffline();
    expect(enable).not.toHaveAttribute('aria-disabled');
    await user.click(enable);
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('persists a denial too, so the explainer never returns', async () => {
    stubNotification('default', 'denied');
    const user = userEvent.setup();
    renderExplainer();

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
    const { unmount } = renderExplainer();

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
    renderExplainer();
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  it('stays away before any character has ever logged in', async () => {
    await db.characters.clear();
    stubNotification('default', 'granted');
    renderExplainer();
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  it('stays away when the browser has already answered', async () => {
    stubNotification('denied', 'denied');
    renderExplainer();
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  it('stays away in a browser with no Notification API', async () => {
    renderExplainer();
    await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument();
  });

  describe('step two: Alerts offer (issue #3758)', () => {
    it('offers Alerts for the signed-in Character right after a grant, without asking SSO inside the permission step', async () => {
      stubNotification('default', 'granted');
      const user = userEvent.setup();
      renderExplainer();

      await user.click(await screen.findByRole('button', { name: /^enable$/i }));
      expect(await screen.findByText(/alerts when neocom is closed/i)).toBeInTheDocument();
      expect(screen.getByText(/Pilot One/)).toBeInTheDocument();
      expect(beginAlertsLogin).not.toHaveBeenCalled();
    });

    it('Turn on starts the Alerts flow for that Character and records the offer as seen', async () => {
      stubNotification('default', 'granted');
      const user = userEvent.setup();
      renderExplainer();

      await user.click(await screen.findByRole('button', { name: /^enable$/i }));
      await user.click(await screen.findByRole('button', { name: /^turn on$/i }));
      expect(beginAlertsLogin).toHaveBeenCalledWith(CHAR_ID);
      expect((await db.settings.get(ALERTS_OFFER_SEEN_KEY))?.value).toBe(true);
    });

    it('disables Turn on while offline, with the reason on hover, and starts nothing', async () => {
      stubNotification('default', 'granted');
      const user = userEvent.setup();
      renderExplainer();

      await user.click(await screen.findByRole('button', { name: /^enable$/i }));
      const turnOn = await screen.findByRole('button', { name: /^turn on$/i });
      goOffline();
      expect(turnOn).toHaveAttribute('aria-disabled', 'true');
      await user.click(turnOn);
      expect(beginAlertsLogin).not.toHaveBeenCalled();
      // The click above closed any bubble; re-enter for a fresh hover.
      await user.unhover(turnOn);
      await user.hover(turnOn);
      expect((await screen.findAllByText('Needs a connection')).length).toBeGreaterThan(0);
    });

    it('puts the offer back when the Alerts flow fails to start', async () => {
      vi.mocked(beginAlertsLogin).mockRejectedValueOnce(new Error('offline'));
      stubNotification('default', 'granted');
      const user = userEvent.setup();
      renderExplainer();

      await user.click(await screen.findByRole('button', { name: /^enable$/i }));
      await user.click(await screen.findByRole('button', { name: /^turn on$/i }));
      await waitFor(async () =>
        expect((await db.settings.get(ALERTS_OFFER_SEEN_KEY))?.value).toBe(false)
      );
      expect(await screen.findByText(/alerts when neocom is closed/i)).toBeInTheDocument();
    });

    it('Not now suppresses it for good without starting the flow', async () => {
      stubNotification('default', 'granted');
      const user = userEvent.setup();
      renderExplainer();

      await user.click(await screen.findByRole('button', { name: /^enable$/i }));
      await screen.findByText(/alerts when neocom is closed/i);
      await user.click(screen.getByRole('button', { name: /not now/i }));
      await waitFor(() =>
        expect(screen.queryByText(/alerts when neocom is closed/i)).not.toBeInTheDocument()
      );
      expect(beginAlertsLogin).not.toHaveBeenCalled();
      expect((await db.settings.get(ALERTS_OFFER_SEEN_KEY))?.value).toBe(true);
    });

    it('never shows after a denial', async () => {
      stubNotification('default', 'denied');
      const user = userEvent.setup();
      renderExplainer();

      await user.click(await screen.findByRole('button', { name: /^enable$/i }));
      await waitFor(() =>
        expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument()
      );
      expect(screen.queryByText(/alerts when neocom is closed/i)).not.toBeInTheDocument();
    });

    it('never shows for a player who already saw the explainer', async () => {
      stubNotification('granted', 'granted');
      await db.settings.put({
        key: NOTIFICATION_PERMISSION_PROMPT_KEY,
        value: { seen: true, outcome: 'granted' },
      });
      renderExplainer();
      await waitFor(() => expect(useNotificationPromptState.getState().hydrated).toBe(true));
      expect(screen.queryByText(/alerts when neocom is closed/i)).not.toBeInTheDocument();
    });
  });
});
