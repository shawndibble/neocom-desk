import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { App } from '@/app/App';
import { ASSUMED_ME_SETTING_KEY } from '@/features/industry/assumedMe';
import { CHAR_ID, settingsNav, installSettingsHarness } from '@/test/settingsPage';

vi.mock('virtual:pwa-register/react', async () =>
  (await import('@/test/settingsMocks')).pwaRegisterMock()
);
vi.mock('@/app/navigation', async () => (await import('@/test/settingsMocks')).navigationMock());
vi.mock('@/app/forceUpdate', async () => (await import('@/test/settingsMocks')).forceUpdateMock());
vi.mock('@/lib/serviceWorker', async () =>
  (await import('@/test/settingsMocks')).serviceWorkerMock()
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/settingsMocks')).loadSdeMock());
vi.mock('@/features/notifications/projectionRebuild', async () =>
  (await import('@/test/settingsMocks')).projectionRebuildMock()
);
vi.mock('@/features/notifications/foregroundPoller', async (importOriginal) =>
  (await import('@/test/settingsMocks')).foregroundPollerMock(
    await importOriginal<typeof import('@/features/notifications/foregroundPoller')>()
  )
);
vi.mock('@/features/notifications/webPush', async (importOriginal) =>
  (await import('@/test/settingsMocks')).webPushMock(
    await importOriginal<typeof import('@/features/notifications/webPush')>()
  )
);
vi.mock('@/app/bootPrefetch', async () =>
  (await import('@/test/settingsMocks')).bootPrefetchMock()
);

installSettingsHarness({ app: true });

describe('Settings', () => {
  it('lists the keyboard shortcuts on Help, its last tab, and redirects the old Settings link (issue #25)', async () => {
    window.history.pushState({}, '', '/settings/shortcuts');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /help & faq/i });

    expect(window.location.pathname).toBe('/help/shortcuts');
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Shortcuts', 'FAQ', 'Support']);
    expect(
      screen.queryByRole('checkbox', { name: /single-key shortcuts/i })
    ).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.getByText('Open the command palette')).toBeInTheDocument();
    expect(screen.queryByText('Jump to search')).not.toBeInTheDocument();
    expect(screen.getByText('Switch character')).toBeInTheDocument();
    expect(screen.getByText('Open Settings')).toBeInTheDocument();
    expect(screen.getAllByText('then').length).toBeGreaterThan(0);
    expect(screen.getByText('Close the open dialog')).toBeInTheDocument();
  });
});

describe('Settings defaults', () => {
  it('sends the old /settings/faq link to the Help page’s FAQ questions', async () => {
    window.history.pushState({}, '', '/settings/faq');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /help & faq/i });

    expect(window.location.pathname).toBe('/help/faq');
    expect(
      await screen.findByRole('button', { name: /what syncs between my devices/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /what stays on this device/i })).toBeInTheDocument();
  });

  it('sends the old /settings/help link to the Help page’s Support tab', async () => {
    window.history.pushState({}, '', '/settings/help');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /help & faq/i });

    expect(window.location.pathname).toBe('/help/support');
    expect(screen.getByRole('tab', { name: 'Support' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'FAQ' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: /bugs, ideas and chat/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /discord/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /say thanks/i })).toBeInTheDocument();
  });

  it('shows the shortcut list from the ? shortcut, even from another section', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/settings/activity');
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /settings/i });
    expect(
      await within(settingsNav()).findByRole('link', { name: /activity log/i })
    ).toHaveAttribute('aria-current', 'page');

    await user.keyboard('{Shift>}?{/Shift}');

    expect(await screen.findByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/help/shortcuts');
  });
});

describe('Settings — sections rail', () => {
  it('carries an old /settings/general#shortcuts link on to Help › Shortcuts', async () => {
    window.history.pushState({}, '', '/settings/general#shortcuts');
    render(<App />);

    expect(await screen.findByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/help/shortcuts');
  });
});

describe('Settings — phone list', () => {
  it('still lands an old #shortcuts link on Shortcuts rather than the list', async () => {
    window.history.pushState({}, '', '/settings#shortcuts');
    render(<App />);

    expect(await screen.findByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/help/shortcuts');
  });
});

describe('Settings — This device', () => {
  it('logs out of every character, keeps the settings, and lands on the login page', async () => {
    const user = userEvent.setup();
    await db.characters.put({ characterId: 92, name: 'Pilot Two', ownerHash: 'oh2', addedAt: 2 });
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 1000,
      scopes: [],
    });
    await db.settings.put({ key: ASSUMED_ME_SETTING_KEY, value: 7 });
    window.history.pushState({}, '', '/settings/device');
    render(<App />);

    expect(
      await screen.findByText(/2 characters are logged in on this device/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^log out$/i }));
    const dialog = await screen.findByRole('dialog', { name: /log out of all characters/i });
    expect(within(dialog).getByText(/removes 2 characters' logins/i)).toBeInTheDocument();
    expect(await db.characters.count()).toBe(2);

    await user.click(within(dialog).getByRole('button', { name: /^log out$/i }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(await db.characters.count()).toBe(0);
    expect(await db.tokens.count()).toBe(0);
    expect((await db.settings.get(ASSUMED_ME_SETTING_KEY))?.value).toBe(7);
  });
});
