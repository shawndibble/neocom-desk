// "Add my other corps" against the Firestore emulator: the add and remove actions' logic.
// Runs only under `npm run test:rules` at the repo root; a plain `npm test` skips it.
import type { Caller } from './actorAuth.js';
import { beforeEach, expect, it } from 'vitest';
import { clearEmulator, emulatorDb as db, emulatorSuite } from './testSupport/emulator.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseTurnOnInput } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import { CORP_SYNC_GRANTS_COLLECTION } from './corpSyncGrant.js';
import { FEEDER_INVITES_COLLECTION } from './corpTaxBook.js';
import { FEEDER_SYNC_SCOPES } from './corpSyncScopes.js';
import { saveFeederGrant, type FeederGrantDeps } from './corpTaxBookFeederGrant.js';
import { createFeederInvite, type FeederRecord } from './corpTaxBookFeeders.js';
import { addOwnFeeder, removeOwnFeeder } from './corpTaxBookOwnFeeder.js';
import { turnOnBook, type BookDeps } from './corpTaxBookStore.js';
import type { EsiRead, SyncEsi } from './corpTaxBookSyncEsi.js';

const COLLECTOR = 98000001;
const FEEDER = 98000002;
const T0 = Date.parse('2026-10-18T12:00:00Z');
const KEY = Buffer.alloc(32, 7);
const COLLECTOR_CEO = 1;
const PLAYER = 11; // the signed-in player
const ALT = 12; // the Accountant alt that logs in for the mining scope
const FEEDER_NOBODY = 14;

let ledger: 'ok' | 'forbidden' | 'unavailable' = 'ok';
let now = T0;
/** Runs during the first pull's observer read: a concurrent write landing mid-save. */
let duringPull: (() => Promise<void>) | undefined;
const revoked: string[] = [];
const identities = new Map<number, CorpIdentity>();

