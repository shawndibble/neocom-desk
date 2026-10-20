// Collector books: feeder invites against the Firestore emulator (issue #4507).
// Runs only under `npm run test:rules` at the repo root; a plain `npm test` skips it.
import { beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseTurnOnInput } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import {
  CORP_SYNC_GRANTS_COLLECTION,
  deleteCorpSyncGrantsHeldBy,
  runScheduledCorpSyncs,
  type CorpSyncDeps,
} from './corpSyncGrant.js';
import {
  MAX_OPEN_FEEDER_INVITES,
  acceptFeederInvite,
  createFeederInvite,
  hashInviteCode,
  revokeFeederInvite,
  type FeederRecord,
} from './corpTaxBookFeeders.js';
import { deleteBook, turnOnBook, type BookDeps, type Caller } from './corpTaxBookStore.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';

const COLLECTOR = 98000001;
const FEEDER = 98000002;
const T0 = Date.parse('2026-10-18T12:00:00Z');
const DAY = 24 * 3_600_000;

const COLLECTOR_CEO = 1;
const COLLECTOR_ACCOUNTANT = 2;
const COLLECTOR_JUNIOR = 3;
const FEEDER_DIRECTOR = 11;
const FEEDER_JUNIOR = 12;

const runnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runnable ? describe : describe.skip;

let db: Firestore;
let now = T0;
const identities = new Map<number, CorpIdentity>();

const deps = (): BookDeps => ({
  db,
  now: () => now,
  verifyToken: async (token) => {
    const id = Number(/^tok-(\d+)$/.exec(token)?.[1]);
    if (!id) throw new Error('bad token');
    return {
      characterId: id,
      ownerHash: `h${id}`,
      name: `Pilot ${id}`,
      scopes: [ROLES_SCOPE],
      clientId: 'c',
    };
  },
  readIdentity: async (id) => {
    const identity = identities.get(id);
    if (!identity) throw new Error('no identity');
    return identity;
  },
});
const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const tok = (id: number) => `tok-${id}`;
const collectorBook = () => db.collection('corpTaxBooks').doc(String(COLLECTOR));
const feederRecord = async () =>
  (await collectorBook().collection('feeders').doc(String(FEEDER)).get()).data() as
    FeederRecord | undefined;
const pointer = async () =>
  (await db.collection('corpTaxBookFeederOf').doc(String(FEEDER)).get()).data();

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

const invite = (offeredOwnerRatePct?: number) =>
  createFeederInvite(deps(), who(COLLECTOR_ACCOUNTANT), {
    corporationId: COLLECTOR,
    accessToken: tok(COLLECTOR_ACCOUNTANT),
    ...(offeredOwnerRatePct !== undefined ? { offeredOwnerRatePct } : {}),
  });
const accept = (code: string, id = FEEDER_DIRECTOR) =>
  acceptFeederInvite(deps(), who(id), { code, accessToken: tok(id) });

