import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('Layout mobile "More" sheet (UX-REVIEW #4)', () => {
  it('keeps 4 primary tabs + More in the mobile tab bar', () => {
    mockIsSyncConfigured.mockReturnValue(false);
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expect(within(mobileNav).getAllByRole('link')).toHaveLength(4);
    expect(within(mobileNav).getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('opens a dialog listing Wallet, Assets, Mail, Calendar, Contracts, and Orders (not Styleguide)', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    const moreButton = within(mobileNav).getByRole('button', { name: 'More' });
    expect(moreButton).toHaveAttribute('aria-expanded', 'false');
    expect(moreButton).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(moreButton);
    expect(moreButton).toHaveAttribute('aria-expanded', 'true');

    const sheet = screen.getByRole('dialog', { name: 'More' });
    expect(moreButton.getAttribute('aria-controls')).toBe(sheet.id);
    for (const label of ['Wallet', 'Assets', 'Mail', 'Calendar', 'Contracts', 'Orders']) {
      expect(within(sheet).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(within(sheet).queryByRole('link', { name: 'Styleguide' })).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the More trigger', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    const moreButton = within(mobileNav).getByRole('button', { name: 'More' });
    await user.click(moreButton);
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
    expect(moreButton).toHaveFocus();
  });

  it('closes when a link in the sheet is clicked', async () => {
    mockIsSyncConfigured.mockReturnValue(false);
    const user = userEvent.setup();
    renderLayout();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });

    await user.click(within(sheet).getByRole('link', { name: 'Wallet' }));
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
  });
});
