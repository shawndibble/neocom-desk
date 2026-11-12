// Sync now for moon owners (issue #6117) against the Firestore emulator.
// Runs only under `npm run test:rules` at the repo root; a plain `npm test` skips it.
import type { Caller } from './actorAuth.js';
import { beforeEach, expect, it } from 'vitest';
import { clearEmulator, emulatorDb as db, emulatorSuite } from './testSupport/emulator.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseTurnOnInput } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import type { EsiExtractionLike } from './corpTaxBookSyncEngine.js';
import { FEEDER_SYNC_SCOPES } from './corpSyncScopes.js';
import type { FeederGrantDeps } from './corpTaxBookFeederGrant.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';
import { addOwnFeeder, removeOwnFeeder } from './corpTaxBookOwnFeeder.js';
import {
  MOON_OWNERS_SYNC_NOW_REST_MS,
  parseSyncMoonOwnersNowInput,
  syncMoonOwnersNow,
} from './corpTaxBookMoonOwnersSyncNow.js';
import { turnOnBook, type BookDeps } from './corpTaxBookStore.js';
import type { EsiRead, SyncEsi } from './corpTaxBookSyncEsi.js';

const COLLECTOR = 98000001;
const FEEDER_A = 98000002;
const FEEDER_B = 98000003;
const T0 = Date.parse('2026-10-18T12:00:00Z');
const KEY = Buffer.alloc(32, 7);
const COLLECTOR_CEO = 1;
const OUTSIDER = 14;
/** One CEO alt per moon owner: the alt's id picks its corporation. */
const ALT_OF = { [FEEDER_A]: 12, [FEEDER_B]: 13 } as Record<number, number>;
const CORP_OF_ALT = new Map(Object.entries(ALT_OF).map(([corp, alt]) => [alt, Number(corp)]));

let now = T0;
const calls: string[] = [];
const extractions = new Map<number, EsiExtractionLike[]>();
const noObservers = new Set<number>();
/** Runs inside each observer read: lets a test make a pull slow. */
let duringPull: (() => void) | undefined;
const identities = new Map<number, CorpIdentity>();

const ok = <T>(data: T): EsiRead<T> => ({
  kind: 'ok',
  data,
  fetchedAt: new Date(now).toISOString(),
  truncated: false,
});
const esi = (): SyncEsi =>
  ({
    structure: async (id: number) => ({ kind: 'ok', name: `Refinery ${id}`, solarSystemId: 1 }),
    observers: async (corp: number) => {
      calls.push(`observers:${corp}`);
      duringPull?.();
      return ok(noObservers.has(corp) ? [] : [corp + 1000]);
    },
    ledger: async (corp: number) => {
      calls.push(`ledger:${corp}`);
      return ok([
        {
          character_id: 900,
          recorded_corporation_id: 3,
          type_id: 45490,
          quantity: 100,
          last_updated: '2026-10-18',
        },
      ]);
    },
    extractions: async (corp: number) => {
      calls.push(`extractions:${corp}`);
      return ok(extractions.get(corp) ?? []);
    },
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
      scopes: m[1] === 'mine' ? [...FEEDER_SYNC_SCOPES] : [ROLES_SCOPE],
      clientId: 'c',
    };
  },
  refresh: async (_c, refreshToken) => {
    const id = Number(/^rt-(\d+)$/.exec(refreshToken)?.[1]);
    return { accessToken: `mine-${id}`, refreshToken };
  },
  revoke: async () => undefined,
  readIdentity: async (id) => {
    const identity = identities.get(id);
    if (!identity) throw new Error('no identity');
    return identity;
  },
  log: () => undefined,
  esi: esi(),
  lookupCorporation: async (characterId: number) => CORP_OF_ALT.get(characterId) ?? 0,
});
const bookDeps = (): BookDeps => {
  const d = deps();
  return { db, now: d.now, verifyToken: d.verify, readIdentity: d.readIdentity };
};
const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const collectorBook = () => db.collection('corps').doc(String(COLLECTOR));
const feederRecord = async (corp: number) =>
  (await collectorBook().collection('feeders').doc(String(corp)).get()).data() as
    FeederRecord | undefined;
const storedExtractions = async () =>
  (await collectorBook().collection('extractions').get()).docs.map((d) => d.data());

const add = (corp: number) =>
  addOwnFeeder(deps(), who(COLLECTOR_CEO), {
    corporationId: COLLECTOR,
    accessToken: `roles-${COLLECTOR_CEO}`,
    grantAccessToken: `mine-${ALT_OF[corp]}`,
    grantRefreshToken: `rt-${ALT_OF[corp]}`,
    feederCorporationId: corp,
  });
