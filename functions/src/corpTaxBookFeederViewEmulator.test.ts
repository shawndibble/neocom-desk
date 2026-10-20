// The moon owner's view against the Firestore emulator (issue #4512, spec #4504).
// Runs only under `npm run test:rules` at the repo root; a plain `npm test` skips it.
import { beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseTurnOnInput } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import { FEEDER_SYNC_SCOPES } from './corpSyncScopes.js';
import { leaveFeeder, saveFeederGrant, type FeederGrantDeps } from './corpTaxBookFeederGrant.js';
import {
  dismissFeederHistory,
  getFeederViewAccess,
  requestFeederRate,
} from './corpTaxBookFeederViewCalls.js';
import type { FeederViewSummary } from './corpTaxBookFeederView.js';
import { createFeederInvite, type FeederRecord } from './corpTaxBookFeeders.js';
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
const FEEDER_JUNIOR = 15;

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
  // Every type: 10 ISK buy at Jita 4-4 on the day the ledger row is dated.
  openPrices: async () => ({
    dates: ['2026-10-18'],
    stations: { '60003760': { buy: [10], sell: [null] } },
  }),
  log: () => undefined,
  esi: esi(),
  lookupCorporation: async () => FEEDER,
});
const bookDeps = (): BookDeps => {
  const d = deps();
  return {
    db,
    now: d.now,
    verifyToken: d.verify,
    readIdentity: d.readIdentity,
    openPrices: d.openPrices,
  };
};
const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
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

const newInvite = async () =>
  (
    await createFeederInvite(bookDeps(), who(COLLECTOR_CEO), {
      corporationId: COLLECTOR,
      accessToken: `roles-${COLLECTOR_CEO}`,
    })
  ).code;
const save = (code: string, requestedRatePct?: number) =>
  saveFeederGrant(deps(), who(PLAYER), {
    code,
    accessToken: `mine-${ALT}`,
    refreshToken: `rt-${ALT}`,
    ...(requestedRatePct !== undefined ? { requestedRatePct } : {}),
  });

const viewRef = () => collectorBook().collection('feederViews').doc(String(FEEDER));
const summary = async () => (await viewRef().get()).data() as FeederViewSummary | undefined;
const asDirector = { corporationId: FEEDER, accessToken: `roles-${FEEDER_DIRECTOR}` };

