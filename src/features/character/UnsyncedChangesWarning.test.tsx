import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@/i18n';
import { setStatus } from '@/sync/status';
import { UnsyncedChangesWarning } from './UnsyncedChangesWarning';

function go(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
  setStatus(7, { state: 'idle', lastSyncedAt: null, error: null });
});

describe('UnsyncedChangesWarning', () => {
  it('renders nothing when online and the last sync was clean', () => {
    setStatus(7, { state: 'idle', lastSyncedAt: 5, error: null });
    render(<UnsyncedChangesWarning characterIds={[7]} syncConfigured />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns once the browser goes offline, and drops the warning on reconnect', () => {
    setStatus(7, { state: 'idle', lastSyncedAt: 5, error: null });
    render(<UnsyncedChangesWarning characterIds={[7]} syncConfigured />);
    go(false);
    expect(screen.getByRole('alert')).toHaveTextContent(/offline/i);
    go(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns online when the Character has not synced cleanly', () => {
    render(<UnsyncedChangesWarning characterIds={[7]} syncConfigured />);
    expect(screen.getByRole('alert')).toHaveTextContent(/may not have synced/i);
  });

  it('renders nothing without sync, even offline', () => {
    go(false);
    render(<UnsyncedChangesWarning characterIds={[7]} syncConfigured={false} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