const syncNow = (caller = COLLECTOR_CEO) =>
  syncMoonOwnersNow(
    deps(),
    who(caller),
    parseSyncMoonOwnersNowInput({ corporationId: COLLECTOR, accessToken: `roles-${caller}` })
  );

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return String(((err as HttpsError).details as { reason?: string } | undefined)?.reason);
  }
  throw new Error('expected the call to fail');
}

const CHUNK: EsiExtractionLike = {
  structure_id: 7001,
  moon_id: 40000001,
  extraction_start_time: '2026-10-10T00:00:00Z',
  chunk_arrival_time: '2026-10-24T00:00:00Z',
  natural_decay_time: '2026-10-24T03:00:00Z',
};

emulatorSuite('sync moon owners now', () => {
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    calls.length = 0;
    extractions.clear();
    noObservers.clear();
    duringPull = undefined;
    identities.clear();
    identities.set(COLLECTOR_CEO, { corporationId: COLLECTOR, ceoId: COLLECTOR_CEO, roles: [] });
    identities.set(OUTSIDER, { corporationId: FEEDER_A, ceoId: null, roles: [] });
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

  it("a join's first pull already stores a moon owner's chunk before anyone mines there", async () => {
    noObservers.add(FEEDER_A);
    extractions.set(FEEDER_A, [CHUNK]);
    await add(FEEDER_A);
    expect(await feederRecord(FEEDER_A)).toMatchObject({ status: 'active' });
    expect(await storedExtractions()).toMatchObject([
      { structureId: 7001, sourceCorporationId: FEEDER_A },
    ]);
  });

  it('pulls every moon owner at once, without waiting for the schedule', async () => {
    await add(FEEDER_A);
    await add(FEEDER_B);
    calls.length = 0;
    extractions.set(FEEDER_B, [CHUNK]);
    expect(await syncNow()).toEqual({ kind: 'synced', read: 2, stale: 0, skipped: 0 });
    expect(calls).toEqual(
      expect.arrayContaining([`observers:${FEEDER_A}`, `observers:${FEEDER_B}`])
    );
    expect(await storedExtractions()).toMatchObject([
      { structureId: 7001, sourceCorporationId: FEEDER_B },
    ]);
  });

  it('a second press inside the rest says when it can run again, and runs after it', async () => {
    await add(FEEDER_A);
    await syncNow();
    calls.length = 0;
    now = T0 + 60_000;
    expect(await syncNow()).toEqual({
      kind: 'rate-limited',
      retryAt: T0 + MOON_OWNERS_SYNC_NOW_REST_MS,
    });
    expect(calls).toEqual([]);
    now = T0 + MOON_OWNERS_SYNC_NOW_REST_MS;
    expect(await syncNow()).toMatchObject({ kind: 'synced', read: 1 });
  });

  it('refuses a caller who cannot edit the book, and takes no slot from its editors', async () => {
    await add(FEEDER_A);
    calls.length = 0;
    expect(await reason(syncNow(OUTSIDER))).toMatch(/wrong-corp|not-an-officer/);
    expect(calls).toEqual([]);
    expect(await syncNow()).toMatchObject({ kind: 'synced', read: 1 });
  });

  it('leaves out a moon owner that was removed', async () => {
    await add(FEEDER_A);
    await add(FEEDER_B);
    await removeOwnFeeder(deps(), who(COLLECTOR_CEO), {
      corporationId: COLLECTOR,
      accessToken: `roles-${COLLECTOR_CEO}`,
      feederCorporationId: FEEDER_B,
    });
    calls.length = 0;
    expect(await syncNow()).toEqual({ kind: 'synced', read: 1, stale: 0, skipped: 0 });
    expect(calls.some((c) => c.endsWith(`:${FEEDER_B}`))).toBe(false);
  });

  it('starts no new pull once the call is near its time limit; the schedule reads the rest', async () => {
    await add(FEEDER_A);
    await add(FEEDER_B);
    calls.length = 0;
    duringPull = () => {
      now += 100_000;
    };
    expect(await syncNow()).toEqual({ kind: 'synced', read: 1, stale: 0, skipped: 1 });
    expect(calls.filter((c) => c.startsWith('observers:'))).toHaveLength(1);
  });

  it('needs the editor token', () => {
    expect(() => parseSyncMoonOwnersNowInput({ corporationId: COLLECTOR })).toThrow();
  });
});
