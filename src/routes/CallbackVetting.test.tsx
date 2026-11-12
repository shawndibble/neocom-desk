import { beforeEach, describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import '@/i18n';
import { setLoginReturnTo } from '@/auth/loginReturnTo';
import { VETTING_SCOPES } from '@/auth/vettingScopes';
import { db } from '@/db';
import { vettingLoginFrom } from '@/features/corp/vetting/vettingLoginState';
import { Callback } from './Callback';

const CHAR_ID = 2112625428;

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const ACCESS = `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(
  JSON.stringify({
    sub: `CHARACTER:EVE:${CHAR_ID}`,
    name: 'CCP Alpha',
    owner: 'owner-hash-1',
    exp: Math.floor(Date.now() / 1000) + 1200,
    scp: [...VETTING_SCOPES],
  })
)}.sig`;

let tokenRequests = 0;
mswServer(
  http.post('https://login.eveonline.com/v2/oauth/token', () => {
    tokenRequests += 1;
    return HttpResponse.json({
      access_token: ACCESS,
      token_type: 'Bearer',
      expires_in: 1199,
      refresh_token: 'vetting-refresh-1',
    });
  })
);

beforeEach(async () => {
  tokenRequests = 0;
  sessionStorage.clear();
  await db.characters.clear();
  await db.tokens.clear();
});

/** A Vetting round trip, in the layout `startVettingLogin` writes. */
function stashVettingLogin(state: string, reviewId?: string): void {
  sessionStorage.setItem(
    `neocom.sso.pkce.${state}`,
    JSON.stringify({
      verifier: 'verifier-1',
      scopes: [...VETTING_SCOPES],
      createdAt: Date.now(),
      intent: { kind: 'vetting', corporationId: 98000001, ...(reviewId ? { reviewId } : {}) },
    })
  );
}

/** Stands in for the page the login was pressed on: shows the router state the callback hands it. */
function Landing({ name }: { name: string }) {
  const location = useLocation();
  const login = vettingLoginFrom(location.state);
  return (
    <div role="status">
      {name} at {location.pathname}: {login?.status ?? 'none'}
      {login?.status === 'ok' && ` ${login.name} ${login.characterId} ${login.accessToken}`}
      <pre>{JSON.stringify(Object.keys((location.state as object | null) ?? {}))}</pre>
    </div>
  );
}

function renderCallback(search: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[`/callback${search}`]}>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="/apply/:corpId" element={<Landing name="apply" />} />
          <Route path="/vetting" element={<Landing name="request" />} />
          <Route path="/characters" element={<div>characters page</div>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );
}

describe('Callback, Vetting round trip', () => {
  it('hands the access token to the apply page in router state and stores nothing', async () => {
    stashVettingLogin('state-v');
    renderCallback('?code=good-code&state=state-v');
    expect(
      await screen.findByText(new RegExp(`apply at /apply/98000001: ok CCP Alpha ${CHAR_ID}`))
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(ACCESS);
    // StrictMode ran the effect twice; the one-time code was exchanged once.
    expect(tokenRequests).toBe(1);
    expect(await db.characters.count()).toBe(0);
    expect(await db.tokens.count()).toBe(0);
    // The refresh token SSO answered with is nowhere: not in state, not in storage.
    expect(document.body.textContent).not.toContain('vetting-refresh-1');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('vetting-refresh-1');
    expect(JSON.stringify({ ...localStorage })).not.toContain('vetting-refresh-1');
  });

  it('returns to the page the login was pressed on', async () => {
    setLoginReturnTo('/vetting');
    stashVettingLogin('state-v', 'r-1');
    renderCallback('?code=good-code&state=state-v');
    expect(await screen.findByText(/request at \/vetting: ok/)).toBeInTheDocument();
  });

  it('lands a cancel back on the apply page as cancelled, with no exchange', async () => {
    stashVettingLogin('state-v');
    renderCallback('?error=access_denied&state=state-v');
    expect(await screen.findByText(/apply at \/apply\/98000001: cancelled/)).toBeInTheDocument();
    expect(tokenRequests).toBe(0);
  });
});
