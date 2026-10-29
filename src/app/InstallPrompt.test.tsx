import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { stubViewport } from '@/test/viewport';
import { InstallPrompt } from './InstallPrompt';
import { useInstallApp } from './installApp';
import {
  useInstallPromptSeen,
  useInstallPromptPageVisits,
  INSTALL_PROMPT_SEEN_KEY,
  INSTALL_PROMPT_PAGE_VISITS_KEY,
  INSTALL_PROMPT_MIN_PAGE_VISITS,
} from './installPromptRules';

const desktopChromeUA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
const androidChromeUA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';
const androidFirefoxUA = 'Mozilla/5.0 (Android 13; Mobile; rv:119.0) Gecko/119.0 Firefox/119.0';
const iosSafariUA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
}

function dispatchBeforeInstallPrompt(
  overrides: Partial<{
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }> = {}
) {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = overrides.prompt ?? vi.fn().mockResolvedValue(undefined);
  event.userChoice = overrides.userChoice ?? Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(event);
  return event;
}

const router = { navigate: (() => {}) as NavigateFunction };
function NavigateHandle() {
  const navigate = useNavigate();
  useEffect(() => {
    router.navigate = navigate;
  }, [navigate]);
  return null;
}

function renderPrompt() {
  return render(
    <MemoryRouter initialEntries={['/characters']}>
      <NavigateHandle />
      <InstallPrompt />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await db.settings.clear();
  // Most cases are about what shows once the visit gate is met.
  await db.settings.put({
    key: INSTALL_PROMPT_PAGE_VISITS_KEY,
    value: INSTALL_PROMPT_MIN_PAGE_VISITS,
  });
  useInstallPromptSeen.setState({ value: false, hydrated: false });
  useInstallPromptPageVisits.setState({ value: 0, hydrated: false });
  useInstallApp.setState({ deferredPrompt: null });
  setUserAgent(desktopChromeUA);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InstallPrompt', () => {
  it('renders nothing when neither beforeinstallprompt fired nor on iOS', async () => {
    renderPrompt();
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays hidden on desktop even when beforeinstallprompt fires', async () => {
    renderPrompt();
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    dispatchBeforeInstallPrompt();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows nothing on Android Chrome until beforeinstallprompt fires', async () => {
    setUserAgent(androidChromeUA);
    renderPrompt();
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows menu instructions on Firefox for Android', async () => {
    setUserAgent(androidFirefoxUA);
    renderPrompt();
    expect(await screen.findByRole('alert')).toHaveTextContent(/add app to home screen/i);
  });

  it('shows the native install CTA after beforeinstallprompt fires on Android', async () => {
    setUserAgent(androidChromeUA);
    renderPrompt();
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    dispatchBeforeInstallPrompt();
    expect(await screen.findByRole('alert')).toHaveTextContent(/install/i);
  });

  it('calls prompt() and records seen permanently on install click', async () => {
    const user = userEvent.setup();
    const promptFn = vi.fn().mockResolvedValue(undefined);
    setUserAgent(androidChromeUA);
    renderPrompt();
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    dispatchBeforeInstallPrompt({
      prompt: promptFn,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /install/i }));

    expect(promptFn).toHaveBeenCalled();
    await waitFor(async () => {
      expect((await db.settings.get(INSTALL_PROMPT_SEEN_KEY))?.value).toBe(true);
    });
  });

  it('shows the iOS instructional banner on iOS Safari', async () => {
    setUserAgent(iosSafariUA);
    renderPrompt();
    expect(await screen.findByRole('alert')).toHaveTextContent(/tap share.*add to home screen/i);
  });

  it('reserves scroll clearance while shown and releases it on dismiss', async () => {
    const user = userEvent.setup();
    const clearance = () =>
      document.documentElement.style.getPropertyValue('--onboarding-banner-clearance');
    setUserAgent(iosSafariUA);
    renderPrompt();
    await screen.findByRole('alert');
    expect(clearance()).not.toBe('');

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(clearance()).toBe('');
  });

  it('dismisses the iOS banner and records seen permanently', async () => {
    const user = userEvent.setup();
    setUserAgent(iosSafariUA);
    renderPrompt();
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.settings.get(INSTALL_PROMPT_SEEN_KEY))?.value).toBe(true);
    });
  });

  it('does not render when already seen', async () => {
    await db.settings.put({ key: INSTALL_PROMPT_SEEN_KEY, value: true });
    setUserAgent(iosSafariUA);
    renderPrompt();
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not render when already running standalone', async () => {
    stubViewport(() => true);
    setUserAgent(iosSafariUA);
    renderPrompt();
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('waits on iOS until the player has opened enough pages', async () => {
    await db.settings.put({ key: INSTALL_PROMPT_PAGE_VISITS_KEY, value: 0 });
    setUserAgent(iosSafariUA);
    renderPrompt();
    await waitFor(() => expect(useInstallPromptPageVisits.getState().hydrated).toBe(true));

    for (let visit = 1; visit < INSTALL_PROMPT_MIN_PAGE_VISITS; visit++) {
      act(() => void router.navigate(`/page-${visit}`));
      await waitFor(() => expect(useInstallPromptPageVisits.getState().value).toBe(visit));
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => void router.navigate('/page-last'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/add to home screen/i);
    await waitFor(async () => {
      expect((await db.settings.get(INSTALL_PROMPT_PAGE_VISITS_KEY))?.value).toBe(
        INSTALL_PROMPT_MIN_PAGE_VISITS
      );
    });
  });

  it('does not count a redirect as a visit', async () => {
    await db.settings.put({ key: INSTALL_PROMPT_PAGE_VISITS_KEY, value: 0 });
    renderPrompt();
    await waitFor(() => expect(useInstallPromptPageVisits.getState().hydrated).toBe(true));

    act(() => void router.navigate('/skills'));
    act(() => void router.navigate('/skills/trained', { replace: true }));

    await waitFor(() => expect(useInstallPromptPageVisits.getState().value).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useInstallPromptPageVisits.getState().value).toBe(1);
  });

  it('uses a native prompt that fired before it mounted', async () => {
    setUserAgent(androidChromeUA);
    dispatchBeforeInstallPrompt();
    renderPrompt();
    expect(await screen.findByRole('button', { name: /install/i })).toBeInTheDocument();
  });
});
