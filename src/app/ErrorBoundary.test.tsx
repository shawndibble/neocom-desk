import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('dexie is unhappy');
}

// React logs the caught error; silence it so a passing run stays readable.
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => consoleError.mockClear());

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
});
