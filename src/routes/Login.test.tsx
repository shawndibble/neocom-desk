import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { SCOPES } from '@/esi/scopes';
import { assignLocation } from '@/app/navigation';
import { Login } from './Login';

vi.mock('@/app/navigation', () => ({ assignLocation: vi.fn() }));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/characters" element={<p>character list</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  vi.mocked(assignLocation).mockClear();
  vi.stubEnv('VITE_EVE_CLIENT_ID', 'test-client-id');
  sessionStorage.clear();
  await db.characters.clear();
});

describe('Login', () => {
  it('shows the app name, hero heading and SSO button', async () => {
    renderLogin();
    expect(
      await screen.findByRole('heading', { name: /command deck for every character you fly/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Neocom Desk')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /log in with eve online/i });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('links the footer "Free & open source" text to the repo', async () => {
    renderLogin();
    await screen.findByRole('heading', { name: /command deck for every character you fly/i });
    expect(screen.getByRole('link', { name: /free & open source/i })).toHaveAttribute(
      'href',
      'https://github.com/shawndibble/neocom-desk'
    );
  });

  it('leads with the questions the app answers', async () => {
    renderLogin();
    expect(
      await screen.findByRole('heading', { name: /the questions it exists to answer/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /which of my orders is quietly losing isk/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /is this blueprint worth building today/i })
    ).toBeInTheDocument();
  });

  // The catalog is the page's claim about what shipped, and it silently rotted
  // once before: the eight rows it listed predated Moon Mining, Corporation,
  // Notifications and the Open Orders worklist. Pin every group and row, so
  // the next feature that lands without one fails a test rather than just
  // leaving the page quietly out of date.
  it('groups the feature catalog and names the surfaces that ship today', async () => {
    renderLogin();
    // Scoped to the catalog: "Clones" and "Market" also appear in the hero's
    // preview panel, so an unscoped query matches two nodes.
    const catalog = within(
      await screen.findByRole('region', { name: /everything outside the client/i })
    );

    for (const group of ['Progression', 'Economy', 'Operations']) {
      expect(catalog.getByRole('heading', { name: group })).toBeInTheDocument();
    }
    for (const feature of [
      'Skills',
      'Clones',
      'Industry',
      'Market',
      'Market Orders',
      'Wallet & LP',
      'Assets',
      'Planetary Industry',
      'Moon Mining',
      'Corporation',
      'Notifications',
      'Mail, Calendar & Contracts',
    ]) {
      expect(catalog.getByText(feature)).toBeInTheDocument();
    }
  });

  it('answers the trust objections and enumerates the scopes it asks for', async () => {
    renderLogin();
    expect(
      await screen.findByRole('heading', { name: /read-only, and it stays that way/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /never writes to your account/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /your token stays on this device/i })
    ).toBeInTheDocument();

    // The consent list is compliance copy, not a sales pitch: it has to name
    // the base-grant scopes that are easiest to forget are in there.
    const permissions = screen.getByText(/signing in grants read-only access/i);
    for (const scope of [
      'mining ledger',
      'current location',
      'corporation roles',
      'blueprints',
      'loyalty points',
    ]) {
      expect(permissions).toHaveTextContent(scope);
    }
  });

  it('redirects to /characters when a Character already exists', async () => {
    await db.characters.put({ characterId: 1, name: 'Pilot One', ownerHash: 'oh', addedAt: 0 });
    renderLogin();
    expect(await screen.findByText('character list')).toBeInTheDocument();
  });

  it('shows a spinner on the SSO button while a login is pending', async () => {
    const user = userEvent.setup();
    renderLogin();
    const [firstButton] = await screen.findAllByRole('button', {
      name: /log in with eve online/i,
    });
    await user.click(firstButton);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('builds a PKCE authorize URL and navigates to EVE SSO', async () => {
    const user = userEvent.setup();
    renderLogin();
    const [firstButton] = await screen.findAllByRole('button', {
      name: /log in with eve online/i,
    });
    await user.click(firstButton);

    await waitFor(() => expect(assignLocation).toHaveBeenCalledTimes(1));
    const url = new URL(vi.mocked(assignLocation).mock.calls[0][0]);

    expect(url.origin).toBe('https://login.eveonline.com');
    expect(url.pathname).toBe('/v2/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('scope')).toBe(SCOPES.join(' '));
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/callback$/);
  });
});
