// Moon owner onboarding against the Firestore emulator (issue #4511, spec #4504).
// Runs only under `npm run test:rules` at the repo root; a plain `npm test` skips it.
import { beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseTurnOnInput } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import { CORP_SYNC_GRANTS_COLLECTION } from './corpSyncGrant.js';
import { FEEDER_SYNC_SCOPES } from './corpSyncScopes.js';
import {
  RECONNECT_CODE,
  getFeederStatus,
  leaveFeeder,
  saveFeederGrant,
  type FeederGrantDeps,
} from './corpTaxBookFeederGrant.js';
import { createFeederInvite, hashInviteCode, type FeederRecord } from './corpTaxBookFeeders.js';
import { turnOnBook, type BookDeps, type Caller } from './corpTaxBookStore.js';
import type { EsiRead, SyncEsi } from './corpTaxBookSyncEsi.js';

const COLLECTOR = 98000001;
const FEEDER = 98000002;
const T0 = Date.parse('2026-10-18T12:00:00Z');
const KEY = Buffer.alloc(32, 7);
const COLLECTOR_CEO = 1;
const PLAYER = 11; // the signed-in player
const ALT = 12; // the Accountant alt that logs in for the mining scope
const FEEDER_DIRECTOR = 13;
const FEEDER_NOBODY = 14;

const runnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runnable ? describe : describe.skip;

let db: Firestore;
let ledger: 'ok' | 'forbidden' = 'ok';
const revoked: string[] = [];
const identities = new Map<number, CorpIdentity>();

const ok = <T>(data: T): EsiRead<T> => ({
  kind: 'ok',
  data,
  fetchedAt: new Date(T0).toISOString(),
  truncated: false,
});
const esi = (): SyncEsi =>
  ({
    observers: async () => (ledger === 'forbidden' ? { kind: 'forbidden' } : ok([4001])),
    ledger: async () =>
      ok([
        {
          character_id: 900,
          recorded_corporation_id: 3,
          type_id: 45490,
          quantity: 100,
          last_updated: '2026-10-18',
        },
      ]),
    budgetLow: () => false,
  }) as unknown as SyncEsi;

const deps = (): FeederGrantDeps => ({
  db,
  now: () => T0,
  key: () => KEY,
  verify: async (token) => {
    const m = /^(mine|roles)-(\d+)$/.exec(token);
    if (!m) throw new Error('bad token');
    const id = Number(m[2]);
    return {
      characterId: id,
      ownerHash: `h${id}`,
      name: `Pilot ${id}`,
      scopes: m[1] === 'mine' ? [...FEEDER_SYNC_SCOPES] : [ROLES_SCOPE],
      clientId: 'c',
    };
  },
  refresh: async (_c, refreshToken) => {
    const id = Number(/^rt-(\d+)$/.exec(refreshToken)?.[1]);
    return { accessToken: `mine-${id}`, refreshToken };
  },
  revoke: async (_c, refreshToken) => {
    revoked.push(refreshToken);
  },
  readIdentity: async (id) => {
    const identity = identities.get(id);
    if (!identity) throw new Error('no identity');
    return identity;
  },
  log: () => undefined,
  esi: esi(),
  lookupCorporation: async () => FEEDER,
});
const bookDeps = (): BookDeps => {
  const d = deps();
  return { db, now: d.now, verifyToken: d.verify, readIdentity: d.readIdentity };
};
const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const collectorBook = () => db.collection('corpTaxBooks').doc(String(COLLECTOR));
const feederRecord = async () =>
  (await collectorBook().collection('feeders').doc(String(FEEDER)).get()).data() as
    FeederRecord | undefined;
const pointer = async () =>
  (await db.collection('corpTaxBookFeederOf').doc(String(FEEDER)).get()).data();
const grant = async () =>
  (await db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(FEEDER)).get()).data();

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return String(((err as HttpsError).details as { reason?: string } | undefined)?.reason);
  }
  throw new Error('expected the call to fail');
}

if (runnable) {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-neocom-rules' });
  db = getFirestore();
}

