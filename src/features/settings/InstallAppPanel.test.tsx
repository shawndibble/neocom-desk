import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { useInstallApp } from '@/app/installApp';
import { InstallAppPanel } from './InstallAppPanel';

const iosSafariUA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const androidUA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';
const desktopUA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
}

beforeEach(() => {
  useInstallApp.setState({ deferredPrompt: null });
  setUserAgent(desktopUA);
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
});

describe('InstallAppPanel', () => {
  it('shows iOS Safari steps with no button', () => {
    setUserAgent(iosSafariUA);
    render(<InstallAppPanel />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('renders nothing on desktop', () => {
    const { container } = render(<InstallAppPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to a browser-menu pointer when no prompt was captured', () => {
    setUserAgent(androidUA);
    render(<InstallAppPanel />);
    expect(screen.getByText(/browser's menu/)).toBeInTheDocument();
  });

  it('offers the captured native prompt', async () => {
    setUserAgent(androidUA);
    const prompt = vi.fn().mockResolvedValue(undefined);
    useInstallApp.setState({
      deferredPrompt: {
        prompt,
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      } as never,
    });
    render(<InstallAppPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(useInstallApp.getState().deferredPrompt).toBeNull();
  });

  it('says so when already installed', () => {
    setUserAgent(androidUA);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    render(<InstallAppPanel />);
    expect(screen.getByText(/is installed on this device/)).toBeInTheDocument();
  });
});
