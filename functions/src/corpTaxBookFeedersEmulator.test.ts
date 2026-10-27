// Collector books: feeder invites against the Firestore emulator (issues #4507, #4616).
// Runs only under `npm run test:rules` at the repo root; a plain `npm test` skips it.
import type { Caller } from './actorAuth.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseTurnOnInput } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import { encryptRefreshToken } from './alertGrantCrypto.js';
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
  previewFeederInvite,
  revokeFeederInvite,
  type FeederRecord,
} from './corpTaxBookFeeders.js';
import { dropBookGrants } from './corpTaxBookFeederGrant.js';
import { recordFeederRead } from './corpTaxBookFeederSync.js';
import { listFeederInvites, setFeederMode, setFeederRate } from './corpTaxBookFeederOwnerCalls.js';
import { deleteBook, turnOnBook, type BookDeps } from './corpTaxBookStore.js';
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
const collectorBook = () => db.collection('corps').doc(String(COLLECTOR));
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
      // A held officer check, so the token-less call reaches the live-check branch.
      await invite();
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

    it('takes the offered rate as the agreed rate from the join day', async () => {
      await accept((await invite(5)).code);
      const rec = await feederRecord();
      expect(rec?.agreedRatePct).toBe(5);
      expect(rec?.ownerRateHistory).toEqual([
        {
          kind: 'agreed',
          pct: 5,
          effectiveFrom: '2026-10-18',
          recordedAt: new Date(T0).toISOString(),
        },
      ]);
      // A link with no offered rate sets none.
      const plain = await invite();
      await db.collection('corpTaxBookFeederOf').doc(String(FEEDER)).delete();
      await collectorBook().collection('feeders').doc(String(FEEDER)).delete();
      await accept(plain.code);
      expect((await feederRecord())?.agreedRatePct).toBeUndefined();
    });

    it('previews a link: the accounting corporation and the offered rate, nothing for a used one', async () => {
      await collectorBook().update({ corporationName: 'B-UH Accounting' });
      const { code } = await invite(4);
      expect(await previewFeederInvite(deps(), who(FEEDER_DIRECTOR), { code })).toEqual({
        collectorCorporationId: COLLECTOR,
        collectorName: 'B-UH Accounting',
        offeredOwnerRatePct: 4,
      });
      await accept(code);
      expect(await reason(previewFeederInvite(deps(), who(FEEDER_DIRECTOR), { code }))).toBe(
        'invite-invalid'
      );
      expect(
        await reason(previewFeederInvite(deps(), who(FEEDER_DIRECTOR), { code: 'nope' }))
      ).toBe('invite-invalid');
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
        lastReadWellAt: T0,
        staleSince: T0 - 40 * DAY,
        disconnectedAt: T0 - 5 * DAY,
        lastSyncResult: { at: T0, outcome: 'stale', reason: 'esi-refused' },
        viewDismissedAt: T0 + 3 * DAY,
        // The last feed's holder must not carry its powers into the new one.
        grantHolder: 4242,
        grantedBy: 4243,
        refineryLabels: {
          '4001': {
            label: 'Gate Athanor',
            setAt: '2026-10-19T00:00:00.000Z',
            setBy: 1,
            side: 'moon-owner',
          },
        },
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
        lastReadWellAt: T0,
        // Labels carry on across a rejoin (#4640).
        refineryLabels: { '4001': { label: 'Gate Athanor' } },
      });
      for (const gone of [
        'leftAt',
        'staleSince',
        'disconnectedAt',
        'lastSyncResult',
        'viewDismissedAt',
        'grantHolder',
        'grantedBy',
      ]) {
        expect(record).not.toHaveProperty(gone);
      }
      // The old stale spell does not disconnect the new period on the next refused read.
      expect(
        (await recordFeederRead(deps(), COLLECTOR, FEEDER, { outcome: 'stale', reason: 'x' }))
          ?.status
      ).toBe('active');
    });

    it('takes a disconnected moon owner back only with a new grant', async () => {
      await accept((await invite()).code);
      await collectorBook()
        .collection('feeders')
        .doc(String(FEEDER))
        .update({
          status: 'disconnected',
          disconnectedAt: T0 + DAY,
          staleSince: T0 - 29 * DAY,
          coveragePeriods: [{ from: '2026-10-18', to: '2026-10-18' }],
        });
      now = T0 + 3 * DAY;
      // The roles-scope accept stores no grant, so it cannot take a disconnected owner back.
      expect(await reason(accept((await invite()).code))).toBe('already-feeder');
      expect((await feederRecord())?.status).toBe('disconnected');
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

  describe('owner rate, mode and invite list (#4586)', () => {
    const asAccountant = {
      corporationId: COLLECTOR,
      accessToken: tok(COLLECTOR_ACCOUNTANT),
      feederCorporationId: FEEDER,
    };
    const auditActions = async () =>
      (await collectorBook().collection('audit').get()).docs.map((d) => d.get('action'));

    beforeEach(async () => {
      await accept((await invite()).code);
    });

    it('appends a dated agreed rate and audits it', async () => {
      await setFeederRate(deps(), who(COLLECTOR_ACCOUNTANT), { ...asAccountant, pct: 6 });
      const rec = await feederRecord();
      expect(rec?.agreedRatePct).toBe(6);
      expect(rec?.ownerRateHistory).toEqual([
        {
          kind: 'agreed',
          pct: 6,
          effectiveFrom: '2026-10-18',
          recordedAt: new Date(T0).toISOString(),
        },
      ]);
      expect(await auditActions()).toContain('feederRateAgreed');
    });

    it('records settled otherwise with a note, then back to normal from the switch day', async () => {
      await setFeederMode(deps(), who(COLLECTOR_ACCOUNTANT), {
        ...asAccountant,
        mode: 'settled-otherwise',
        note: 'paid by hand',
      });
      expect(await feederRecord()).toMatchObject({
        mode: 'settled-otherwise',
        note: 'paid by hand',
        modeChanges: [{ from: '2026-10-18', mode: 'settled-otherwise' }],
      });
      now = T0 + 2 * DAY;
      await setFeederMode(deps(), who(COLLECTOR_ACCOUNTANT), { ...asAccountant, mode: 'normal' });
      const rec = await feederRecord();
      expect(rec?.mode).toBe('normal');
      expect(rec?.note).toBeUndefined();
      expect(rec?.modeChanges).toEqual([
        { from: '2026-10-18', mode: 'settled-otherwise' },
        { from: '2026-10-20', mode: 'normal' },
      ]);
      expect(await auditActions()).toContain('feederModeSet');
    });

    it('refuses non-officers, a stale check and an unknown or departed moon owner', async () => {
      const junior = { ...asAccountant, accessToken: tok(COLLECTOR_JUNIOR) };
      expect(
        await reason(setFeederRate(deps(), who(COLLECTOR_JUNIOR), { ...junior, pct: 5 }))
      ).toBe('role-required');
      expect(
        await reason(
          setFeederMode(deps(), who(COLLECTOR_JUNIOR), { ...junior, mode: 'settled-otherwise' })
        )
      ).toBe('role-required');
      expect(
        await reason(
          setFeederRate(deps(), who(COLLECTOR_ACCOUNTANT), {
            corporationId: COLLECTOR,
            feederCorporationId: FEEDER,
            pct: 5,
          })
        )
      ).toBe('live-check-required');
      expect(
        await reason(
          setFeederRate(deps(), who(COLLECTOR_ACCOUNTANT), {
            ...asAccountant,
            feederCorporationId: 98999999,
            pct: 5,
          })
        )
      ).toBe('no-feeder');
      await collectorBook().collection('feeders').doc(String(FEEDER)).update({ status: 'left' });
      expect(
        await reason(setFeederRate(deps(), who(COLLECTOR_ACCOUNTANT), { ...asAccountant, pct: 5 }))
      ).toBe('feeder-ended');
    });

    it('lists open links only, newest first, for officers of that book', async () => {
      const first = await invite(3);
      now = T0 + 1000;
      const second = await invite();
      const revoked = await invite();
      await revokeFeederInvite(deps(), who(COLLECTOR_ACCOUNTANT), {
        corporationId: COLLECTOR,
        accessToken: tok(COLLECTOR_ACCOUNTANT),
        inviteId: revoked.inviteId,
      });
      const { invites } = await listFeederInvites(deps(), who(COLLECTOR_ACCOUNTANT), {
        corporationId: COLLECTOR,
        accessToken: tok(COLLECTOR_ACCOUNTANT),
      });
      expect(invites.map((i) => i.inviteId)).toEqual([second.inviteId, first.inviteId]);
      expect(invites[1]?.offeredOwnerRatePct).toBe(3);
      expect(
        await reason(listFeederInvites(deps(), who(FEEDER_DIRECTOR), { corporationId: COLLECTOR }))
      ).toBe('not-an-officer');
    });
  });

  it('deleting the Collector book drops its links and feeder pointers', async () => {
    const { code, inviteId } = await invite();
    await accept(code);
    const revoked: string[] = [];
    await db
      .collection(CORP_SYNC_GRANTS_COLLECTION)
      .doc(String(FEEDER))
      .set({
        corporationId: FEEDER,
        characterId: FEEDER_DIRECTOR,
        characterName: 'Pilot',
        encryptedRefreshToken: encryptRefreshToken(
          'rt-feeder',
          FEEDER_DIRECTOR,
          Buffer.alloc(32, 7),
          'corpSyncGrant'
        ),
        clientId: 'c',
        enabledAt: T0,
        kind: 'feeder',
        collectorCorporationId: COLLECTOR,
      });
    const grantDeps: CorpSyncDeps = {
      ...deps(),
      key: () => Buffer.alloc(32, 7),
      verify: deps().verifyToken,
      refresh: async () => {
        throw new Error('unused');
      },
      revoke: async (_c, token) => {
        revoked.push(token);
      },
      log: () => undefined,
    };
    await deleteBook(
      deps(),
      who(COLLECTOR_CEO),
      { corporationId: COLLECTOR, accessToken: tok(COLLECTOR_CEO) },
      (corporationId) => dropBookGrants(grantDeps, corporationId)
    );
    // Each moon owner's grant is revoked and dropped, and its after-leaving pointer written.
    expect(revoked).toEqual(['rt-feeder']);
    expect(
      (await db.collection(CORP_SYNC_GRANTS_COLLECTION).doc(String(FEEDER)).get()).exists
    ).toBe(false);
    expect(
      (await db.collection('corpTaxBookFeederPrevious').doc(String(FEEDER)).get()).data()
    ).toMatchObject({ collectorCorporationId: COLLECTOR, leftAt: T0 });
    expect((await db.collection('corpTaxBookFeederInvites').doc(inviteId).get()).exists).toBe(
      false
    );
    expect(await pointer()).toBeUndefined();
    expect(await feederRecord()).toBeUndefined();
  });

  it("a former moon owner's own book starts no earlier than the day its coverage ended", async () => {
    // A removal finalised late: coverage ended on the 14th, the record was closed on the 18th.
    await db
      .collection('corpTaxBookFeederPrevious')
      .doc(String(FEEDER))
      .set({ collectorCorporationId: COLLECTOR, leftAt: T0 });
    await collectorBook()
      .collection('feeders')
      .doc(String(FEEDER))
      .set({
        corporationId: FEEDER,
        status: 'removed',
        coveragePeriods: [{ from: '2026-10-01', to: '2026-10-14' }],
      });
    const turnOn = (startDate: string) =>
      turnOnBook(
        deps(),
        who(FEEDER_DIRECTOR),
        parseTurnOnInput({
          corporationId: FEEDER,
          accessToken: tok(FEEDER_DIRECTOR),
          startDate,
          startRatePct: 10,
        })
      );
    expect(await reason(turnOn('2026-10-14'))).toBe('start-before-leave');
    await turnOn('2026-10-15');
    expect((await db.collection('corps').doc(String(FEEDER)).get()).get('startDate')).toBe(
      '2026-10-15'
    );
  });
});
