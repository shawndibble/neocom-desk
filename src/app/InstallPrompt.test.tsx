import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { InstallPrompt } from './InstallPrompt';
import { useInstallPromptSeen, INSTALL_PROMPT_SEEN_KEY } from './installPromptRules';

const desktopChromeUA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
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

beforeEach(async () => {
  await db.settings.clear();
  useInstallPromptSeen.setState({ value: false, hydrated: false });
  setUserAgent(desktopChromeUA);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InstallPrompt', () => {
  it('renders nothing when neither beforeinstallprompt fired nor on iOS', async () => {
    render(<InstallPrompt />);
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the native install CTA after beforeinstallprompt fires', async () => {
    render(<InstallPrompt />);
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    dispatchBeforeInstallPrompt();
    expect(await screen.findByRole('alert')).toHaveTextContent(/install/i);
  });

  it('calls prompt() and records seen permanently on install click', async () => {
    const user = userEvent.setup();
    const promptFn = vi.fn().mockResolvedValue(undefined);
    render(<InstallPrompt />);
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
    render(<InstallPrompt />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/add to home screen/i);
  });

  it('dismisses the iOS banner and records seen permanently', async () => {
    const user = userEvent.setup();
    setUserAgent(iosSafariUA);
    render(<InstallPrompt />);
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
    render(<InstallPrompt />);
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not render when already running standalone', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          media: query,
          matches: true,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList
    );
    setUserAgent(iosSafariUA);
    render(<InstallPrompt />);
    await waitFor(() => expect(useInstallPromptSeen.getState().hydrated).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
