import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useAuthFailure } from '@/stores/authFailure';
import { AuthFailureNotice, AuthFailureRedirect, NeedsLoginNotice } from './AuthFailureNotice';
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
        <Route path="/characters" element={<NeedsLoginNotice />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  useAuthFailure.setState({ failure: null, needsLogin: [] });
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
    expect(await screen.findByText('Ada Vance needs a new login')).toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole('button', { name: /log in again/i }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: CHARACTER_ID });
  });

  it('forgets a character that no longer exists', async () => {
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderApp();
    await waitFor(() => expect(useAuthFailure.getState().needsLogin).toEqual([]));
  });

  it('drops the notice when dismissed', async () => {
    await db.characters.put({
      characterId: CHARACTER_ID,
      name: 'Ada Vance',
      ownerHash: 'oh',
      addedAt: 0,
    });
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Ada Vance needs a new login')).not.toBeInTheDocument();
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
    expect(useAuthFailure.getState().needsLogin).toEqual([CHARACTER_ID]);
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
    expect(useAuthFailure.getState().needsLogin).toEqual([]);
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
    render(
      <MemoryRouter>
        <AuthFailureNotice />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /log in again/i }));

    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: CHARACTER_ID, groups: ['mail'] });
  });

  it('asks for no Permission when the failure names no endpoint', async () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    render(
      <MemoryRouter>
        <AuthFailureNotice />
      </MemoryRouter>
    );

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
    render(
      <MemoryRouter>
        <AuthFailureNotice />
      </MemoryRouter>
    );
    // Once in the live region, once in the visible block.
    expect(await screen.findAllByText(/Pilot One/)).toHaveLength(2);
  });

  it('falls back to the unnamed hint when the character record is not yet loaded', () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    render(
      <MemoryRouter>
        <AuthFailureNotice />
      </MemoryRouter>
    );
    expect(
      screen.getByText("EVE turned down a request for this character's data.", { exact: false })
    ).toBeInTheDocument();
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
    // Announced through the always-mounted region, not a role on the block.
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
