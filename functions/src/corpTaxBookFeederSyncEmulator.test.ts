// The scheduled feeder pass against the Firestore emulator (issue #4509, spec #4504).
// Runs only under `npm run test:rules` at the repo root; a plain `npm test` skips it.
import { beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { SsoRefreshError } from './alertGrant.js';
import { encryptRefreshToken } from './alertGrantCrypto.js';
import {
  CORP_SYNC_GRANTS_COLLECTION,
  runScheduledCorpSyncs,
  type CorpSyncDeps,
  type CorpSyncGrantDoc,
} from './corpSyncGrant.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';
import type { EsiRead, SyncEsi } from './corpTaxBookSyncEsi.js';

const COLLECTOR = 98000001;
const T0 = Date.parse('2026-10-18T12:00:00Z');
const DAY = 24 * 3_600_000;
const KEY = Buffer.alloc(32, 7);

const runnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runnable ? describe : describe.skip;

let db: Firestore;
let now = T0;
const dead = new Set<string>();
const revokedAtSso: string[] = [];

const ok = <T>(data: T): EsiRead<T> => ({
  kind: 'ok',
  data,
  fetchedAt: new Date(T0).toISOString(),
  truncated: false,
});

interface FakeEsi {
  /** Per feeder corporation: how its ledger answers. Default `ok`. */
  mode: Map<number, 'ok' | 'forbidden' | 'throw'>;
  calls: string[];
}
let esiState: FakeEsi;

const fakeEsi = (): SyncEsi => ({
  observers: async (corp) => {
    esiState.calls.push(`observers:${corp}`);
    const mode = esiState.mode.get(corp) ?? 'ok';
    if (mode === 'throw') throw new Error('boom');
    return mode === 'forbidden' ? { kind: 'forbidden' } : ok([corp * 10]);
  },
  ledger: async (corp) => {
    esiState.calls.push(`ledger:${corp}`);
    return ok([
      {
        character_id: 900,
        recorded_corporation_id: 3,
        type_id: 45490,
        quantity: 100,
        last_updated: '2026-10-17',
      },
    ]) as never;
  },
  extractions: async () => (esiState.calls.push('extractions'), ok([])),
  notifications: async () => (esiState.calls.push('notifications'), ok([])),
  journal: async () => (esiState.calls.push('journal'), ok([])),
  structureSystem: async () => (esiState.calls.push('system'), ok(1)),
  budgetLow: () => false,
});

const syncDeps = (): CorpSyncDeps => ({
  db,
  now: () => now,
  key: () => KEY,
  verify: async () => {
    throw new Error('not used for feeders');
  },
  refresh: async (_clientId, refreshToken) => {
    const match = /^rt-(\d+)-(\d+)$/.exec(refreshToken);
    if (!match || dead.has(refreshToken)) throw new SsoRefreshError(400, true);
    return { accessToken: `at-${match[1]}`, refreshToken };
  },
  revoke: async (_clientId, refreshToken) => {
    revokedAtSso.push(refreshToken);
  },
  readIdentity: async () => {
    throw new Error('a feeder run never reads identity');
  },
  log: () => undefined,
});

const collectorBook = () => db.collection('corpTaxBooks').doc(String(COLLECTOR));
const feederDoc = (corp: number) => collectorBook().collection('feeders').doc(String(corp));
const feederRecord = async (corp: number) =>
  (await feederDoc(corp).get()).data() as FeederRecord | undefined;
const grantDoc = async (corp: number) =>
  (await db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(corp)).get()).data();
const observedRows = async () =>
  (await collectorBook().collection('observed').get()).docs.map((d) => d.data());

async function clearEmulator(): Promise<void> {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-neocom-rules/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

async function addFeeder(
  corp: number,
  over: Partial<FeederRecord> = {},
  withGrant = true
): Promise<string> {
  const holder = corp + 1000;
  const token = `rt-${holder}-0`;
  await feederDoc(corp).set({
    corporationId: corp,
    status: 'active',
    invitedBy: 1,
    joinedAt: T0 - 40 * DAY,
    mode: 'normal',
    coveragePeriods: [{ from: '2026-08-01' }],
    grantHolder: holder,
    ...over,
  });
  await db
    .collection('corpTaxBookFeederOf')
    .doc(String(corp))
    .set({ collectorCorporationId: COLLECTOR, since: T0 - 40 * DAY });
  if (withGrant) {
    const grant: CorpSyncGrantDoc = {
      corporationId: corp,
      characterId: holder,
      characterName: `Pilot ${holder}`,
      encryptedRefreshToken: encryptRefreshToken(token, holder, KEY, 'corpSyncGrant'),
      clientId: 'client-1',
      enabledAt: T0 - 40 * DAY,
      kind: 'feeder',
      collectorCorporationId: COLLECTOR,
    };
    await db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(corp)).set(grant);
  }
  return token;
}

if (runnable) {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-neocom-rules' });
  db = getFirestore();
}

const run = () => runScheduledCorpSyncs(syncDeps(), fakeEsi(), { sleep: async () => undefined });

