import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { SyncErrorNote } from './SyncErrorNote';

describe('SyncErrorNote', () => {
  it('renders visible "Sync error — changes saved locally" text in the error state', () => {
    render(
      <SyncErrorNote status={{ state: 'error', lastSyncedAt: null, error: 'boom' }} online={true} />
    );
    expect(screen.getByText('Sync error — changes saved locally')).toBeInTheDocument();
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
