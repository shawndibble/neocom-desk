// The scheduled feeder pass against the Firestore emulator (issue #4509, spec #4504).
// Runs only under `npm run test:rules` at the repo root; a plain `npm test` skips it.
import { beforeEach, expect, it } from 'vitest';
import { clearEmulator, emulatorDb, emulatorSuite } from './testSupport/emulator.js';
import { SsoRefreshError } from './alertGrant.js';
import { encryptRefreshToken } from './alertGrantCrypto.js';
import {
  CORP_SYNC_GRANTS_COLLECTION,
  runScheduledCorpSyncs,
  type CorpSyncDeps,
  type CorpSyncGrantDoc,
} from './corpSyncGrant.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';
import type { EsiRead, StructureLookup, SyncEsi } from './corpTaxBookSyncEsi.js';

const COLLECTOR = 98000001;
const T0 = Date.parse('2026-10-18T12:00:00Z');
const DAY = 24 * 3_600_000;
const KEY = Buffer.alloc(32, 7);

const db = emulatorDb;
let now = T0;
const dead = new Set<string>();
/** SSO hands back the next token (`rt-H-n` → `rt-H-n+1`) instead of the same one. */
let rotate = false;
/** Runs while SSO is redeeming a token: a re-grant or a concurrent run landing mid-refresh. */
let duringRefresh: (() => Promise<void>) | undefined;
const revokedAtSso: string[] = [];

const ok = <T>(data: T): EsiRead<T> => ({
  kind: 'ok',
  data,
  fetchedAt: new Date(T0).toISOString(),
  truncated: false,
});

interface FakeEsi {
  /** Per feeder corporation: how its ledger answers. Default `ok`. */
  mode: Map<number, 'ok' | 'forbidden' | 'throw' | 'unavailable'>;
  /** Per structure id: how its `/universe/structures` lookup answers. Default a name. */
  structure: Map<number, StructureLookup>;
  calls: string[];
}
let esiState: FakeEsi;

const fakeEsi = (): SyncEsi => ({
  observers: async (corp) => {
    esiState.calls.push(`observers:${corp}`);
    const mode = esiState.mode.get(corp) ?? 'ok';
    if (mode === 'throw') throw new Error('boom');
    if (mode === 'unavailable') return { kind: 'unavailable' };
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
  structure: async (id) => {
    esiState.calls.push(`structure:${id}`);
    return (
      esiState.structure.get(id) ?? { kind: 'ok', name: `Refinery ${id}`, solarSystemId: 30004000 }
    );
  },
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
    await duringRefresh?.();
    const next = rotate ? `rt-${match[1]}-${Number(match[2]) + 1}` : refreshToken;
    return { accessToken: `at-${match[1]}`, refreshToken: next };
  },
  revoke: async (_clientId, refreshToken) => {
    revokedAtSso.push(refreshToken);
  },
  readIdentity: async () => {
    throw new Error('a feeder run never reads identity');
  },
  log: () => undefined,
});

const collectorBook = () => db.collection('corps').doc(String(COLLECTOR));
const feederDoc = (corp: number) => collectorBook().collection('feeders').doc(String(corp));
const feederRecord = async (corp: number) =>
  (await feederDoc(corp).get()).data() as FeederRecord | undefined;
const grantDoc = async (corp: number) =>
  (await db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(corp)).get()).data();
const observedRows = async () =>
  (await collectorBook().collection('observed').get()).docs.map((d) => d.data());

async function addFeeder(
  corp: number,
  over: Partial<FeederRecord> = {},
  withGrant = true,
  grantOver: Partial<CorpSyncGrantDoc> = {}
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
      ...grantOver,
    };
    await db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(corp)).set(grant);
  }
  return token;
}

const run = () => runScheduledCorpSyncs(syncDeps(), fakeEsi(), { sleep: async () => undefined });

