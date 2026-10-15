import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@/i18n';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('dexie is unhappy');
}

// React logs the caught error; silence it so a passing run stays readable.
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => {
  consoleError.mockClear();
  vi.unstubAllGlobals();
});

function stubOnline(online: boolean) {
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
  return reload;
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>content</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('shows a recoverable screen instead of unmounting the app', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('moves focus to the heading, so a failed click does not drop it to the page top', () => {
    render(
      <ErrorBoundary inline>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toHaveFocus();
  });

  it('never puts the error message on screen: it can carry response data', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/dexie is unhappy/i)).not.toBeInTheDocument();
  });

  it('inline, fails inside the shell rather than as a page of its own', () => {
    render(
      <main>
        <ErrorBoundary inline>
          <Boom />
        </ErrorBoundary>
      </main>
    );
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    // One landmark: the shell's own `<main>`, not a second one nested in it.
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('recovers when resetKey changes, so navigating away clears a failed page', () => {
    const { rerender } = render(
      <ErrorBoundary inline resetKey="/market">
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();

    rerender(
      <ErrorBoundary inline resetKey="/wallet">
        <p>wallet</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('wallet')).toBeInTheDocument();
  });

  describe('offline', () => {
    afterEach(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    it('says the page cannot load offline and will retry, instead of offering a futile reload hint', () => {
      stubOnline(false);
      render(
        <ErrorBoundary inline>
          <Boom />
        </ErrorBoundary>
      );
      expect(screen.getByText(/can't load while you're offline/i)).toBeInTheDocument();
      expect(screen.getByText(/try again when your connection returns/i)).toBeInTheDocument();
      expect(screen.queryByText(/reloading usually fixes this/i)).not.toBeInTheDocument();
    });

    it('reloads when the connection returns', () => {
      const reload = stubOnline(false);
      render(
        <ErrorBoundary inline>
          <Boom />
        </ErrorBoundary>
      );
      expect(reload).not.toHaveBeenCalled();
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(reload).toHaveBeenCalledOnce();
    });

    it('also retries when the error appeared online and the connection dropped and came back', () => {
      const reload = stubOnline(true);
      render(
        <ErrorBoundary inline>
          <Boom />
        </ErrorBoundary>
      );
      expect(screen.getByText(/reloading usually fixes this/i)).toBeInTheDocument();
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });
      expect(screen.getByText(/can't load while you're offline/i)).toBeInTheDocument();
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(reload).toHaveBeenCalledOnce();
    });

    it('does not reload on an online event when the screen was never offline', () => {
      const reload = stubOnline(true);
      render(
        <ErrorBoundary inline>
          <Boom />
        </ErrorBoundary>
      );
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(reload).not.toHaveBeenCalled();
    });
  });
});
