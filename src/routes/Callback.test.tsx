import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { Callback } from './Callback';

const CHAR_ID = 2112625428;

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeAccessJwt(): string {
  const payload = {
    sub: `CHARACTER:EVE:${CHAR_ID}`,
    name: 'CCP Alpha',
    owner: 'owner-hash-1',
    exp: Math.floor(Date.now() / 1000) + 1200,
    scp: ['esi-skills.read_skills.v1'],
  };
  return `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

let tokenRequests = 0;

const server = setupServer(
  http.post('https://login.eveonline.com/v2/oauth/token', () => {
    tokenRequests += 1;
    return HttpResponse.json({
      access_token: makeAccessJwt(),
      token_type: 'Bearer',
      expires_in: 1199,
      refresh_token: 'refresh-1',
    });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  tokenRequests = 0;
  sessionStorage.clear();
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
});

function renderCallback(search: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[`/callback${search}`]}>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="/characters" element={<div>characters page</div>} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );
}

describe('Callback', () => {
  it('completes login once (StrictMode-safe) and navigates to /characters', async () => {
    sessionStorage.setItem('neocom.sso.state', 'state-1');
    sessionStorage.setItem('neocom.sso.verifier', 'verifier-1');
    renderCallback('?code=good-code&state=state-1');

    expect(await screen.findByText('characters page')).toBeInTheDocument();
    expect(tokenRequests).toBe(1);
    expect(await db.characters.get(CHAR_ID)).toMatchObject({ name: 'CCP Alpha' });
    expect(useActiveCharacter.getState().activeCharacterId).toBe(CHAR_ID);
  });

  it('shows an error with a retry link on state mismatch', async () => {
    sessionStorage.setItem('neocom.sso.state', 'state-1');
    sessionStorage.setItem('neocom.sso.verifier', 'verifier-1');
    renderCallback('?code=good-code&state=wrong-state');

    expect(await screen.findByText(/state mismatch/i)).toBeInTheDocument();
    expect(tokenRequests).toBe(0);
    expect(screen.getByRole('link', { name: /try again/i })).toHaveAttribute('href', '/login');
  });

  it('shows an error when code/state params are missing', async () => {
    renderCallback('');
    expect(await screen.findByRole('link', { name: /try again/i })).toBeInTheDocument();
  });
});
