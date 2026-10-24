import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_SCOPE } from './corpTaxBookEsi.js';
import {
  assertOwnToken,
  callerFromAuth,
  fail,
  requireRolesScope,
  requireLiveRoles,
  DENY_REASON,
  signedInCharacter,
  verifyAccessToken,
  verifyCallerToken,
} from './actorAuth.js';
import type { EveTokenClaims } from './verifyEveToken.js';

const caller = { uid: 'char:42', ownerHash: 'hash-a' };
const claims = (over: Partial<EveTokenClaims> = {}): EveTokenClaims => ({
  characterId: 42,
  name: 'Pilot',
  ownerHash: 'hash-a',
  scopes: [ROLES_SCOPE],
  clientId: 'cid',
  ...over,
});

async function caught(p: Promise<unknown> | (() => unknown)): Promise<HttpsError> {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    return e as HttpsError;
  }
  throw new Error('did not throw');
}
const reasonOf = (e: HttpsError) => (e.details as { reason?: string } | undefined)?.reason;

describe('fail', () => {
  it('carries the code and a stable reason', () => {
    expect(() => fail('not-found', 'm', 'r')).toThrow(HttpsError);
    try {
      fail('not-found', 'm', 'r');
    } catch (e) {
      expect((e as HttpsError).code).toBe('not-found');
      expect(reasonOf(e as HttpsError)).toBe('r');
    }
  });
});

describe('signedInCharacter', () => {
  it('returns the Character id behind a char: uid', () => {
    expect(signedInCharacter(caller)).toBe(42);
  });
  it.each(['anon123', 'char:', 'char:abc', 'x-char:1'])('refuses uid %s', async (uid) => {
    const e = await caught(() => signedInCharacter({ uid, ownerHash: 'h' }));
    expect(e.code).toBe('unauthenticated');
    expect(e.message).toBe('Sign in with a Character first');
    expect(reasonOf(e)).toBe('not-signed-in');
  });
});

describe('callerFromAuth', () => {
  it('returns the uid and ownerHash of a signed-in Character', () => {
    expect(callerFromAuth({ uid: 'char:42', token: { ownerHash: 'hash-a' } })).toEqual(caller);
  });
  it.each([
    ['no auth', undefined],
    ['anonymous uid', { uid: 'anon123', token: { ownerHash: 'h' } }],
    ['uid with a char: prefix only', { uid: 'char:42x', token: { ownerHash: 'h' } }],
    ['no ownerHash claim', { uid: 'char:42', token: {} }],
    ['non-string ownerHash', { uid: 'char:42', token: { ownerHash: 7 } }],
  ])('refuses %s with the signed-out error', async (_name, auth) => {
    const e = await caught(() => callerFromAuth(auth));
    expect(e.code).toBe('unauthenticated');
    expect(e.message).toBe('Sign in with a Character first');
  });
});

describe('verifyAccessToken', () => {
  it('returns the claims', async () => {
    expect(await verifyAccessToken(async () => claims(), 't')).toEqual(claims());
  });
  it('maps any failure to one opaque unauthenticated error', async () => {
    const e = await caught(
      verifyAccessToken(async () => {
        throw new Error('jwks secret detail');
      }, 't')
    );
    expect(e.code).toBe('unauthenticated');
    expect(e.message).toBe('EVE access token rejected');
    expect(e.details).toBeUndefined();
  });
  it('reports the cause to onReject without leaking it', async () => {
    const onReject = vi.fn();
    const err = new Error('boom');
    const e = await caught(
      verifyAccessToken(
        async () => {
          throw err;
        },
        't',
        { onReject }
      )
    );
    expect(onReject).toHaveBeenCalledWith(err);
    expect(e.message).toBe('EVE access token rejected');
  });
  it('can throw a caller-chosen error type', async () => {
    class Mine extends Error {}
    const e = await caught(
      verifyAccessToken(
        async () => {
          throw new Error('x');
        },
        't',
        { toError: () => new Mine('mine') }
      )
    );
    expect(e).toBeInstanceOf(Mine);
  });
});

