import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { Layout } from './Layout';

const mockSubscribe = vi.fn();
vi.mock('@/sync', () => ({
  subscribeSyncStatus: (listener: (s: unknown) => void) => mockSubscribe(listener),
}));

const mockIsSyncConfigured = vi.fn();
vi.mock('./syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./syncStatus')>()),
  isSyncConfigured: () => mockIsSyncConfigured(),
}));

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/overview" element={<div>page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockSubscribe.mockReset().mockImplementation((listener) => {
    listener({ state: 'idle', lastSyncedAt: null, error: null });
    return () => {};
  });
  mockIsSyncConfigured.mockReset();
});

describe('Layout sync status dot', () => {
  it('is hidden when sync is unconfigured', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is shown, subscribed to sync status, when sync is configured', () => {
    mockIsSyncConfigured.mockReturnValue(true);
    mockSubscribe.mockImplementation((listener) => {
      listener({ state: 'syncing', lastSyncedAt: null, error: null });
      return () => {};
    });
    renderLayout();
    expect(screen.getByRole('status', { name: 'Syncing…' })).toBeInTheDocument();
  });
});
