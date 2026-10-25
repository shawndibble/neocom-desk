// The Corp Tax Book sync grant and the scheduled sync against the Firestore
// emulator (issue #4068, ADR 0025). Runs only under `npm run test:rules` at the
// repo root (which starts the emulator and sets FIRESTORE_EMULATOR_HOST); a plain
// `npm test` skips it.
import type { Caller } from './actorAuth.js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { SsoRefreshError } from './alertGrant.js';
import { decryptRefreshToken } from './alertGrantCrypto.js';
import { parseBookCall, parseTurnOnInput } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import {
  CORP_SYNC_GRANTS_COLLECTION,
  CORP_SYNC_SCOPES,
  deleteCorpSyncGrantsHeldBy,
  revokeCorpSyncGrant,
  runScheduledCorpSyncs,
  saveCorpSyncGrant,
  type CorpSyncDeps,
  type CorpSyncGrantDoc,
  type ScheduledSyncStatus,
} from './corpSyncGrant.js';
import { turnOnBook, verifyOfficer, type BookDeps } from './corpTaxBookStore.js';
import type { EsiRead, SyncEsi } from './corpTaxBookSyncEsi.js';

const CORP = 98000001;
const T0 = Date.parse('2026-10-18T12:00:00Z');
const KEY = Buffer.alloc(32, 7);

const DIRECTOR = 1; // CEO
const ACCOUNTANT = 2; // also Station_Manager
const JUNIOR = 3;
const OTHER_ACCOUNTANT = 4;

const runnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runnable ? describe : describe.skip;

let db: Firestore;
let now = T0;
const identities = new Map<number, CorpIdentity>();
/** Refresh tokens SSO has revoked or let die. */
const dead = new Set<string>();
const revokedAtSso: string[] = [];
let refreshFailure: Error | null = null;
/** Counts the rotation: `rt-<char>-<n>`. */
const generation = new Map<number, number>();

const as = (roles: string[], ceo = false): CorpIdentity => ({
  corporationId: CORP,
  ceoId: ceo ? DIRECTOR : null,
  roles,
});

const ok = <T>(data: T): EsiRead<T> => ({
  kind: 'ok',
  data,
  fetchedAt: new Date(T0).toISOString(),
  truncated: false,
});

interface FakeEsi {
  observers: EsiRead<number[]>;
  ledger: EsiRead<unknown[]>;
  extractions: EsiRead<unknown[]>;
  notifications: EsiRead<unknown[]>;
  journal: EsiRead<unknown[]>;
  structureSystem: EsiRead<number>;
  calls: string[];
  low: boolean;
}

let esiState: FakeEsi;

const fakeEsi = (): SyncEsi => ({
  observers: async () => (esiState.calls.push('observers'), esiState.observers),
  ledger: async () => (esiState.calls.push('ledger'), esiState.ledger as never),
  extractions: async () => (esiState.calls.push('extractions'), esiState.extractions as never),
  notifications: async () => (
    esiState.calls.push('notifications'),
    esiState.notifications as never
  ),
  journal: async () => (esiState.calls.push('journal'), esiState.journal as never),
  structureSystem: async () => (esiState.calls.push('system'), esiState.structureSystem),
  structure: async () => (esiState.calls.push('structure'), { kind: 'unavailable' }),
  budgetLow: () => esiState.low,
});

const claimsFor = (token: string) => {
  const grant = /^at-(\d+)$/.exec(token);
  const login = /^tok-(\d+)$/.exec(token);
  const id = Number((grant ?? login)?.[1]);
  if (!id) throw new Error('bad token');
  return {
    characterId: id,
    ownerHash: `h${id}`,
    name: `Pilot ${id}`,
    scopes: grant ? [...CORP_SYNC_SCOPES] : [ROLES_SCOPE],
    clientId: 'client-1',
  };
};