emulatorSuite('scheduled feeder pass (emulator)', () => {
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    dead.clear();
    rotate = false;
    duringRefresh = undefined;
    revokedAtSso.length = 0;
    esiState = { mode: new Map(), structure: new Map(), calls: [] };
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

  it('a grant from before, with the mining scope only, syncs, is not stale, and looks nothing up (#4654)', async () => {
    await addFeeder(98000002);
    expect((await run()).feeders).toMatchObject({ read: 1, stale: 0 });
    const rec = await feederRecord(98000002);
    expect(rec?.staleSince).toBeUndefined();
    expect(rec?.lastSyncResult?.outcome).toBe('synced');
    expect(rec?.refineryStructures).toBeUndefined();
    expect(rec?.readsStructureNames).toBe(false);
    expect(esiState.calls.filter((c) => c.startsWith('structure'))).toEqual([]);
  });

  it('a grant with the structure scope keeps each refinery name and system on the record (#4654)', async () => {
    await addFeeder(98000002, { refinerySystems: { '980000020': 30002187 } }, true, {
      readsStructures: true,
    });
    await run();
    const rec = await feederRecord(98000002);
    expect(rec?.readsStructureNames).toBe(true);
    expect(rec?.refineryStructures).toEqual({
      '980000020': { name: 'Refinery 980000020', solarSystemId: 30004000, checkedAt: T0 },
    });
    // The view carries both (no prices reader here, so its build is covered by buildFeederView's tests).
  });

  it('looks a refinery up only when needed: not again within the week, again after it (#4654)', async () => {
    await addFeeder(98000002, {}, true, { readsStructures: true });
    await run();
    now += 6 * 3_600_000;
    esiState.calls = [];
    await run();
    expect(esiState.calls.filter((c) => c.startsWith('structure'))).toEqual([]);
    now = T0 + 8 * DAY;
    await run();
    expect(esiState.calls.filter((c) => c.startsWith('structure'))).toEqual([
      'structure:980000020',
    ]);
    expect((await feederRecord(98000002))?.refineryStructures?.['980000020']?.checkedAt).toBe(now);
  });

  it.each([
    ['403', 98000002],
    ['404', 98000003],
  ])(
    'a %s is remembered, not retried each run, and never marks the moon owner stale (#4654)',
    async (_s, corp) => {
      await addFeeder(corp, {}, true, { readsStructures: true });
      esiState.structure.set(corp * 10, { kind: 'denied' });
      await run();
      now += 6 * 3_600_000;
      await run();
      expect(esiState.calls.filter((c) => c.startsWith('structure'))).toEqual([
        `structure:${corp * 10}`,
      ]);
      const rec = await feederRecord(corp);
      expect(rec?.refineryStructures?.[String(corp * 10)]).toEqual({ checkedAt: T0, denied: true });
      expect(rec?.staleSince).toBeUndefined();
      expect(rec?.lastSyncResult?.outcome).toBe('synced');
    }
  );

  it('an unanswered or rate-limited lookup is not kept and never touches the moon owner health (#4654)', async () => {
    await addFeeder(98000002, {}, true, { readsStructures: true });
    esiState.structure.set(980000020, { kind: 'backoff' });
    expect((await run()).feeders).toMatchObject({ read: 1, stale: 0 });
    const rec = await feederRecord(98000002);
    expect(rec?.refineryStructures).toBeUndefined();
    expect(rec?.staleSince).toBeUndefined();
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

  it('a disconnect during a pending removal clears the removal and deletes its link (#4621)', async () => {
    await addFeeder(
      98000002,
      {
        status: 'pending-removal',
        lastReadWellAt: Date.parse('2026-09-10T08:00:00Z'),
        staleSince: T0,
        removal: { startedAt: T0, startedBy: 1, startedByName: 'Officer' },
        removalLinkId: 'link-hash',
      },
      false
    );
    const link = db.collection('corpTaxBookRemovalLinks').doc('link-hash');
    await link.set({
      collectorCorporationId: COLLECTOR,
      feederCorporationId: 98000002,
      startedAt: T0,
      expiresAt: T0 + 2 * DAY,
    });
    now = T0 + 30 * DAY;
    await run();
    const rec = await feederRecord(98000002);
    expect(rec?.status).toBe('disconnected');
    expect(rec?.removal).toBeUndefined();
    expect(rec?.removalLinkId).toBeUndefined();
    expect((await link.get()).exists).toBe(false);
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

  it('revokes a rotated token it could not store because a re-grant replaced the grant (S5)', async () => {
    await addFeeder(98000002);
    rotate = true;
    duringRefresh = async () => {
      const grant = (await grantDoc(98000002)) as CorpSyncGrantDoc;
      await db
        .collection(CORP_SYNC_GRANTS_COLLECTION)
        .doc('98000002')
        .set({
          ...grant,
          encryptedRefreshToken: encryptRefreshToken(
            'rt-98001002-7',
            98001002,
            KEY,
            'corpSyncGrant'
          ),
        });
    };
    await run();
    // The rotated token is live at SSO and stored nowhere: it goes.
    expect(revokedAtSso).toEqual(['rt-98001002-1']);
  });

  it('never revokes a rotated token the grant now holds (a concurrent run stored it)', async () => {
    await addFeeder(98000002);
    rotate = true;
    duringRefresh = async () => {
      const grant = (await grantDoc(98000002)) as CorpSyncGrantDoc;
      await db
        .collection(CORP_SYNC_GRANTS_COLLECTION)
        .doc('98000002')
        .set({
          ...grant,
          encryptedRefreshToken: encryptRefreshToken(
            'rt-98001002-1',
            98001002,
            KEY,
            'corpSyncGrant'
          ),
        });
    };
    await run();
    expect(revokedAtSso).toEqual([]);
  });

  it('rebuilds the view only when a read moved something it shows (B5)', async () => {
    await addFeeder(98000002);
    const coverage = collectorBook().collection('feederCoverage').doc('98000002');
    await run();
    expect((await coverage.get()).exists).toBe(true);

    // A skip moves nothing the view shows.
    await coverage.delete();
    esiState.mode.set(98000002, 'unavailable');
    now += 6 * 3_600_000;
    await run();
    expect((await coverage.get()).exists).toBe(false);

    // The first refusal starts a stale spell: rebuilt. The next one in the same spell: not.
    esiState.mode.set(98000002, 'forbidden');
    now += 6 * 3_600_000;
    await run();
    expect((await coverage.get()).exists).toBe(true);
    await coverage.delete();
    now += 6 * 3_600_000;
    await run();
    expect((await coverage.get()).exists).toBe(false);
  });

  it('runs a feeder after the books, and a book with no grant is unaffected', async () => {
    await addFeeder(98000002);
    const summary = await run();
    expect(summary.grants).toBe(0);
    expect(summary.feeders.read).toBe(1);
  });
});
