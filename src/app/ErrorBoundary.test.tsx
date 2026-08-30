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
});
