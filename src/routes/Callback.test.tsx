import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { Callback } from './Callback';
import { assignLocation } from '@/app/navigation';

// `beginAddCharacterLogin` ends in a real top-level navigation; jsdom cannot
// perform one, and the assertion here is which URL it was sent, not the trip.
vi.mock('@/app/navigation', () => ({ assignLocation: vi.fn() }));

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
  vi.mocked(assignLocation).mockClear();
  sessionStorage.clear();
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.stationPins.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
});

/** One pending round trip, in the layout `startLogin` writes. */
function stashLogin(state: string): void {
  sessionStorage.setItem(
    `neocom.sso.pkce.${state}`,
    JSON.stringify({ verifier: 'verifier-1', scopes: [], createdAt: Date.now() })
  );
}

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
    stashLogin('state-1');
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
    stashLogin('state-1');
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

  it('restarts the sign-in once rather than dead-ending (#649)', async () => {
    // Nothing stashed: this callback cannot complete. The user asked not to be
    // shown a panel they cannot act on, so the route retries by itself.
    renderCallback('?code=good-code&state=state-1');

    await vi.waitFor(() => expect(assignLocation).toHaveBeenCalledTimes(1));
    expect(String(vi.mocked(assignLocation).mock.calls[0][0])).toContain('login.eveonline.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stops after one automatic restart instead of looping (#649)', async () => {
    // The retry leaves for SSO and comes back here; unbudgeted, that is a
    // redirect loop between the app and EVE that the user cannot interrupt.
    sessionStorage.setItem('neocom.sso.autoRetries', '1');
    renderCallback('?code=good-code&state=state-1');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(assignLocation).not.toHaveBeenCalled();
  });

  it('falls back to the Characters list when the device has one (#649)', async () => {
    await db.characters.put({
      characterId: 90_000_001,
      name: 'Existing Pilot',
      ownerHash: 'owner-hash-0',
      addedAt: 1,
    });
    sessionStorage.setItem('neocom.sso.autoRetries', '1');
    renderCallback('?code=good-code&state=state-1');

    expect(await screen.findByText('characters page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a successful login clears the retry budget (#649)', async () => {
    sessionStorage.setItem('neocom.sso.autoRetries', '1');
    stashLogin('state-1');
    renderCallback('?code=good-code&state=state-1');

    expect(await screen.findByText('characters page')).toBeInTheDocument();
    expect(sessionStorage.getItem('neocom.sso.autoRetries')).toBeNull();
  });

  it('the panel restarts the sign-in instead of linking somewhere that cannot (#649)', async () => {
    sessionStorage.setItem('neocom.sso.autoRetries', '1');
    renderCallback('?code=good-code&state=state-1');

    await userEvent.click(await screen.findByRole('button', { name: /try again/i }));
    await vi.waitFor(() => expect(assignLocation).toHaveBeenCalledTimes(1));
    expect(String(vi.mocked(assignLocation).mock.calls[0][0])).toContain('login.eveonline.com');
  });

  it('words a lost race apart from a spent link (#649)', async () => {
    // A second round trip still pending means this callback lost a race.
    sessionStorage.setItem('neocom.sso.autoRetries', '1');
    stashLogin('other-state');
    renderCallback('?code=good-code&state=state-1');

    expect(await screen.findByText(/could not be verified/i)).toBeInTheDocument();
    expect(tokenRequests).toBe(0);
  });

  it('tells apart a spent sign-in from a failed one (#649)', async () => {
    sessionStorage.setItem('neocom.sso.autoRetries', '1');
    renderCallback('?code=good-code&state=state-1');

    expect(await screen.findByText(/already been used/i)).toBeInTheDocument();
    expect(tokenRequests).toBe(0);
  });

  it('keeps the generic message when EVE rejects the code (#649)', async () => {
    server.use(
      http.post('https://login.eveonline.com/v2/oauth/token', () =>
        HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })
      )
    );
    sessionStorage.setItem('neocom.sso.autoRetries', '1');
    stashLogin('state-1');
    renderCallback('?code=good-code&state=state-1');

    expect(await screen.findByText(/something went wrong signing you in/i)).toBeInTheDocument();
  });

  it('announces the error panel to screen readers', async () => {
    sessionStorage.setItem('neocom.sso.autoRetries', '1');
    renderCallback('?code=good-code&state=state-1');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows an error when code/state params are missing', async () => {
    sessionStorage.setItem('neocom.sso.autoRetries', '1');
    renderCallback('');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
