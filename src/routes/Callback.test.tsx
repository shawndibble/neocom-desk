import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
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
  await db.stationPins.clear();
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

  it('gives the newly-added Character the account-wide pins the account holds (#432)', async () => {
    // End to end through the real route: an existing Character holds an
    // account-wide station pin, and the Character signing in here has never
    // been on this device. Round 7's fan-out wrote that pin only for the
    // Characters known at the time, so without the backfill the new one lands
    // without it.
    await db.characters.put({
      characterId: 90_000_001,
      name: 'Existing Pilot',
      ownerHash: 'owner-hash-0',
      addedAt: 1,
    });
    await db.stationPins.put({
      id: '90000001:60003760',
      characterId: 90_000_001,
      locationId: 60_003_760,
      scope: 'account',
      updatedAt: 12_345,
    });
    sessionStorage.setItem('neocom.sso.state', 'state-1');
    sessionStorage.setItem('neocom.sso.verifier', 'verifier-1');
    renderCallback('?code=good-code&state=state-1');

    expect(await screen.findByText('characters page')).toBeInTheDocument();
    await vi.waitFor(async () => {
      expect(await db.stationPins.get(`${CHAR_ID}:60003760`)).toMatchObject({
        characterId: CHAR_ID,
        locationId: 60_003_760,
        scope: 'account',
        // Carried, not restamped — a `Date.now()` here would out-rank any
        // tombstone this Character holds on another device.
        updatedAt: 12_345,
      });
    });
  });

  it('shows an i18n error with a retry link on state mismatch', async () => {
    sessionStorage.setItem('neocom.sso.state', 'state-1');
    sessionStorage.setItem('neocom.sso.verifier', 'verifier-1');
    renderCallback('?code=good-code&state=wrong-state');

    expect(await screen.findByText(/something went wrong signing you in/i)).toBeInTheDocument();
    expect(tokenRequests).toBe(0);
    expect(screen.getByRole('link', { name: /try again/i })).toHaveAttribute('href', '/login');
  });

  it('announces the error panel to screen readers', async () => {
    sessionStorage.setItem('neocom.sso.state', 'state-1');
    sessionStorage.setItem('neocom.sso.verifier', 'verifier-1');
    renderCallback('?code=good-code&state=wrong-state');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows an error when code/state params are missing', async () => {
    renderCallback('');
    expect(await screen.findByRole('link', { name: /try again/i })).toBeInTheDocument();
  });
});
