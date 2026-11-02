import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { startOwnCorpGrantLogin } from '@/auth/session';
import { FEEDER_SYNC_SCOPES } from '@/auth/corpSyncScopes';
import { completeOwnCorpGrant } from './ownCorpGrant';

const addOwnCorpFeederRemote = vi.fn();
vi.mock('@/sync/corpSyncGrantApi', () => ({
  addOwnCorpFeederRemote: (...args: unknown[]) => addOwnCorpFeederRemote(...args),
}));

const cfg = { clientId: 'client-abc', redirectUri: 'https://app.example/neocom-desk/callback' };
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function jwt(characterId: number): string {
  const payload = {
    sub: `CHARACTER:EVE:${characterId}`,
    name: `Pilot ${characterId}`,
    owner: 'h',
    exp: Math.floor(Date.now() / 1000) + 1200,
    scp: [...FEEDER_SYNC_SCOPES],
  };
  return `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(payload))}.sig`;
}

let signedInAs = 222;
mswServer(
  http.post('https://login.eveonline.com/v2/oauth/token', () =>
    HttpResponse.json({
      access_token: jwt(signedInAs),
      token_type: 'Bearer',
      expires_in: 1199,
      refresh_token: 'secret-refresh',
    })
  )
);

const intent = {
  characterId: 111,
  expectedCeoCharacterId: 222,
  collectorCorporationId: 98000001,
  feederCorporationId: 98000002,
};

async function run(extra: { coverageFrom?: string } = {}) {
  const url = await startOwnCorpGrantLogin({ ...intent, ...extra }, cfg);
  return completeOwnCorpGrant({ code: 'c', state: new URL(url).searchParams.get('state')! });
}

beforeEach(() => {
  sessionStorage.clear();
  addOwnCorpFeederRemote.mockReset();
  signedInAs = 222;
});

describe('completeOwnCorpGrant', () => {
  it('sends the grant to the callable when the CEO signed in, and connects', async () => {
    addOwnCorpFeederRemote.mockResolvedValue({ ok: true });
    expect(await run({ coverageFrom: '2026-10-25' })).toEqual({
      status: 'connected',
      corporationId: 98000002,
    });
    expect(addOwnCorpFeederRemote).toHaveBeenCalledWith({
      editorCharacterId: 111,
      collectorCorporationId: 98000001,
      feederCorporationId: 98000002,
      grantAccessToken: expect.any(String),
      grantRefreshToken: 'secret-refresh',
      coverageFrom: '2026-10-25',
    });
  });

  it('sends nothing to Firebase when another character signed in', async () => {
    signedInAs = 333;
    expect(await run()).toEqual({
      status: 'wrong-character',
      corporationId: 98000002,
      signedInAs: 'Pilot 333',
    });
    expect(addOwnCorpFeederRemote).not.toHaveBeenCalled();
  });

  it('reports the server reason when it refuses', async () => {
    addOwnCorpFeederRemote.mockResolvedValue({ ok: false, reason: 'not-an-accountant' });
    expect(await run()).toEqual({
      status: 'refused',
      corporationId: 98000002,
      reason: 'not-an-accountant',
    });
  });

  it('reports a thrown callable error by its reason, else unknown', async () => {
    addOwnCorpFeederRemote.mockRejectedValueOnce(
      Object.assign(new Error('x'), { details: { reason: 'collector-gone' } })
    );
    expect(await run()).toMatchObject({ status: 'refused', reason: 'collector-gone' });
    addOwnCorpFeederRemote.mockRejectedValueOnce(new Error('boom'));
    expect(await run()).toMatchObject({ status: 'refused', reason: 'unknown' });
  });
});
