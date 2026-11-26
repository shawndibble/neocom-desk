import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useAuthFailure, useNeedsLogin } from '@/stores/authFailure';
import { AuthFailureNotice, AuthFailureRedirect, NeedsLoginNotice } from './AuthFailureNotice';
import { beginEveLogin } from './loginFlow';
import { useReauthSlots } from './reauthSlots';

vi.mock('./loginFlow', () => ({ beginEveLogin: vi.fn(async () => {}) }));

const CHARACTER_ID = 12;

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/mail']}>
      <AuthFailureRedirect />
      <Routes>
        <Route path="/mail" element={<p>mail view</p>} />
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/characters" element={<NeedsLoginNotice />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  useAuthFailure.setState({ failure: null });
  await db.settings.delete('auth.needsLogin');
  useNeedsLogin.setState({ value: [], hydrated: true });
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
  await db.characters.clear();
});

describe('AuthFailureRedirect', () => {
  it('stays put when nothing has failed', () => {
    renderApp();
    expect(screen.getByText('mail view')).toBeInTheDocument();
  });

  it('sends the user to /characters with a notice naming the character when the refresh grant is dead', async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Ada Vance',
      ownerHash: 'oh',
      addedAt: 0,
    });
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderApp();
    expect(await screen.findByText('Ada Vance: log in again')).toBeInTheDocument();
    expect(screen.queryByText('mail view')).not.toBeInTheDocument();
  });

  it('starts login for that character from the notice', async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Ada Vance',
      ownerHash: 'oh',
      addedAt: 0,
    });
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: CHARACTER_ID });
  });

  it('shows no notice for a character that no longer exists', async () => {
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderApp();
    await waitFor(() => expect(useAuthFailure.getState().failure).toBeNull());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('drops the notice when dismissed, keeping the mark until a sign-in', async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Ada Vance',
      ownerHash: 'oh',
      addedAt: 0,
    });
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Ada Vance: log in again')).not.toBeInTheDocument();
    expect(useNeedsLogin.getState().value).toEqual([CHARACTER_ID]);
  });

  it('consumes the failure, so the redirect happens once rather than every render', async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Ada Vance',
      ownerHash: 'oh',
      addedAt: 0,
    });
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderApp();
    await waitFor(() => expect(useAuthFailure.getState().failure).toBeNull());
    expect(useNeedsLogin.getState().value).toEqual([CHARACTER_ID]);
  });

  it('does not redirect for a request-level failure — only that view is broken', () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    renderApp();
    expect(screen.getByText('mail view')).toBeInTheDocument();
  });

  it('does not throw the active character out over another character’s dead grant', async () => {
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID + 1);
    renderApp();
    expect(screen.getByText('mail view')).toBeInTheDocument();
    await waitFor(() => expect(useNeedsLogin.getState().value).toEqual([CHARACTER_ID + 1]));
    expect(screen.getByText('mail view')).toBeInTheDocument();
  });
});

describe('AuthFailureNotice', () => {
  beforeEach(() => {
    vi.mocked(beginEveLogin).mockClear();
  });

  it('asks for the Permission the failed request needed, not just a plain re-login', async () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID, 'postCharacterMail');
    render(
      <MemoryRouter>
        <AuthFailureNotice />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: CHARACTER_ID, groups: ['mailSend'] });
  });

  it('asks for no Permission when the failure names no endpoint', async () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    render(
      <MemoryRouter>
        <AuthFailureNotice />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

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
    render(
      <MemoryRouter>
        <AuthFailureNotice />
      </MemoryRouter>
    );
    expect(await screen.findAllByText(/Pilot One/)).toHaveLength(2);
  });

  it('stands down while a banner on the page already speaks for that character', () => {
    useReauthSlots.getState().claim('page', CHARACTER_ID, 'banner', ['getCharacterWallet']);
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    render(
      <MemoryRouter>
        <AuthFailureNotice />
      </MemoryRouter>
    );
    expect(screen.queryByText(/: log in again$/)).not.toBeInTheDocument();
    useReauthSlots.getState().release('page');
  });

  it('names a missing corp role plainly, with no login to offer', async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Ada Vance',
      ownerHash: 'oh',
      addedAt: 0,
    });
    useAuthFailure.getState().reportRoleRefusal(CHARACTER_ID, 'getCorporationWallets');
    render(
      <MemoryRouter>
        <AuthFailureNotice />
      </MemoryRouter>
    );
    expect(await screen.findAllByText(/Ada Vance: missing corp role/)).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('says "This character" until the character record is loaded', () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    render(
      <MemoryRouter>
        <AuthFailureNotice />
      </MemoryRouter>
    );
    expect(screen.getByText('This character: log in again')).toBeInTheDocument();
    expect(screen.getByText('EVE no longer accepts the saved login.')).toBeInTheDocument();
  });
});

describe('AuthFailureNotice on a page that owns the banner', () => {
  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <AuthFailureNotice />
      </MemoryRouter>
    );
  }

  beforeEach(() => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID, 'getCharacterPlanets');
  });

  it('stays quiet for the planets refusal on a PI tab', () => {
    renderAt('/planetary-industry/map');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('still shows for the same refusal elsewhere', () => {
    renderAt('/mail');
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
