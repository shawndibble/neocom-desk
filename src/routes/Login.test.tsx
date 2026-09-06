import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
