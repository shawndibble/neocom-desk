import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useAuthFailure } from '@/stores/authFailure';
import { AuthFailureRedirect } from './AuthFailureNotice';

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

beforeEach(() => {
  useAuthFailure.setState({ failure: null });
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
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
