import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { SyncErrorNote } from './SyncErrorNote';

describe('SyncErrorNote', () => {
  it('renders visible "Sync error — changes saved locally" text in the error state', () => {
    render(
      <SyncErrorNote status={{ state: 'error', lastSyncedAt: null, error: 'boom' }} online={true} />
    );
    expect(screen.getByText('Sync error — changes saved locally')).toBeInTheDocument();
  });

  it('keeps one empty live region mounted and fills that same node on error', async () => {
    const idle = { state: 'idle', lastSyncedAt: null, error: null } as const;
    const failed = { state: 'error', lastSyncedAt: null, error: 'boom' } as const;
    const { rerender } = render(<SyncErrorNote status={idle} online={true} />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    rerender(<SyncErrorNote status={failed} online={true} />);
    expect(screen.getByRole('status')).toBe(region);
    await waitFor(() => expect(region).toHaveTextContent('Sync error — changes saved locally'));
  });

  it('puts no role on the visible text, so it is not read twice', () => {
    render(
      <SyncErrorNote status={{ state: 'error', lastSyncedAt: null, error: 'boom' }} online={true} />
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(
      screen.getByText('Sync error — changes saved locally', { selector: 'p' })
    ).not.toHaveAttribute('role');
  });

  it('renders nothing when idle', () => {
    render(
      <SyncErrorNote status={{ state: 'idle', lastSyncedAt: null, error: null }} online={true} />
    );
    expect(screen.queryByText(/sync error/i)).not.toBeInTheDocument();
  });

  it('renders nothing when offline (offline is a distinct, non-error state)', () => {
    render(
      <SyncErrorNote
        status={{ state: 'error', lastSyncedAt: null, error: 'boom' }}
        online={false}
      />
    );
    expect(screen.queryByText(/sync error/i)).not.toBeInTheDocument();
  });
});