describe('verifyCallerToken', () => {
  const deps = (c: EveTokenClaims | Error) => ({
    verifyToken: async () => {
      if (c instanceof Error) throw c;
      return c;
    },
  });
  it('returns the actor when the token is the caller own', async () => {
    const actor = await verifyCallerToken(deps(claims()), caller, 't');
    expect(actor.characterId).toBe(42);
    expect(actor.claims.name).toBe('Pilot');
  });
  it('refuses a caller that is not signed in, before verifying', async () => {
    const verifyToken = vi.fn();
    const e = await caught(
      verifyCallerToken({ verifyToken }, { uid: 'anon', ownerHash: 'h' }, 't')
    );
    expect(reasonOf(e)).toBe('not-signed-in');
    expect(verifyToken).not.toHaveBeenCalled();
  });
  it('requires a token when asked: invalid-argument token-required', async () => {
    const e = await caught(verifyCallerToken(deps(claims()), caller, undefined));
    expect(e.code).toBe('invalid-argument');
    expect(reasonOf(e)).toBe('token-required');
  });
  it('refuses a rejected token opaquely', async () => {
    const e = await caught(verifyCallerToken(deps(new Error('bad')), caller, 't'));
    expect(e.code).toBe('unauthenticated');
    expect(e.message).toBe('EVE access token rejected');
  });
  it('refuses another Character token', async () => {
    const e = await caught(verifyCallerToken(deps(claims({ characterId: 7 })), caller, 't'));
    expect(e.code).toBe('permission-denied');
    expect(reasonOf(e)).toBe('token-mismatch');
  });
  it('refuses a transferred Character (ownerHash differs)', async () => {
    const e = await caught(verifyCallerToken(deps(claims({ ownerHash: 'other' })), caller, 't'));
    expect(reasonOf(e)).toBe('token-mismatch');
  });
});

describe('the verified actor', () => {
  it('carries the token it verified, which requireLiveRoles reads ESI with', async () => {
    const actor = await verifyCallerToken(
      { verifyToken: async () => claims() },
      caller,
      'verified-tok'
    );
    expect(actor.accessToken).toBe('verified-tok');
    const readIdentity = vi.fn(async () => ({ corporationId: 1, ceoId: 42, roles: [] }));
    await requireLiveRoles({ readIdentity }, actor, {
      need: 'canEdit',
      denied: { message: 'no', reason: 'not-an-officer' },
    });
    expect(readIdentity).toHaveBeenCalledWith(42, 'verified-tok');
  });
});