suite('moon owner view', () => {
  beforeEach(async () => {
    await clearEmulator();
    ledger = 'ok';
    revoked.length = 0;
    identities.clear();
    identities.set(COLLECTOR_CEO, { corporationId: COLLECTOR, ceoId: COLLECTOR_CEO, roles: [] });
    identities.set(FEEDER_DIRECTOR, { corporationId: FEEDER, ceoId: null, roles: ['Director'] });
    identities.set(FEEDER_NOBODY, { corporationId: FEEDER, ceoId: null, roles: [] });
    identities.set(FEEDER_JUNIOR, {
      corporationId: FEEDER,
      ceoId: null,
      roles: ['Junior_Accountant'],
    });
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

  it('builds the view when the first pull lands, with the grant-time rate', async () => {
    await save(await newInvite(), 6);
    expect(await summary()).toMatchObject({
      schemaVersion: 1,
      status: 'active',
      requestedRatePct: 6,
      effectiveRatePct: 6,
      minedVolume: 100,
      minedValueIsk: 1000,
      refineryCount: 1,
    });
    const days = await viewRef().collection('days').get();
    expect(days.docs.map((d) => d.id)).toEqual(['2026-10-18']);
    expect(JSON.stringify(days.docs.map((d) => d.data()))).not.toMatch(/minerRate|margin/);
  });

  it('writes no view for a refused first pull', async () => {
    ledger = 'forbidden';
    await reason(save(await newInvite(), 6));
    expect((await viewRef().get()).exists).toBe(false);
  });

  it('access: a Director gets a 24h record; a junior accountant and a nobody are refused', async () => {
    await save(await newInvite());
    const out = await getFeederViewAccess(deps(), who(FEEDER_DIRECTOR), asDirector);
    expect(out).toEqual({
      collectorCorporationId: COLLECTOR,
      expiresAt: T0 + 24 * 3_600_000,
      canEdit: true,
    });
    const record = (
      await viewRef().collection('viewers').doc(`char:${FEEDER_DIRECTOR}`).get()
    ).data();
    expect(record).toMatchObject({
      uid: `char:${FEEDER_DIRECTOR}`,
      ownerHash: `h${FEEDER_DIRECTOR}`,
      corporationId: FEEDER,
      canView: true,
      expiresAt: T0 + 24 * 3_600_000,
    });
    // never an officers doc: that would unlock the raw book
    expect(
      (await collectorBook().collection('officers').doc(`char:${FEEDER_DIRECTOR}`).get()).exists
    ).toBe(false);
    for (const id of [FEEDER_JUNIOR, FEEDER_NOBODY]) {
      expect(
        await reason(
          getFeederViewAccess(deps(), who(id), {
            corporationId: FEEDER,
            accessToken: `roles-${id}`,
          })
        )
      ).toBe('not-your-feeder');
    }
  });

  it('access: rebuilds a view that is absent', async () => {
    await save(await newInvite());
    await viewRef().delete();
    await getFeederViewAccess(deps(), who(FEEDER_DIRECTOR), asDirector);
    expect((await summary())?.minedVolume).toBe(100);
  });

  it('access: refuses a corporation that never fed a book', async () => {
    expect(await reason(getFeederViewAccess(deps(), who(FEEDER_DIRECTOR), asDirector))).toBe(
      'not-your-feeder'
    );
  });

  it('request rate: records a requested entry, and an agreed rate keeps winning', async () => {
    await save(await newInvite(), 6);
    await requestFeederRate(deps(), who(FEEDER_DIRECTOR), { ...asDirector, pct: 7 });
    expect(await summary()).toMatchObject({ requestedRatePct: 7, effectiveRatePct: 7 });
    expect((await feederRecord())?.ownerRateHistory?.map((e) => e.pct)).toEqual([6, 7]);

    await collectorBook()
      .collection('feeders')
      .doc(String(FEEDER))
      .update({
        agreedRatePct: 9,
        ownerRateHistory: [
          ...((await feederRecord())?.ownerRateHistory ?? []),
          {
            kind: 'agreed',
            pct: 9,
            effectiveFrom: '2026-10-18',
            recordedAt: '2026-10-18T00:00:00.000Z',
          },
        ],
      });
    await requestFeederRate(deps(), who(FEEDER_DIRECTOR), { ...asDirector, pct: 5 });
    expect(await summary()).toMatchObject({
      requestedRatePct: 5,
      agreedRatePct: 9,
      effectiveRatePct: 9,
    });
    const audit = await collectorBook().collection('audit').get();
    expect(audit.docs.filter((d) => d.get('action') === 'feederRateRequested')).toHaveLength(2);
  });

  it('request rate: refuses someone without standing', async () => {
    await save(await newInvite());
    expect(
      await reason(
        requestFeederRate(deps(), who(FEEDER_JUNIOR), {
          corporationId: FEEDER,
          accessToken: `roles-${FEEDER_JUNIOR}`,
          pct: 5,
        })
      )
    ).toBe('not-your-feeder');
  });

  it('leave: keeps the view, writes the Previous pointer and keeps access working', async () => {
    await save(await newInvite(), 6);
    await leaveFeeder(deps(), who(FEEDER_DIRECTOR), asDirector);
    expect(await pointer()).toBeUndefined();
    expect(
      (await db.collection('corpTaxBookFeederPrevious').doc(String(FEEDER)).get()).data()
    ).toEqual({ collectorCorporationId: COLLECTOR, leftAt: T0 });
    // joined and left the same day: no day was ever covered
    expect(await summary()).toMatchObject({ status: 'left', leftAt: T0, coverageFrom: null });
    const out = await getFeederViewAccess(deps(), who(FEEDER_DIRECTOR), asDirector);
    expect(out.collectorCorporationId).toBe(COLLECTOR);
  });

  it('dismiss: refused while active, works after leaving and sticks', async () => {
    await save(await newInvite());
    expect(await reason(dismissFeederHistory(deps(), who(FEEDER_DIRECTOR), asDirector))).toBe(
      'not-ended'
    );
    await leaveFeeder(deps(), who(FEEDER_DIRECTOR), asDirector);
    await dismissFeederHistory(deps(), who(FEEDER_DIRECTOR), asDirector);
    expect(await summary()).toMatchObject({ dismissedAt: T0 });
    expect((await feederRecord())?.viewDismissedAt).toBe(T0);
    await dismissFeederHistory(deps(), who(FEEDER_DIRECTOR), asDirector);
    expect((await summary())?.dismissedAt).toBe(T0);
  });
});