const syncDeps = (): CorpSyncDeps => ({
  db,
  now: () => now,
  key: () => KEY,
  verify: async (token) => claimsFor(token),
  refresh: async (_clientId, refreshToken) => {
    if (refreshFailure) throw refreshFailure;
    const match = /^rt-(\d+)-(\d+)$/.exec(refreshToken);
    if (!match || dead.has(refreshToken)) throw new SsoRefreshError(400, true);
    const id = Number(match[1]);
    const next = (generation.get(id) ?? 0) + 1;
    generation.set(id, next);
    return { accessToken: `at-${id}`, refreshToken: `rt-${id}-${next}` };
  },
  revoke: async (_clientId, refreshToken) => {
    revokedAtSso.push(refreshToken);
  },
  readIdentity: async (characterId) => {
    const identity = identities.get(characterId);
    if (!identity) throw new Error('no identity');
    return identity;
  },
  log: () => undefined,
});

const bookDeps = (): BookDeps => {
  const d = syncDeps();
  return { db, now: d.now, verifyToken: d.verify, readIdentity: d.readIdentity };
};

const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const book = () => db.collection('corps').doc(String(CORP));
const grantDoc = (): Promise<CorpSyncGrantDoc | undefined> =>
  db
    .collection(CORP_SYNC_GRANTS_COLLECTION)
    .doc(String(CORP))
    .get()
    .then((s) => s.data() as CorpSyncGrantDoc | undefined);
const status = async () =>
  (await book().collection('meta').doc('scheduledSync').get()).data() as
    ScheduledSyncStatus | undefined;
const audit = async () =>
  (await book().collection('audit').orderBy('at').get()).docs.map((d) => d.data());

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return String(
      (err as HttpsError).details && ((err as HttpsError).details as { reason?: string }).reason
    );
  }
  throw new Error('expected the call to fail');
}

const optIn = (id: number, refreshToken = `rt-${id}-0`, corporationId = CORP) =>
  saveCorpSyncGrant(syncDeps(), who(id), { corporationId, accessToken: `at-${id}`, refreshToken });

if (runnable) {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-neocom-rules' });
  db = getFirestore();
}

/** The emulator's own wipe: BulkWriter-based recursiveDelete trips its rate limiter here. */
async function clearEmulator(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(
    `http://${host}/emulator/v1/projects/demo-neocom-rules/databases/(default)/documents`,
    {
      method: 'DELETE',
    }
  );
}

const statement = {
  id: 's1',
  minerId: 'solo:50',
  code: 'ABC123',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-15',
  coversFrom: '2026-10-01',
  coversThrough: '2026-10-15',
  issuedAt: '2026-10-16T00:00:00.000Z',
  hubId: 'jita',
  oreForm: 'compressed',
  lines: [
    {
      kind: 'mined',
      chargeKey: '50:45490:2026-10-05:5000',
      date: '2026-10-05',
      characterId: 50,
      structureId: 5000,
      oreLines: [],
      estimatedValue: 1,
      tax: 10_000_000,
    },
  ],
  amount: 10_000_000,
  characterIds: [50],
};