describe('requireLiveRoles', () => {
  const actor = { characterId: 42, claims: claims(), accessToken: 'tok' };
  const identity = (over = {}) => ({
    corporationId: 99,
    ceoId: 1,
    roles: ['Accountant'],
    ...over,
  });
  const denied = { message: 'no role', reason: 'not-an-officer' };

  it('refuses a token without the roles scope, and never reads ESI', async () => {
    const readIdentity = vi.fn();
    const e = await caught(
      requireLiveRoles(
        { readIdentity },
        { characterId: 42, claims: claims({ scopes: [] }), accessToken: 't' },
        { need: 'canView', denied }
      )
    );
    expect(e.code).toBe('failed-precondition');
    expect(reasonOf(e)).toBe('missing-scope');
    expect(readIdentity).not.toHaveBeenCalled();
  });
  it('missing-scope runs onDenied once and always throws, never reading ESI', async () => {
    const onDenied = vi.fn(async () => undefined);
    const readIdentity = vi.fn();
    const e = await caught(
      requireLiveRoles(
        { readIdentity },
        { characterId: 42, claims: claims({ scopes: [] }), accessToken: 't' },
        { need: 'canView', denied, onDenied }
      )
    );
    expect(reasonOf(e)).toBe(DENY_REASON.missingScope);
    expect(onDenied).toHaveBeenCalledTimes(1);
    expect(onDenied).toHaveBeenCalledWith('missing-scope');
    expect(readIdentity).not.toHaveBeenCalled();
  });
  it('returns identity and decided roles', async () => {
    const readIdentity = vi.fn(async () => identity());
    const out = await requireLiveRoles({ readIdentity }, actor, {
      corporationId: 99,
      need: 'canEdit',
      denied,
    });
    expect(readIdentity).toHaveBeenCalledWith(42, 'tok');
    expect(out.roles.canEdit).toBe(true);
    expect(out.identity.corporationId).toBe(99);
  });
  it('the CEO passes without listed roles', async () => {
    const out = await requireLiveRoles(
      { readIdentity: async () => identity({ ceoId: 42, roles: [] }) },
      actor,
      { need: 'canEdit', denied }
    );
    expect(out.roles.isCeo).toBe(true);
  });
  it('refuses a different corporation: wrong-corp', async () => {
    const e = await caught(
      requireLiveRoles({ readIdentity: async () => identity() }, actor, {
        corporationId: 5,
        need: 'canView',
        denied,
      })
    );
    expect(e.code).toBe('permission-denied');
    expect(reasonOf(e)).toBe('wrong-corp');
  });
  it('skips the corporation check when none is named', async () => {
    await expect(
      requireLiveRoles({ readIdentity: async () => identity() }, actor, {
        need: 'canEdit',
        denied,
      })
    ).resolves.toBeDefined();
  });
  it('refuses a missing role with the caller message and reason', async () => {
    const e = await caught(
      requireLiveRoles(
        { readIdentity: async () => identity({ roles: ['Junior_Accountant'] }) },
        actor,
        { need: 'canEdit', denied }
      )
    );
    expect(e.code).toBe('permission-denied');
    expect(e.message).toBe('no role');
    expect(reasonOf(e)).toBe('not-an-officer');
  });
  it('runs onDenied(reason) before each refusal', async () => {
    const onDenied = vi.fn<(reason: string) => Promise<void>>(async () => undefined);
    await caught(
      requireLiveRoles({ readIdentity: async () => identity() }, actor, {
        corporationId: 5,
        need: 'canView',
        denied,
        onDenied,
      })
    );
    await caught(
      requireLiveRoles({ readIdentity: async () => identity({ roles: [] }) }, actor, {
        need: 'canView',
        denied,
        onDenied,
      })
    );
    await caught(
      requireLiveRoles(
        { readIdentity: vi.fn() },
        { characterId: 42, claims: claims({ scopes: [] }), accessToken: 't' },
        { need: 'canView', denied, onDenied }
      )
    );
    expect(onDenied.mock.calls.map((c) => c[0])).toEqual([
      'wrong-corp',
      'not-an-officer',
      'missing-scope',
    ]);
  });
  it('lets a readIdentity failure through untouched', async () => {
    const boom = new HttpsError('unavailable', 'esi', { reason: 'esi-error' });
    const e = await caught(
      requireLiveRoles(
        {
          readIdentity: async () => {
            throw boom;
          },
        },
        actor,
        { need: 'canView', denied }
      )
    );
    expect(e).toBe(boom);
  });
});

describe('assertOwnToken / requireRolesScope', () => {
  it('assertOwnToken passes the own Character and fails another owner', () => {
    expect(() => assertOwnToken(caller, 42, claims())).not.toThrow();
    expect(() => assertOwnToken(caller, 42, claims({ ownerHash: 'x' }))).toThrow(HttpsError);
  });
  it('requireRolesScope fails without the scope', () => {
    expect(() => requireRolesScope(claims())).not.toThrow();
    expect(() => requireRolesScope(claims({ scopes: [] }))).toThrow(HttpsError);
  });
});