async function clearEmulator(): Promise<void> {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-neocom-rules/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

const newInvite = async () =>
  (
    await createFeederInvite(bookDeps(), who(COLLECTOR_CEO), {
      corporationId: COLLECTOR,
      accessToken: `roles-${COLLECTOR_CEO}`,
    })
  ).code;
const save = (code: string, requestedRatePct?: number, alt = ALT) =>
  saveFeederGrant(deps(), who(PLAYER), {
    code,
    accessToken: `mine-${alt}`,
    refreshToken: `rt-${alt}`,
    ...(requestedRatePct !== undefined ? { requestedRatePct } : {}),
  });
const OTHER_ALT = 15;

suite('moon owner onboarding', () => {
  beforeEach(async () => {
    await clearEmulator();
    ledger = 'ok';
    revoked.length = 0;
    identities.clear();
    identities.set(COLLECTOR_CEO, { corporationId: COLLECTOR, ceoId: COLLECTOR_CEO, roles: [] });
    identities.set(FEEDER_DIRECTOR, { corporationId: FEEDER, ceoId: null, roles: ['Director'] });
    identities.set(FEEDER_NOBODY, { corporationId: FEEDER, ceoId: null, roles: [] });
    await turnOnBook(
      bookDeps(),
      who(COLLECTOR_CEO),
      parseTurnOnInput({
        corporationId: COLLECTOR,
        accessToken: `roles-${COLLECTOR_CEO}`,
        startDate: '2026-10-01',
        startRatePct: 10,
      })
    );
  });

  it('accepts the invite, stores the grant and runs the first pull', async () => {
    const result = await save(await newInvite(), 6);
    expect(result).toEqual({
      collectorCorporationId: COLLECTOR,
      feederCorporationId: FEEDER,
      rejoined: false,
    });
    expect(await grant()).toMatchObject({ kind: 'feeder', characterId: ALT, grantedBy: PLAYER });
    expect(await feederRecord()).toMatchObject({
      status: 'active',
      requestedRatePct: 6,
      grantHolder: ALT,
    });
    expect((await collectorBook().collection('observed').get()).size).toBe(1);
  });

  it('unwinds a refused first pull and leaves the invite usable', async () => {
    const code = await newInvite();
    ledger = 'forbidden';
    expect(await reason(save(code, 6))).toBe('not-an-accountant');
    expect(await grant()).toBeUndefined();
    expect(await feederRecord()).toBeUndefined();
    expect(await pointer()).toBeUndefined();
    expect(revoked).toContain(`rt-${ALT}`);
    const invite = (
      await db.collection('corpTaxBookFeederInvites').doc(hashInviteCode(code)).get()
    ).data();
    expect(invite?.acceptedAt).toBeUndefined();
    ledger = 'ok';
    await save(code);
    expect((await feederRecord())?.requestedRatePct).toBeUndefined();
  });

  it('refuses a token that carries the roles scope', async () => {
    const code = await newInvite();
    expect(
      await reason(
        saveFeederGrant(deps(), who(PLAYER), {
          code,
          accessToken: `roles-${ALT}`,
          refreshToken: `rt-${ALT}`,
        })
      )
    ).toBe('missing-scope');
  });

  it('leave: the director ends it, coverage closes and the token is revoked', async () => {
    await save(await newInvite());
    const out = await leaveFeeder(deps(), who(FEEDER_DIRECTOR), {
      corporationId: FEEDER,
      accessToken: `roles-${FEEDER_DIRECTOR}`,
    });
    expect(out).toEqual({ left: true, owedIsk: null });
    expect(await grant()).toBeUndefined();
    expect(await pointer()).toBeUndefined();
    expect(await feederRecord()).toMatchObject({ status: 'left', leftAt: T0 });
    expect(revoked).toContain(`rt-${ALT}`);
  });

  it('leave: the stale spell and the dismissed history do not outlive the feed', async () => {
    await save(await newInvite());
    await collectorBook()
      .collection('feeders')
      .doc(String(FEEDER))
      .update({ staleSince: T0 - 1000, disconnectedAt: T0 - 500, viewDismissedAt: T0 - 100 });
    await leaveFeeder(deps(), who(FEEDER_DIRECTOR), {
      corporationId: FEEDER,
      accessToken: `roles-${FEEDER_DIRECTOR}`,
    });
    const record = await feederRecord();
    for (const gone of ['staleSince', 'disconnectedAt', 'lastSyncResult', 'viewDismissedAt']) {
      expect(record).not.toHaveProperty(gone);
    }
  });

  it('reconnect: the new grant replaces the old one, which is revoked', async () => {
    await save(await newInvite());
    revoked.length = 0;
    await save(RECONNECT_CODE, undefined, OTHER_ALT);
    expect(await grant()).toMatchObject({ kind: 'feeder', characterId: OTHER_ALT });
    expect(revoked).toEqual([`rt-${ALT}`]);
  });

  it('reconnect: a refused first pull puts the earlier grant back', async () => {
    await save(await newInvite());
    revoked.length = 0;
    ledger = 'forbidden';
    expect(await reason(save(RECONNECT_CODE, undefined, OTHER_ALT))).toBe('not-an-accountant');
    expect(await grant()).toMatchObject({ kind: 'feeder', characterId: ALT });
    expect(revoked).toContain(`rt-${OTHER_ALT}`);
    expect(revoked).not.toContain(`rt-${ALT}`);
  });

  it('a refused rejoin of a disconnected moon owner keeps it pointed at its book', async () => {
    await save(await newInvite());
    await collectorBook()
      .collection('feeders')
      .doc(String(FEEDER))
      .update({
        status: 'disconnected',
        coveragePeriods: [{ from: '2026-10-01', to: '2026-10-10' }],
      });
    // A disconnect drops the grant.
    await db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(FEEDER)).delete();
    const code = await newInvite();
    ledger = 'forbidden';
    expect(await reason(save(code))).toBe('not-an-accountant');
    expect(await pointer()).toMatchObject({ collectorCorporationId: COLLECTOR });
    expect((await feederRecord())?.status).toBe('disconnected');
    // With a grant that reads, the same link takes it back as a new coverage period.
    ledger = 'ok';
    expect(await save(code)).toMatchObject({ rejoined: true });
    const record = await feederRecord();
    expect(record).toMatchObject({
      status: 'active',
      coveragePeriods: [{ from: '2026-10-01', to: '2026-10-10' }, { from: '2026-10-18' }],
    });
    expect(record).not.toHaveProperty('disconnectedAt');
  });

  it("status: after leaving, the earliest start of the corporation's own book, for its members only", async () => {
    await save(await newInvite());
    const call = { corporationId: FEEDER, accessToken: `roles-${FEEDER_DIRECTOR}` };
    await leaveFeeder(deps(), who(FEEDER_DIRECTOR), call);
    expect(await getFeederStatus(deps(), who(FEEDER_DIRECTOR), call)).toEqual({
      status: 'none',
      ownBookFrom: '2026-10-18',
      previousCollectorIds: [COLLECTOR],
    });
    expect(
      await getFeederStatus(deps(), who(COLLECTOR_CEO), {
        corporationId: FEEDER,
        accessToken: `roles-${COLLECTOR_CEO}`,
      })
    ).toEqual({ status: 'none' });
  });

  it('leave: someone without standing is refused', async () => {
    await save(await newInvite());
    expect(
      await reason(
        leaveFeeder(deps(), who(FEEDER_NOBODY), {
          corporationId: FEEDER,
          accessToken: `roles-${FEEDER_NOBODY}`,
        })
      )
    ).toBe('not-your-feeder');
  });

  it('status: none for a corporation that is not a feeder, details for one that is', async () => {
    const call = { corporationId: FEEDER, accessToken: `roles-${FEEDER_DIRECTOR}` };
    expect(await getFeederStatus(deps(), who(FEEDER_DIRECTOR), call)).toEqual({ status: 'none' });
    await save(await newInvite(), 6);
    expect(await getFeederStatus(deps(), who(FEEDER_DIRECTOR), call)).toMatchObject({
      status: 'feeder',
      collectorCorporationId: COLLECTOR,
      feederStatus: 'active',
      requestedRatePct: 6,
      effectiveRatePct: 6,
      isHolder: false,
      refineries: [{ structureId: 4001, volume: 100 }],
    });
  });
});