suite('Corp Tax Book scheduled sync (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    dead.clear();
    revokedAtSso.length = 0;
    refreshFailure = null;
    generation.clear();
    identities.clear();
    identities.set(DIRECTOR, as(['Director'], true));
    identities.set(ACCOUNTANT, as(['Accountant', 'Station_Manager']));
    identities.set(JUNIOR, as(['Junior_Accountant']));
    identities.set(OTHER_ACCOUNTANT, as(['Accountant']));
    esiState = {
      observers: ok([5000]),
      ledger: ok([
        {
          character_id: 50,
          recorded_corporation_id: CORP,
          type_id: 45490,
          quantity: 100,
          last_updated: '2026-10-17',
        },
      ]),
      extractions: ok([
        {
          structure_id: 5000,
          moon_id: 7,
          extraction_start_time: '2026-10-10T00:00:00Z',
          chunk_arrival_time: '2026-10-17T00:00:00Z',
          natural_decay_time: '2026-10-17T03:00:00Z',
        },
      ]),
      notifications: ok([]),
      journal: ok([
        {
          id: 1,
          date: '2026-10-17T10:00:00Z',
          ref_type: 'player_donation',
          amount: 10_000_000,
          first_party_id: 50,
        },
      ]),
      structureSystem: ok(30000142),
      calls: [],
      low: false,
    };
    await turnOnBook(
      bookDeps(),
      who(DIRECTOR),
      parseTurnOnInput({
        corporationId: CORP,
        accessToken: `tok-${DIRECTOR}`,
        startDate: '2026-10-01',
        startRatePct: 10,
      })
    );
    await verifyOfficer(
      bookDeps(),
      who(ACCOUNTANT),
      parseBookCall({ corporationId: CORP, accessToken: `tok-${ACCOUNTANT}` })
    );
  });

  describe('opting in', () => {
    it('stores the token encrypted, shows officers who holds it, and audits it', async () => {
      const saved = await optIn(ACCOUNTANT);
      expect(saved).toMatchObject({ corporationId: CORP, characterId: ACCOUNTANT, enabledAt: T0 });
      const doc = (await grantDoc())!;
      expect(doc).toMatchObject({
        characterId: ACCOUNTANT,
        characterName: 'Pilot 2',
        clientId: 'client-1',
      });
      expect(JSON.stringify(doc)).not.toContain('rt-');
      // The stored token is the rotated one SSO handed back, not the one the browser sent.
      expect(decryptRefreshToken(doc.encryptedRefreshToken, ACCOUNTANT, KEY, 'corpSyncGrant')).toBe(
        'rt-2-1'
      );
      expect(await status()).toMatchObject({
        status: 'active',
        characterId: ACCOUNTANT,
        characterName: 'Pilot 2',
        enabledAt: T0,
      });
      const entry = (await audit()).find((a) => a.action === 'scheduledSyncOn');
      expect(entry).toMatchObject({ by: ACCOUNTANT, byName: 'Pilot 2' });
    });

    it('lets a Director or the CEO opt in, but not a Junior_Accountant', async () => {
      expect(await optIn(DIRECTOR)).toMatchObject({ characterId: DIRECTOR });
      expect(await reason(optIn(JUNIOR))).toBe('not-an-editor');
    });

    it('refuses wrong scopes, another Character and another corporation', async () => {
      const narrow: CorpSyncDeps = {
        ...syncDeps(),
        verify: async (t) => ({ ...claimsFor(t), scopes: [CORP_SYNC_SCOPES[0]] }),
      };
      expect(
        await reason(
          saveCorpSyncGrant(narrow, who(ACCOUNTANT), {
            corporationId: CORP,
            accessToken: 'at-2',
            refreshToken: 'rt-2-0',
          })
        )
      ).toBe('wrong-scopes');
      const extra: CorpSyncDeps = {
        ...syncDeps(),
        verify: async (t) => ({
          ...claimsFor(t),
          scopes: [...CORP_SYNC_SCOPES, 'esi-mail.send_mail.v1'],
        }),
      };
      expect(
        await reason(
          saveCorpSyncGrant(extra, who(ACCOUNTANT), {
            corporationId: CORP,
            accessToken: 'at-2',
            refreshToken: 'rt-2-0',
          })
        )
      ).toBe('wrong-scopes');
      expect(
        await reason(
          saveCorpSyncGrant(syncDeps(), who(JUNIOR), {
            corporationId: CORP,
            accessToken: 'at-2',
            refreshToken: 'rt-2-0',
          })
        )
      ).toBe('token-mismatch');
      identities.set(ACCOUNTANT, { corporationId: 98000999, ceoId: null, roles: ['Accountant'] });
      expect(await reason(optIn(ACCOUNTANT))).toBe('wrong-corp');
      expect(await grantDoc()).toBeUndefined();
    });

    it('refuses a refresh token SSO rejects', async () => {
      dead.add('rt-2-0');
      await expect(optIn(ACCOUNTANT)).rejects.toMatchObject({ code: 'unauthenticated' });
      expect(await grantDoc()).toBeUndefined();
    });

    it('refuses a corporation with no active book', async () => {
      identities.set(ACCOUNTANT, { corporationId: 98000555, ceoId: null, roles: ['Accountant'] });
      expect(await reason(optIn(ACCOUNTANT, 'rt-2-0', 98000555))).toBe('no-book');
    });

    it('replaces the previous holder and revokes their token', async () => {
      await optIn(ACCOUNTANT);
      // Audit ids sort by time, so the second opt-in must be later.
      now = T0 + 1000;
      await optIn(OTHER_ACCOUNTANT);
      const doc = (await grantDoc())!;
      expect(doc.characterId).toBe(OTHER_ACCOUNTANT);
      expect((await status())?.characterId).toBe(OTHER_ACCOUNTANT);
      expect(revokedAtSso).toEqual(['rt-2-1']);
      const entry = (await audit()).filter((a) => a.action === 'scheduledSyncOn').at(-1);
      expect(entry?.detail).toMatchObject({ replacedCharacterId: ACCOUNTANT });
    });
  });

  describe('revoking', () => {
    it('lets the holder revoke their own: the token is deleted and revoked at SSO', async () => {
      await optIn(ACCOUNTANT);
      const result = await revokeCorpSyncGrant(syncDeps(), who(ACCOUNTANT), {
        corporationId: CORP,
      });
      expect(result).toEqual({ deleted: true, revoked: true });
      expect(await grantDoc()).toBeUndefined();
      expect(await status()).toBeUndefined();
      expect(revokedAtSso).toEqual(['rt-2-1']);
      expect((await audit()).find((a) => a.action === 'scheduledSyncOff')?.detail).toMatchObject({
        by: 'holder',
      });
    });

    it("lets the CEO revoke anyone's, with a live role check", async () => {
      await optIn(ACCOUNTANT);
      const call = { corporationId: CORP, accessToken: `tok-${DIRECTOR}` };
      expect(await revokeCorpSyncGrant(syncDeps(), who(DIRECTOR), call)).toEqual({
        deleted: true,
        revoked: true,
      });
      expect(await grantDoc()).toBeUndefined();
      expect((await audit()).find((a) => a.action === 'scheduledSyncOff')?.detail).toMatchObject({
        by: 'ceo',
        holderCharacterId: ACCOUNTANT,
      });
    });

    it('refuses a Director who is not the CEO, and anyone without a token', async () => {
      await optIn(ACCOUNTANT);
      identities.set(OTHER_ACCOUNTANT, as(['Director']));
      expect(
        await reason(
          revokeCorpSyncGrant(syncDeps(), who(OTHER_ACCOUNTANT), {
            corporationId: CORP,
            accessToken: `tok-${OTHER_ACCOUNTANT}`,
          })
        )
      ).toBe('role-required');
      expect(
        await reason(revokeCorpSyncGrant(syncDeps(), who(DIRECTOR), { corporationId: CORP }))
      ).toBe('live-check-required');
      expect(await grantDoc()).toBeDefined();
    });

    it('is a no-op when nothing is held', async () => {
      expect(
        await revokeCorpSyncGrant(syncDeps(), who(ACCOUNTANT), { corporationId: CORP })
      ).toEqual({ deleted: false, revoked: false });
    });

    it('drops every grant a purged Character holds', async () => {
      await optIn(ACCOUNTANT);
      expect(await deleteCorpSyncGrantsHeldBy(syncDeps(), ACCOUNTANT)).toBe(1);
      expect(await grantDoc()).toBeUndefined();
      expect(await status()).toBeUndefined();
      expect(revokedAtSso).toEqual(['rt-2-1']);
    });
  });

  describe('the scheduled run', () => {
    it('syncs and settles a seeded book, rotates the token, and never issues or mails', async () => {
      await book().collection('statements').doc('s1').set(statement);
      await optIn(ACCOUNTANT);
      now = T0 + 6 * 3_600_000;
      const summary = await runScheduledCorpSyncs(syncDeps(), fakeEsi());
      expect(summary).toMatchObject({ grants: 1, synced: 1, stopped: 0, skipped: 0 });

      const observed = await book().collection('observed').get();
      expect(observed.size).toBe(1);
      expect(observed.docs[0].data()).toMatchObject({
        characterId: 50,
        quantity: 100,
        solarSystemId: 30000142,
        moonId: 7,
      });
      expect((await book().collection('extractions').get()).size).toBe(1);

      // The donation is matched to the Miner who mined (character 50) and settles the Statement.
      const payment = (await book().collection('payments').doc('j1_1').get()).data();
      expect(payment).toMatchObject({ minerId: 'solo:50', amount: 10_000_000 });
      expect((await book().collection('meta').doc('paid').get()).data()?.ids).toEqual(['s1']);

      const lastSync = (await book().get()).data()?.lastSync;
      expect(lastSync).toMatchObject({
        at: T0 + 6 * 3_600_000,
        byCharacterId: ACCOUNTANT,
        byName: 'Pilot 2',
        scheduled: true,
      });
      const actions = (await audit())
        .filter((a) => a.via === 'scheduled sync')
        .map((a) => a.action);
      expect(actions.sort()).toEqual(['settleStatements', 'sync']);

      expect(await status()).toMatchObject({
        status: 'active',
        lastRun: {
          outcome: 'synced',
          observedRows: 1,
          extractions: 1,
          donationsAdded: 1,
          settled: 1,
        },
        systemIds: { '5000': 30000142 },
      });
      // Nothing was issued, nothing mailed: the one Statement is the seeded one, no verify links.
      expect((await book().collection('statements').get()).size).toBe(1);
      expect((await book().collection('statementLinks').get()).size).toBe(0);
      expect((await db.collection('corpTaxBookTokens').get()).size).toBe(0);

      // SSO rotated the token again on the run; the stored blob follows.
      const doc = (await grantDoc())!;
      expect(decryptRefreshToken(doc.encryptedRefreshToken, ACCOUNTANT, KEY, 'corpSyncGrant')).toBe(
        'rt-2-2'
      );
    });

    it('re-matches an Unmatched donation once its sender is known, then settles', async () => {
      await book().collection('statements').doc('s1').set(statement);
      await book().collection('payments').doc('j1_1').set({
        id: 'j1_1',
        source: 'donation',
        characterId: 50,
        uid: 'char:50',
        amount: 10_000_000,
        at: '2026-10-17T10:00:00.000Z',
        division: 1,
      });
      await optIn(ACCOUNTANT);
      const summary = await runScheduledCorpSyncs(syncDeps(), fakeEsi());
      expect(summary.synced).toBe(1);
      expect((await book().collection('payments').doc('j1_1').get()).data()?.minerId).toBe(
        'solo:50'
      );
      expect((await book().collection('meta').doc('paid').get()).data()?.ids).toEqual(['s1']);
      expect(
        (await audit()).some((a) => a.action === 'assignPayment' && a.via === 'scheduled sync')
      ).toBe(true);
    });

    describe('settled rows (#5048)', () => {
      const H = 3_600_000;
      const row = (date: string, quantity: number, character = 50) => ({
        character_id: character,
        recorded_corporation_id: CORP,
        type_id: 45490,
        quantity,
        last_updated: date,
      });
      const readAt = (rows: unknown[], truncated = false): EsiRead<unknown[]> => ({
        kind: 'ok',
        data: rows,
        fetchedAt: new Date(now).toISOString(),
        truncated,
      });
      const quantity = async (date: string, structureId = 5000, character = 50) =>
        (
          await book().collection('observed').doc(`${character}_45490_${date}_${structureId}`).get()
        ).data()?.quantity;
      const through = async () => (await book().get()).data()?.observedThrough;

      it('records a full read, then leaves rows final at that read out of the merge', async () => {
        await optIn(ACCOUNTANT);
        now = T0 + 6 * H;
        esiState.ledger = readAt([row('2026-10-10', 100), row('2026-10-17', 100)]);
        await runScheduledCorpSyncs(syncDeps(), fakeEsi());
        expect(await through()).toEqual({ '5000': now });
        const first = now;

        now = T0 + 12 * H;
        // A closed day cannot really grow; 999 only shows the row was left out of the merge.
        esiState.ledger = readAt([row('2026-10-10', 999), row('2026-10-17', 150)]);
        expect((await runScheduledCorpSyncs(syncDeps(), fakeEsi())).synced).toBe(1);
        expect(await quantity('2026-10-10')).toBe(100);
        // Yesterday is inside the grace: its growth still lands.
        expect(await quantity('2026-10-17')).toBe(150);
        expect(await through()).toEqual({ '5000': now });
        expect(now).toBeGreaterThan(first);
        // The settled row's Character still gets its billed-by pointer.
        const pointer = await db.collection('corpTaxBookBilledBy').doc('char:50').get();
        expect(pointer.data()?.books).toHaveProperty(String(CORP));
      });

      it('merges a new refinery’s old rows in full: it has no read on record', async () => {
        await optIn(ACCOUNTANT);
        now = T0 + 6 * H;
        esiState.ledger = readAt([row('2026-10-10', 100)]);
        await runScheduledCorpSyncs(syncDeps(), fakeEsi());

        now = T0 + 12 * H;
        esiState.observers = ok([5000, 6000]);
        esiState.ledger = readAt([row('2026-10-10', 100), row('2026-10-09', 40, 51)]);
        await runScheduledCorpSyncs(syncDeps(), fakeEsi());
        expect(await quantity('2026-10-09', 6000, 51)).toBe(40);
        expect(await through()).toEqual({ '5000': now, '6000': now });
      });

      it('records no read for a truncated ledger, so the next run merges all of it', async () => {
        await optIn(ACCOUNTANT);
        now = T0 + 6 * H;
        esiState.ledger = readAt([row('2026-10-10', 100)], true);
        await runScheduledCorpSyncs(syncDeps(), fakeEsi());
        expect(await through()).toBeUndefined();

        now = T0 + 12 * H;
        // The first read missed pages: the rest of that closed day turns up now.
        esiState.ledger = readAt([row('2026-10-10', 160)]);
        await runScheduledCorpSyncs(syncDeps(), fakeEsi());
        expect(await quantity('2026-10-10')).toBe(160);
      });

      it('records no read when the run’s merge fails, so the next run merges everything again', async () => {
        await optIn(ACCOUNTANT);
        now = T0 + 6 * H;
        // A row the upload refuses fails the whole run before anything is merged.
        esiState.ledger = readAt([row('2026-10-10', 100), row('2026-12-01', 1)]);
        expect((await runScheduledCorpSyncs(syncDeps(), fakeEsi())).synced).toBe(0);
        expect(await through()).toBeUndefined();

        esiState.ledger = readAt([row('2026-10-10', 100)]);
        await runScheduledCorpSyncs(syncDeps(), fakeEsi());
        expect(await quantity('2026-10-10')).toBe(100);
      });
    });

    it('syncs a book with no refineries of its own once it has moon owners (#4616)', async () => {
      esiState.observers = ok([]);
      await optIn(ACCOUNTANT);
      expect((await runScheduledCorpSyncs(syncDeps(), fakeEsi())).skipped).toBe(1);
      expect((await status())?.lastRun).toMatchObject({ reason: 'no-refineries' });

      await book()
        .collection('feeders')
        .doc('98000002')
        .set({
          corporationId: 98000002,
          status: 'active',
          coveragePeriods: [{ from: '2026-10-01' }],
        });
      now = T0 + 3_600_000;
      expect((await runScheduledCorpSyncs(syncDeps(), fakeEsi())).synced).toBe(1);
      expect((await book().get()).data()?.lastSync).toMatchObject({ at: now, scheduled: true });
      expect((await book().collection('payments').doc('j1_1').get()).exists).toBe(true);
      expect(esiState.calls).not.toContain('ledger');
    });

    it('reads no extractions for an Accountant without Station_Manager, and still syncs', async () => {
      await optIn(OTHER_ACCOUNTANT);
      await runScheduledCorpSyncs(syncDeps(), fakeEsi());
      expect(esiState.calls).not.toContain('extractions');
      expect((await book().collection('observed').get()).size).toBe(1);
      expect((await status())?.status).toBe('active');
    });

    it('stops the schedule when the holder lost the role, and says why', async () => {
      await optIn(ACCOUNTANT);
      identities.set(ACCOUNTANT, as(['Junior_Accountant']));
      const summary = await runScheduledCorpSyncs(syncDeps(), fakeEsi());
      expect(summary).toMatchObject({ synced: 0, stopped: 1 });
      expect(await grantDoc()).toBeUndefined();
      expect(await status()).toMatchObject({
        status: 'stopped',
        stoppedReason: 'role-lost',
        characterName: 'Pilot 2',
        stoppedAt: T0,
      });
      expect((await book().get()).data()?.lastSync).toBeNull();
      expect((await book().collection('observed').get()).size).toBe(0);
      expect(esiState.calls).toEqual([]);
      // The run's refresh rotated the token before the role check; that is the one revoked.
      expect(revokedAtSso).toEqual(['rt-2-2']);
      expect((await audit()).find((a) => a.action === 'scheduledSyncStopped')).toMatchObject({
        via: 'scheduled sync',
        detail: { reason: 'role-lost' },
      });
    });

    it('stops the schedule when the holder left the corporation', async () => {
      await optIn(ACCOUNTANT);
      identities.set(ACCOUNTANT, { corporationId: 98000999, ceoId: null, roles: ['Accountant'] });
      await runScheduledCorpSyncs(syncDeps(), fakeEsi());
      expect(await status()).toMatchObject({ status: 'stopped', stoppedReason: 'left-corp' });
      expect(await grantDoc()).toBeUndefined();
    });

    it('stops the schedule when SSO no longer honours the refresh token', async () => {
      await optIn(ACCOUNTANT);
      dead.add('rt-2-1');
      await runScheduledCorpSyncs(syncDeps(), fakeEsi());
      expect(await status()).toMatchObject({ status: 'stopped', stoppedReason: 'token-revoked' });
      expect(await grantDoc()).toBeUndefined();
      // The dead token is not sent to SSO again to revoke.
      expect(revokedAtSso).toEqual([]);
    });

    it('stops the schedule when the book was turned off', async () => {
      await optIn(ACCOUNTANT);
      await book().update({ active: false });
      await runScheduledCorpSyncs(syncDeps(), fakeEsi());
      expect(await status()).toMatchObject({ status: 'stopped', stoppedReason: 'book-off' });
    });

    it('keeps the schedule through a transient failure and tries again next run', async () => {
      await optIn(ACCOUNTANT);
      refreshFailure = new Error('SSO is down');
      expect(await runScheduledCorpSyncs(syncDeps(), fakeEsi())).toMatchObject({
        skipped: 1,
        stopped: 0,
      });
      expect(await grantDoc()).toBeDefined();
      refreshFailure = null;
      esiState.observers = { kind: 'unavailable' };
      expect(await runScheduledCorpSyncs(syncDeps(), fakeEsi())).toMatchObject({
        skipped: 1,
        stopped: 0,
      });
      expect((await status())?.lastRun).toMatchObject({
        outcome: 'skipped',
        reason: 'esi-unavailable',
      });
      expect((await book().get()).data()?.lastSync).toBeNull();
      esiState.observers = ok([5000]);
      expect(await runScheduledCorpSyncs(syncDeps(), fakeEsi())).toMatchObject({ synced: 1 });
    });

    it('writes nothing if the grant was revoked while the run was reading ESI', async () => {
      await optIn(ACCOUNTANT);
      const esi = fakeEsi();
      const observers = esi.observers;
      esi.observers = async (...args) => {
        await revokeCorpSyncGrant(syncDeps(), who(ACCOUNTANT), { corporationId: CORP });
        return observers(...args);
      };
      const summary = await runScheduledCorpSyncs(syncDeps(), esi);
      expect(summary).toMatchObject({ synced: 0, skipped: 1 });
      expect((await book().collection('observed').get()).size).toBe(0);
      expect((await book().get()).data()?.lastSync).toBeNull();
      expect(await status()).toBeUndefined();
    });

    it('ends the run when ESI says the error budget is gone, without stopping anyone', async () => {
      await optIn(ACCOUNTANT);
      esiState.observers = { kind: 'backoff' };
      const summary = await runScheduledCorpSyncs(syncDeps(), fakeEsi());
      expect(summary).toMatchObject({ budgetStopped: true, stopped: 0 });
      expect(await grantDoc()).toBeDefined();
    });
  });
});
