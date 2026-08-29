import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { SyncStatusDot } from './SyncStatusDot';

describe('SyncStatusDot', () => {
  it('shows an idle tooltip when synced and online', () => {
    render(<SyncStatusDot status={{ state: 'idle', lastSyncedAt: 1, error: null }} online />);
    expect(screen.getByRole('status', { name: 'Synced' })).toBeInTheDocument();
  });

  it('shows a syncing tooltip while syncing', () => {
    render(<SyncStatusDot status={{ state: 'syncing', lastSyncedAt: null, error: null }} online />);
    expect(screen.getByRole('status', { name: 'Syncing…' })).toBeInTheDocument();
  });

  it('shows an error tooltip on sync error', () => {
    render(<SyncStatusDot status={{ state: 'error', lastSyncedAt: null, error: 'boom' }} online />);
    expect(screen.getByRole('status', { name: 'Sync error' })).toBeInTheDocument();
  });

  it('shows an offline tooltip when the browser is offline, even mid-sync', () => {
    render(
      <SyncStatusDot
        status={{ state: 'syncing', lastSyncedAt: null, error: null }}
        online={false}
      />
    );
    expect(
      screen.getByRole('status', { name: 'Offline — will sync when reconnected' })
    ).toBeInTheDocument();
  });
});
