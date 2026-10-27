import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { SyncStatus } from '@/sync';
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

  it('draws a different glyph shape per state, so no state is told apart by colour alone', () => {
    const cases: [SyncStatus, boolean][] = [
      [{ state: 'idle', lastSyncedAt: 1, error: null }, true],
      [{ state: 'syncing', lastSyncedAt: null, error: null }, true],
      [{ state: 'error', lastSyncedAt: null, error: 'boom' }, true],
      [{ state: 'idle', lastSyncedAt: 1, error: null }, false],
    ];
    const shapes = cases.map(([status, online]) => {
      const { container, unmount } = render(<SyncStatusDot status={status} online={online} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      const markup = svg?.innerHTML ?? '';
      unmount();
      return markup;
    });
    expect(new Set(shapes).size).toBe(4);
  });

  it('is reachable by keyboard and shows its tooltip on focus', async () => {
    render(<SyncStatusDot status={{ state: 'idle', lastSyncedAt: 1, error: null }} online />);
    await userEvent.tab();
    expect(screen.getByRole('status', { name: 'Synced' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Synced');
  });
});
