import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useAuthFailure } from '@/stores/authFailure';
import { AuthFailureNotice, AuthFailureRedirect } from './AuthFailureNotice';
import { beginEveLogin } from './loginFlow';

vi.mock('./loginFlow', () => ({ beginEveLogin: vi.fn(async () => {}) }));

const CHARACTER_ID = 12;

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/mail']}>
      <AuthFailureRedirect />
      <Routes>
        <Route path="/mail" element={<p>mail view</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  useAuthFailure.setState({ failure: null });
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
  await db.characters.clear();
});

describe('AuthFailureRedirect', () => {
  it('stays put when nothing has failed', () => {
    renderApp();
    expect(screen.getByText('mail view')).toBeInTheDocument();
  });

  it('sends the user to /login when the refresh grant is dead', async () => {
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderApp();
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('consumes the failure, so the redirect happens once rather than every render', async () => {
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderApp();
    await screen.findByText('login page');
    expect(useAuthFailure.getState().failure).toBeNull();
  });

  it('does not redirect for a request-level failure — only that view is broken', () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    renderApp();
    expect(screen.getByText('mail view')).toBeInTheDocument();
  });

  it('does not throw the active character out over another character’s dead grant', () => {
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID + 1);
    renderApp();
    expect(screen.getByText('mail view')).toBeInTheDocument();
  });
});

describe('AuthFailureNotice', () => {
  beforeEach(() => {
    vi.mocked(beginEveLogin).mockClear();
  });

  it('asks for the Permission the failed request needed, not just a plain re-login', async () => {
    // A mail send refused for a scope the grant never held: a plain re-login
    // re-requests the same scopes, comes back identical and fails again.
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID, 'postCharacterMail');
    render(<AuthFailureNotice />);

    await userEvent.click(screen.getByRole('button', { name: /log in again/i }));

    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: CHARACTER_ID, groups: ['mail'] });
  });

  it('asks for no Permission when the failure names no endpoint', async () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    render(<AuthFailureNotice />);

    await userEvent.click(screen.getByRole('button', { name: /log in again/i }));

    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: CHARACTER_ID, groups: [] });
  });

  it('names the active character so the pilot knows which one to re-auth', async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Pilot One',
      ownerHash: 'oh',
      addedAt: 1,
    });
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    render(<AuthFailureNotice />);
    expect(await screen.findByText(/Pilot One/)).toBeInTheDocument();
  });

  it('falls back to the unnamed hint when the character record is not yet loaded', () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    render(<AuthFailureNotice />);
    expect(
      screen.getByText("EVE turned down a request for this character's data.", { exact: false })
    ).toBeInTheDocument();
  });
});