suite('scheduled feeder pass (emulator)', () => {
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    dead.clear();
    revokedAtSso.length = 0;
    esiState = { mode: new Map(), calls: [] };
    await collectorBook().set({
      active: true,
      startDate: '2026-08-01',
      lastSync: { at: T0 - 3_600_000, gaps: [] },
    });
  });

  it('reads a feeder’s ledger, tags the rows, and leaves the book’s own sync alone', async () => {
    await addFeeder(98000002);
    const summary = await run();
    expect(summary.feeders).toEqual({ read: 1, stale: 0, skipped: 0, disconnected: 0 });
    expect(await observedRows()).toMatchObject([
      { sourceCorporationId: 98000002, structureId: 980000020 },
    ]);
    const rec = await feederRecord(98000002);
    expect(rec).toMatchObject({
      lastReadWellAt: T0,
      lastSyncResult: { at: T0, outcome: 'synced' },
    });
    expect(rec?.staleSince).toBeUndefined();
    expect((await collectorBook().get()).get('lastSync')).toEqual({ at: T0 - 3_600_000, gaps: [] });
  });

  it('only reads the observer list and ledgers: nothing the ledger-only grant cannot reach', async () => {
    await addFeeder(98000002);
    await run();
    expect(esiState.calls.filter((c) => !/^(observers|ledger)/.test(c))).toEqual([]);
  });

  it('a 403 marks the feeder stale, keeps its token, and the next good read clears it', async () => {
    await addFeeder(98000002, { lastReadWellAt: T0 - DAY });
    esiState.mode.set(98000002, 'forbidden');
    expect((await run()).feeders).toMatchObject({ stale: 1 });
    expect(await feederRecord(98000002)).toMatchObject({
      status: 'active',
      lastReadWellAt: T0 - DAY,
      staleSince: T0,
      lastSyncResult: { outcome: 'stale', reason: 'esi-refused' },
    });
    expect(await grantDoc(98000002)).toBeDefined();
    expect(await observedRows()).toEqual([]);

    now = T0 + 6 * 3_600_000;
    esiState.mode.set(98000002, 'ok');
    await run();
    const rec = await feederRecord(98000002);
    expect(rec?.staleSince).toBeUndefined();
    expect(rec?.lastReadWellAt).toBe(now);
  });

  it('keeps the original stale date across repeated refusals', async () => {
    await addFeeder(98000002);
    esiState.mode.set(98000002, 'forbidden');
    await run();
    now += 6 * 3_600_000;
    await run();
    expect((await feederRecord(98000002))?.staleSince).toBe(T0);
  });

  it('a revoked token drops the token doc and leaves the feeder stale', async () => {
    const token = await addFeeder(98000002);
    dead.add(token);
    await run();
    expect(await grantDoc(98000002)).toBeUndefined();
    expect(revokedAtSso).toEqual([]);
    expect(await feederRecord(98000002)).toMatchObject({
      status: 'active',
      staleSince: T0,
      lastSyncResult: { outcome: 'stale', reason: 'token-revoked' },
    });
  });

  it('with no grant doc at all the clock still runs, and 30 days stale disconnects', async () => {
    await addFeeder(98000002, { lastReadWellAt: Date.parse('2026-09-10T08:00:00Z') }, false);
    await run();
    expect(await feederRecord(98000002)).toMatchObject({ status: 'active', staleSince: T0 });
    now = T0 + 30 * DAY;
    const summary = await run();
    expect(summary.feeders.disconnected).toBe(1);
    expect(await feederRecord(98000002)).toMatchObject({
      status: 'disconnected',
      disconnectedAt: now,
      coveragePeriods: [{ from: '2026-08-01', to: '2026-09-09' }],
    });
  });

  it('disconnect deletes nothing: rows, balance and the pointer stay; the token goes', async () => {
    await addFeeder(98000002, { lastReadWellAt: Date.parse('2026-09-10T08:00:00Z') });
    await run();
    expect(await observedRows()).toHaveLength(1);
    esiState.mode.set(98000002, 'forbidden');
    now = T0 + 31 * DAY;
    await feederDoc(98000002).update({ staleSince: T0 });
    await run();
    expect((await feederRecord(98000002))?.status).toBe('disconnected');
    expect(await observedRows()).toHaveLength(1);
    expect(await grantDoc(98000002)).toBeUndefined();
    expect((await db.collection('corpTaxBookFeederOf').doc('98000002').get()).exists).toBe(true);
    const audit = (await collectorBook().collection('audit').get()).docs.map((d) =>
      d.get('action')
    );
    expect(audit).toContain('feederDisconnected');
  });

  it('a disconnected feeder is no longer read', async () => {
    await addFeeder(98000002, { status: 'disconnected' });
    await run();
    expect(esiState.calls).toEqual([]);
  });

  it('a feeder that left or was removed is no longer read', async () => {
    await addFeeder(98000002, { status: 'left' });
    await addFeeder(98000003, { status: 'removed' });
    await run();
    expect(esiState.calls).toEqual([]);
  });

  it('one feeder throwing never stops the others', async () => {
    await addFeeder(98000002);
    await addFeeder(98000003);
    esiState.mode.set(98000002, 'throw');
    const summary = await run();
    expect(summary.feeders).toMatchObject({ read: 1, skipped: 1 });
    expect((await feederRecord(98000003))?.lastReadWellAt).toBe(T0);
  });

  it('a 403 storm stops reading further feeders this run, but their clocks still run', async () => {
    const corps = [98000010, 98000011, 98000012, 98000013, 98000014, 98000015, 98000016];
    for (const corp of corps) {
      await addFeeder(corp);
      esiState.mode.set(corp, 'forbidden');
    }
    await run();
    expect(esiState.calls.filter((c) => c.startsWith('observers'))).toHaveLength(5);
    for (const corp of corps.slice(5)) {
      expect(await feederRecord(corp)).toMatchObject({
        lastSyncResult: { outcome: 'skipped', reason: 'esi-backoff' },
      });
    }
  });

  it('runs a feeder after the books, and a book with no grant is unaffected', async () => {
    await addFeeder(98000002);
    const summary = await run();
    expect(summary.grants).toBe(0);
    expect(summary.feeders.read).toBe(1);
  });
});
