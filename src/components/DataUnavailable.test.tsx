import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { DataUnavailable } from './DataUnavailable';

describe('DataUnavailable', () => {
  it('names what is missing, says to connect once, and retries on request', async () => {
    const onRetry = vi.fn();
    render(<DataUnavailable title="Blueprint data couldn't load" onRetry={onRetry} />);
    expect(screen.getByText("Blueprint data couldn't load")).toBeInTheDocument();
    expect(screen.getByText(/Connect once/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no Retry button when there is nothing to retry', () => {
    render(<DataUnavailable title="Nothing" hint="Custom hint" />);
    expect(screen.getByText('Custom hint')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
