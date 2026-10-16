import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { DataGate } from './DataGate';

function setOnline(value: boolean | null) {
  if (value === null) Reflect.deleteProperty(navigator, 'onLine');
  else Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

describe('DataGate', () => {
  it('shows a spinner while busy and the children once ok', () => {
    const { rerender } = render(
      <DataGate status="busy" title="Nothing">
        <p>Loaded</p>
      </DataGate>
    );
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('Loaded')).toBeNull();
    rerender(
      <DataGate status="ok" title="Nothing">
        <p>Loaded</p>
      </DataGate>
    );
    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });

  it('names what is missing and retries on request, announcing the failure', async () => {
    const onRetry = vi.fn();
    render(<DataGate status="failed" title="Blueprint data couldn't load" onRetry={onRetry} />);
    expect(screen.getByText("Blueprint data couldn't load")).toBeInTheDocument();
    // Announced too, through the always-mounted live region.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent("Blueprint data couldn't load")
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps focus in the region when Retry unmounts into the busy state, then on the result', async () => {
    function Harness() {
      const [status, setStatus] = useState<'busy' | 'failed' | 'ok'>('failed');
      return (
        <DataGate status={status} title="Oops" onRetry={() => setStatus('busy')}>
          <button onClick={() => setStatus('failed')}>Done</button>
        </DataGate>
      );
    }
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(container.firstElementChild).toHaveFocus();
  });

  it('says to connect once when offline, and only to try again when online', () => {
    setOnline(false);
    const { unmount } = render(<DataGate status="failed" title="Oops" />);
    expect(screen.getByText(/Connect once/)).toBeInTheDocument();
    unmount();
    setOnline(true);
    render(<DataGate status="failed" title="Oops" />);
    expect(screen.queryByText(/Connect once/)).toBeNull();
    setOnline(null);
  });

  it('shows no Retry button when there is nothing to retry', () => {
    render(<DataGate status="failed" title="Nothing" hint="Custom hint" />);
    expect(screen.getByText('Custom hint')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