const ok = <T>(data: T): EsiRead<T> => ({
  kind: 'ok',
  data,
  fetchedAt: new Date(T0).toISOString(),
  truncated: false,
});
/** The scopes a `mine-` token carries; a test may drop to the pre-#4654 mining scope only. */
let mineScopes: string[] = [...FEEDER_SYNC_SCOPES];
const esi = (): SyncEsi =>
  ({
    structure: async (id: number) => ({
      kind: 'ok',
      name: `Refinery ${id}`,
      solarSystemId: 30004000,
    }),
    observers: async () => {
      await duringPull?.();
      if (ledger === 'unavailable') return { kind: 'unavailable' };
      return ledger === 'forbidden' ? { kind: 'forbidden' } : ok([4001]);
    },
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
  now: () => now,
  key: () => KEY,
  verify: async (token) => {
    const m = /^(mine|roles)-(\d+)$/.exec(token);
    if (!m) throw new Error('bad token');
    const id = Number(m[2]);
    return {
      characterId: id,
      ownerHash: `h${id}`,
      name: `Pilot ${id}`,
      scopes: m[1] === 'mine' ? [...mineScopes] : [ROLES_SCOPE],
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
const collectorBook = () => db.collection('corps').doc(String(COLLECTOR));
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
const FEEDER_CEO = 16;
const OWN_FROM = '2026-10-10';

const add = (
  over: Record<string, unknown> = {},
  d: FeederGrantDeps = deps(),
  editor = COLLECTOR_CEO
) =>
  addOwnFeeder(d, who(editor), {
    corporationId: COLLECTOR,
    accessToken: `roles-${editor}`,
    grantAccessToken: `mine-${ALT}`,
    grantRefreshToken: `rt-${ALT}`,
    feederCorporationId: FEEDER,
    coverageFrom: OWN_FROM,
    ...over,
  });
const remove = (editor = COLLECTOR_CEO) =>
  removeOwnFeeder(deps(), who(editor), {
    corporationId: COLLECTOR,
    accessToken: `roles-${editor}`,
    feederCorporationId: FEEDER,
  });
const invites = async () =>
  (
    await db
      .collection(FEEDER_INVITES_COLLECTION)
      .where('collectorCorporationId', '==', COLLECTOR)
      .get()
  ).size;

emulatorSuite('add my other corps', () => {
  beforeEach(async () => {
    await clearEmulator();
    ledger = 'ok';
    mineScopes = [...FEEDER_SYNC_SCOPES];
    now = T0;
    duringPull = undefined;
    revoked.length = 0;
    identities.clear();
    identities.set(COLLECTOR_CEO, { corporationId: COLLECTOR, ceoId: COLLECTOR_CEO, roles: [] });
    identities.set(FEEDER_NOBODY, { corporationId: FEEDER, ceoId: null, roles: [] });
    identities.set(FEEDER_CEO, { corporationId: FEEDER, ceoId: FEEDER_CEO, roles: [] });
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

  it('adds an own corporation: backdated coverage, settled otherwise, no owner rate', async () => {
    expect(await add()).toEqual({
      collectorCorporationId: COLLECTOR,
      feederCorporationId: FEEDER,
      rejoined: false,
    });
    const rec = await feederRecord();
    expect(rec).toMatchObject({
      status: 'active',
      sameOwner: true,
      mode: 'settled-otherwise',
      modeChanges: [{ from: OWN_FROM, mode: 'settled-otherwise' }],
      coveragePeriods: [{ from: OWN_FROM }],
      grantHolder: ALT,
      grantedBy: COLLECTOR_CEO,
    });
    expect(rec?.ownerRateHistory).toBeUndefined();
    expect(rec?.offeredOwnerRatePct).toBeUndefined();
    expect(await grant()).toMatchObject({ kind: 'feeder', characterId: ALT });
    expect(await pointer()).toMatchObject({ collectorCorporationId: COLLECTOR });
  });

  it('starts today when no day is asked for, and clamps a day outside 30 days or the future', async () => {
    await add({ coverageFrom: undefined });
    expect((await feederRecord())?.coveragePeriods).toEqual([{ from: '2026-10-18' }]);
    await clearEmulator();
    // The book began on 2026-10-01, so a day before it clamps up to it.
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
    await add({ coverageFrom: '2026-08-01' });
    expect((await feederRecord())?.coveragePeriods).toEqual([{ from: '2026-10-01' }]);
  });

  it('a rejoin starts the day after the earlier period ended and keeps the flag', async () => {
    await add();
    await remove();
    expect(await add({ coverageFrom: '2026-10-12' })).toMatchObject({ rejoined: true });
    expect(await feederRecord()).toMatchObject({
      status: 'active',
      sameOwner: true,
      mode: 'settled-otherwise',
      coveragePeriods: [{ from: OWN_FROM, to: '2026-10-17' }, { from: '2026-10-18' }],
    });
  });

  it('refuses a caller who is not an editor of the book, and leaves nothing behind', async () => {
    const r = await reason(add({}, deps(), FEEDER_NOBODY));
    expect(r).toMatch(/wrong-corp|not-an-officer/);
    expect(await feederRecord()).toBeUndefined();
    expect(await invites()).toBe(0);
  });

  it('refuses a corporation that runs its own book', async () => {
    await turnOnBook(
      bookDeps(),
      who(FEEDER_CEO),
      parseTurnOnInput({
        corporationId: FEEDER,
        accessToken: `roles-${FEEDER_CEO}`,
        startDate: '2026-10-01',
        startRatePct: 10,
      })
    );
    expect(await reason(add())).toBe('own-book-exists');
    expect(await feederRecord()).toBeUndefined();
    expect(await grant()).toBeUndefined();
    expect(await invites()).toBe(0);
  });

  it('refuses a corporation that already feeds a book', async () => {
    await save(await newInvite());
    expect(await reason(add())).toBe('already-feeder');
    expect(await feederRecord()).toMatchObject({ sameOwner: undefined, mode: 'normal' });
    expect(await grant()).toMatchObject({ kind: 'feeder' });
  });

  it('unwinds everything when the ledger is refused', async () => {
    ledger = 'forbidden';
    expect(await reason(add())).toBe('not-an-accountant');
    expect(await feederRecord()).toBeUndefined();
    expect(await pointer()).toBeUndefined();
    expect(await grant()).toBeUndefined();
    expect(await invites()).toBe(0);
    expect(revoked.length).toBeGreaterThan(0);
  });

  it('refuses an alt who is in another corporation (wrong-corp) and revokes its token', async () => {
    const other = { ...deps(), lookupCorporation: async () => 98000099 };
    expect(await reason(add({}, other))).toBe('wrong-corp');
    expect(await feederRecord()).toBeUndefined();
    expect(await grant()).toBeUndefined();
    expect(await invites()).toBe(0);
    expect(revoked).toContain(`rt-${ALT}`);
  });

  it('removes an own corporation at once, keeping its record and coverage', async () => {
    await add();
    expect(await remove()).toEqual({ removed: true });
    expect(await feederRecord()).toMatchObject({
      status: 'removed',
      sameOwner: true,
      coveragePeriods: [{ from: OWN_FROM, to: '2026-10-17' }],
    });
    expect(await pointer()).toBeUndefined();
    expect(await grant()).toBeUndefined();
  });

  it('refuses to remove a moon owner that is not an own corporation (not-yours)', async () => {
    await save(await newInvite());
    expect(await reason(remove())).toBe('not-yours');
    expect(await feederRecord()).toMatchObject({ status: 'active' });
    expect(await grant()).toMatchObject({ kind: 'feeder' });
  });
});
