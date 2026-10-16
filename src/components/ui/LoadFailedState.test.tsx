import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { LoadFailedState } from './LoadFailedState';

afterEach(() => vi.restoreAllMocks());

describe('LoadFailedState', () => {
  it('says offline when the browser is offline, and offers Retry', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const onRetry = vi.fn();
    render(<LoadFailedState onRetry={onRetry} hint="Not saved here yet." />);
    expect(screen.getByText("Couldn't load — you're offline")).toBeInTheDocument();
    expect(screen.getByText('Not saved here yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('uses the generic wording online, and an explicit offline flag wins', () => {
    const { rerender } = render(<LoadFailedState />);
    expect(screen.getByText("Couldn't load — try again")).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<LoadFailedState offline />);
    expect(screen.getByText("Couldn't load — you're offline")).toBeInTheDocument();
  });

  it('takes a caller-supplied headline', () => {
    render(<LoadFailedState title="Couldn't reach the contract index" />);
    expect(screen.getByText("Couldn't reach the contract index")).toBeInTheDocument();
  });
});