suite('feeder invites', () => {
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    identities.clear();
    identities.set(COLLECTOR_CEO, { corporationId: COLLECTOR, ceoId: COLLECTOR_CEO, roles: [] });
    identities.set(COLLECTOR_ACCOUNTANT, {
      corporationId: COLLECTOR,
      ceoId: null,
      roles: ['Accountant'],
    });
    identities.set(COLLECTOR_JUNIOR, {
      corporationId: COLLECTOR,
      ceoId: null,
      roles: ['Junior_Accountant'],
    });
    identities.set(FEEDER_DIRECTOR, { corporationId: FEEDER, ceoId: null, roles: ['Director'] });
    identities.set(FEEDER_JUNIOR, {
      corporationId: FEEDER,
      ceoId: null,
      roles: ['Junior_Accountant'],
    });
    await turnOnBook(
      deps(),
      who(COLLECTOR_CEO),
      parseTurnOnInput({
        corporationId: COLLECTOR,
        accessToken: tok(COLLECTOR_CEO),
        startDate: '2026-10-01',
        startRatePct: 10,
      })
    );
  });

  describe('create and revoke', () => {
    it('stores only the code hash and audits the link', async () => {
      const { code, inviteId } = await invite(7.5);
      expect(inviteId).toBe(hashInviteCode(code));
      const stored = (await db.collection('corpTaxBookFeederInvites').doc(inviteId).get()).data();
      expect(stored).toMatchObject({
        collectorCorporationId: COLLECTOR,
        createdBy: COLLECTOR_ACCOUNTANT,
        offeredOwnerRatePct: 7.5,
      });
      expect(JSON.stringify(stored)).not.toContain(code);
      const actions = (await collectorBook().collection('audit').get()).docs.map((d) =>
        d.get('action')
      );
      expect(actions).toContain('feederInviteCreated');
    });

    it('needs the edit role, checked live', async () => {
      expect(
        await reason(
          createFeederInvite(deps(), who(COLLECTOR_JUNIOR), {
            corporationId: COLLECTOR,
            accessToken: tok(COLLECTOR_JUNIOR),
          })
        )
      ).toBe('role-required');
      expect(
        await reason(
          createFeederInvite(deps(), who(COLLECTOR_ACCOUNTANT), { corporationId: COLLECTOR })
        )
      ).toBe('live-check-required');
    });

    it('caps the open links on a book', async () => {
      for (let i = 0; i < MAX_OPEN_FEEDER_INVITES; i += 1) await invite();
      expect(await reason(invite())).toBe('too-many-invites');
    });

    it('revokes a link, so accepting it is refused', async () => {
      const { code, inviteId } = await invite();
      await revokeFeederInvite(deps(), who(COLLECTOR_ACCOUNTANT), {
        corporationId: COLLECTOR,
        accessToken: tok(COLLECTOR_ACCOUNTANT),
        inviteId,
      });
      expect(await reason(accept(code))).toBe('invite-revoked');
      expect(await feederRecord()).toBeUndefined();
    });

    it("will not revoke another book's link or a used one", async () => {
      const { code, inviteId } = await invite();
      await accept(code);
      const call = {
        corporationId: COLLECTOR,
        accessToken: tok(COLLECTOR_ACCOUNTANT),
        inviteId,
      };
      expect(await reason(revokeFeederInvite(deps(), who(COLLECTOR_ACCOUNTANT), call))).toBe(
        'invite-used'
      );
      expect(
        await reason(
          revokeFeederInvite(deps(), who(COLLECTOR_ACCOUNTANT), {
            ...call,
            inviteId: 'a'.repeat(64),
          })
        )
      ).toBe('invite-invalid');
    });
  });

  describe('accept', () => {
    it('creates an active record whose coverage starts today, and uses the link up', async () => {
      const { code } = await invite(5);
      expect(await accept(code)).toEqual({
        collectorCorporationId: COLLECTOR,
        feederCorporationId: FEEDER,
        rejoined: false,
      });
      expect(await feederRecord()).toMatchObject({
        corporationId: FEEDER,
        status: 'active',
        invitedBy: COLLECTOR_ACCOUNTANT,
        joinedAt: T0,
        mode: 'normal',
        offeredOwnerRatePct: 5,
        coveragePeriods: [{ from: '2026-10-18' }],
      });
      expect(await pointer()).toMatchObject({ collectorCorporationId: COLLECTOR });
      expect(await reason(accept(code))).toBe('invite-used');
    });

    it('refuses an unknown code and a caller without the edit role', async () => {
      expect(await reason(accept('nope'))).toBe('invite-invalid');
      const { code } = await invite();
      expect(await reason(accept(code, FEEDER_JUNIOR))).toBe('not-an-editor');
    });

    it('refuses a corporation that runs its own book', async () => {
      await turnOnBook(
        deps(),
        who(FEEDER_DIRECTOR),
        parseTurnOnInput({
          corporationId: FEEDER,
          accessToken: tok(FEEDER_DIRECTOR),
          startDate: '2026-10-01',
          startRatePct: 10,
        })
      );
      const { code } = await invite();
      expect(await reason(accept(code))).toBe('own-book-exists');
      expect(await feederRecord()).toBeUndefined();
    });

    it('refuses to let a Collector feed itself', async () => {
      const { code } = await invite();
      expect(await reason(accept(code, COLLECTOR_CEO))).toBe('own-book-exists');
    });

    it('refuses a corporation that already feeds, and a book that would start while it does', async () => {
      const first = await invite();
      await accept(first.code);
      const second = await invite();
      expect(await reason(accept(second.code))).toBe('already-feeder');
      expect(
        await reason(
          turnOnBook(
            deps(),
            who(FEEDER_DIRECTOR),
            parseTurnOnInput({
              corporationId: FEEDER,
              accessToken: tok(FEEDER_DIRECTOR),
              startDate: '2026-10-01',
              startRatePct: 10,
            })
          )
        )
      ).toBe('is-a-feeder');
    });

    it('reopens the same record on a fresh link after a leave, keeping payee and mode', async () => {
      const first = await invite();
      await accept(first.code);
      // The leave belongs to a later ticket; here the record and pointer are put as it leaves.
      const ref = collectorBook().collection('feeders').doc(String(FEEDER));
      await ref.update({
        status: 'left',
        leftAt: T0 + 2 * DAY,
        coveragePeriods: [{ from: '2026-10-18', to: '2026-10-19' }],
        mode: 'settled-otherwise',
        payee: { kind: 'character', id: 99 },
      });
      await db.collection('corpTaxBookFeederOf').doc(String(FEEDER)).delete();
      now = T0 + 5 * DAY;
      const second = await invite();
      expect(await accept(second.code)).toMatchObject({ rejoined: true });
      const record = await feederRecord();
      expect(record).toMatchObject({
        status: 'active',
        joinedAt: now,
        mode: 'settled-otherwise',
        payee: { kind: 'character', id: 99 },
        coveragePeriods: [{ from: '2026-10-18', to: '2026-10-19' }, { from: '2026-10-23' }],
      });
      expect(record).not.toHaveProperty('leftAt');
    });
  });

  describe('feeder grants beside book grants', () => {
    const feederGrant = {
      corporationId: FEEDER,
      characterId: FEEDER_DIRECTOR,
      characterName: 'Pilot',
      encryptedRefreshToken: 'v1.x',
      clientId: 'c',
      enabledAt: T0,
      kind: 'feeder',
      collectorCorporationId: COLLECTOR,
    };
    const unusedEsi = new Proxy(
      {},
      {
        get: () => () => {
          throw new Error('esi used');
        },
      }
    ) as SyncEsi;
    const syncDeps = (): CorpSyncDeps => ({
      db,
      now: () => now,
      key: () => Buffer.alloc(32, 7),
      verify: async () => {
        throw new Error('unused');
      },
      refresh: async () => {
        throw new Error('unused');
      },
      revoke: async () => undefined,
      readIdentity: async () => {
        throw new Error('unused');
      },
      log: () => undefined,
    });

    it('is not run as a book sync by the schedule', async () => {
      await db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(FEEDER)).set(feederGrant);
      const summary = await runScheduledCorpSyncs(
        {
          ...syncDeps(),
          key: () => {
            throw new Error('a feeder grant must not be decrypted');
          },
        },
        { ...unusedEsi, budgetLow: () => false } as SyncEsi
      );
      expect(summary).toMatchObject({ grants: 0, synced: 0, skipped: 0, stopped: 0 });
    });

    it("goes with the holder's account", async () => {
      await db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(FEEDER)).set(feederGrant);
      expect(await deleteCorpSyncGrantsHeldBy(syncDeps(), FEEDER_DIRECTOR)).toBe(1);
      expect(
        (await db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(FEEDER)).get()).exists
      ).toBe(false);
    });
  });

  it('deleting the Collector book drops its links and feeder pointers', async () => {
    const { code, inviteId } = await invite();
    await accept(code);
    await deleteBook(deps(), who(COLLECTOR_CEO), {
      corporationId: COLLECTOR,
      accessToken: tok(COLLECTOR_CEO),
    });
    expect((await db.collection('corpTaxBookFeederInvites').doc(inviteId).get()).exists).toBe(
      false
    );
    expect(await pointer()).toBeUndefined();
    expect(await feederRecord()).toBeUndefined();
  });
});
