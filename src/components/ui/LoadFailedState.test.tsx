import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { LoadFailedState } from './LoadFailedState';

afterEach(() => vi.restoreAllMocks());

describe('LoadFailedState', () => {
  it('says to connect once when the browser is offline, and offers Retry', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const onRetry = vi.fn();
    render(<LoadFailedState onRetry={onRetry} />);
    expect(screen.getByText("Couldn't load")).toBeInTheDocument();
    expect(screen.getByText(/Connect once/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('only says to try again online, with no Retry unless asked', () => {
    render(<LoadFailedState />);
    expect(screen.getByText(/Try again\./)).toBeInTheDocument();
    expect(screen.queryByText(/Connect once/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('takes a caller-supplied headline and hint', () => {
    render(
      <LoadFailedState title="Couldn't reach the contract index" hint="Nothing cached yet." />
    );
    expect(screen.getByText("Couldn't reach the contract index")).toBeInTheDocument();
    expect(screen.getByText('Nothing cached yet.')).toBeInTheDocument();
  });
});
