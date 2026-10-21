// Collector books: removing a moon owner against the Firestore emulator (issue #4520).
// Runs only under `npm run test:rules` at the repo root; a plain `npm test` skips it.
import { beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseTurnOnInput } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import { type CorpSyncDeps } from './corpSyncGrant.js';
import { acceptFeederInvite, createFeederInvite, type FeederRecord } from './corpTaxBookFeeders.js';
import { leaveFeeder } from './corpTaxBookFeederGrant.js';
import { setFeederPayee } from './corpTaxBookFeederOwnerCalls.js';
import {
  cancelFeederRemoval,
  finalizeDueRemovals,
  forceRemovalNow,
  getRemovalLink,
  recordRemovalSent,
  startFeederRemoval,
} from './corpTaxBookFeederRemoval.js';
import { turnOnBook, verifyOfficer, type BookDeps, type Caller } from './corpTaxBookStore.js';

const COLLECTOR = 98000001;
const FEEDER = 98000002;
const PAYEE_CORP = 98000003;
const H = 3_600_000;
const T0 = Date.parse('2026-10-18T12:00:00Z');

const CEO = 1;
const ACCOUNTANT = 2;
const OTHER_ACCOUNTANT = 3;
const JUNIOR = 4;
const FEEDER_DIRECTOR = 11;
const FEEDER_CEO = 12;
const PAYEE = 21;
const STRANGER = 99;
const PAYEE_CORP_CEO = 31;

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
  corporationCeo: async (corp) =>
    corp === FEEDER ? FEEDER_CEO : corp === PAYEE_CORP ? PAYEE_CORP_CEO : undefined,
});
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
const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const tok = (id: number) => `tok-${id}`;
const call = (id: number) => ({ corporationId: COLLECTOR, accessToken: tok(id) });
const target = (id: number) => ({ ...call(id), feederCorporationId: FEEDER });
const collectorBook = () => db.collection('corpTaxBooks').doc(String(COLLECTOR));
const record = async () =>
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

const setPayee = (payee: { kind: 'character' | 'corporation'; id: number }) =>
  setFeederPayee(deps(), who(ACCOUNTANT), { ...target(ACCOUNTANT), payee });
/** A real change of payee: away and back, so the stamp moves even for the same final payee. */
const changePayeeTo = async (payee: { kind: 'character' | 'corporation'; id: number }) => {
  await setPayee({ kind: 'character', id: STRANGER });
  await setPayee(payee);
};

suite('removing a moon owner', () => {
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    identities.clear();
    identities.set(CEO, { corporationId: COLLECTOR, ceoId: CEO, roles: [] });
    for (const id of [ACCOUNTANT, OTHER_ACCOUNTANT]) {
      identities.set(id, { corporationId: COLLECTOR, ceoId: null, roles: ['Accountant'] });
    }
    identities.set(JUNIOR, { corporationId: COLLECTOR, ceoId: null, roles: ['Junior_Accountant'] });
    identities.set(FEEDER_DIRECTOR, { corporationId: FEEDER, ceoId: null, roles: ['Director'] });
    await turnOnBook(
      deps(),
      who(CEO),
      parseTurnOnInput({
        corporationId: COLLECTOR,
        accessToken: tok(CEO),
        startDate: '2026-10-01',
        startRatePct: 10,
      })
    );
    const { code } = await createFeederInvite(deps(), who(ACCOUNTANT), call(ACCOUNTANT));
    await acceptFeederInvite(deps(), who(FEEDER_DIRECTOR), {
      code,
      accessToken: tok(FEEDER_DIRECTOR),
    });
    await setPayee({ kind: 'character', id: PAYEE });
    now = T0 + 100 * H;
    // The officers who have visited lately have access records; only those are mailed.
    await verifyOfficer(deps(), who(CEO), call(CEO));
    await verifyOfficer(deps(), who(OTHER_ACCOUNTANT), call(OTHER_ACCOUNTANT));
  });

  const start = () => startFeederRemoval(deps(), who(ACCOUNTANT), target(ACCOUNTANT));

  it('starts pending with no clock, a link, and the right recipients', async () => {
    const result = await start();
    const rec = await record();
    expect(rec?.status).toBe('pending-removal');
    expect(rec?.removal).toMatchObject({ startedAt: now, startedBy: ACCOUNTANT });
    expect(rec?.removal?.effectiveAt).toBeUndefined();
    // The book's other officers, the moon owner's CEO and its payee; not the starter.
    expect([...result.recipients].sort()).toEqual(
      [CEO, OTHER_ACCOUNTANT, FEEDER_CEO, PAYEE].sort()
    );
    expect(result.recipients).not.toContain(ACCOUNTANT);
    const links = await db.collection('corpTaxBookRemovalLinks').get();
    expect(links.size).toBe(1);
    expect(JSON.stringify(links.docs[0]!.data())).not.toContain(result.code);
  });

  it('refuses a junior, and a second start', async () => {
    expect(await reason(startFeederRemoval(deps(), who(JUNIOR), target(JUNIOR)))).toBe(
      'role-required'
    );
    await start();
    expect(await reason(start())).toBe('not-removable');
  });

  it('starts the 24 hours when the mail is sent, not at the click', async () => {
    await start();
    now += 3 * H;
    const sent = await recordRemovalSent(deps(), who(ACCOUNTANT), target(ACCOUNTANT));
    expect(sent.effectiveAt).toBe(now + 24 * H);
    // A second notice changes nothing.
    now += H;
    const again = await recordRemovalSent(deps(), who(ACCOUNTANT), target(ACCOUNTANT));
    expect(again.effectiveAt).toBe(sent.effectiveAt);
  });

  it('does not take effect while the mail is unsent', async () => {
    await start();
    now += 1000 * H;
    expect((await finalizeDueRemovals(syncDeps())).ended).toBe(0);
    expect((await record())?.status).toBe('pending-removal');
  });

  it('takes effect once the wait is over, ending coverage the day before', async () => {
    await start();
    await recordRemovalSent(deps(), who(ACCOUNTANT), target(ACCOUNTANT));
    const effective = now + 24 * H;
    now = effective - H;
    expect((await finalizeDueRemovals(syncDeps())).ended).toBe(0);
    now = effective + H;
    expect((await finalizeDueRemovals(syncDeps())).ended).toBe(1);
    const rec = await record();
    expect(rec?.status).toBe('removed');
    expect(rec?.coveragePeriods.at(-1)?.to).toBe(
      new Date(effective - 24 * H).toISOString().slice(0, 10)
    );
    expect(await pointer()).toBeUndefined();
  });

  it('is cancelled by any Accountant, not only the starter', async () => {
    await start();
    const { recipients } = await cancelFeederRemoval(
      deps(),
      who(OTHER_ACCOUNTANT),
      target(OTHER_ACCOUNTANT)
    );
    expect((await record())?.status).toBe('active');
    expect((await record())?.removal).toBeUndefined();
    expect(recipients).toContain(ACCOUNTANT);
    expect(recipients).not.toContain(OTHER_ACCOUNTANT);
    expect(
      await db
        .collection('corpTaxBookRemovalLinks')
        .get()
        .then((s) => s.size)
    ).toBe(0);
  });

  it('is ended by the moon owner leaving, and reads as removed', async () => {
    await start();
    await leaveFeeder(
      {
        ...syncDeps(),
        verify: async () => ({
          characterId: FEEDER_DIRECTOR,
          ownerHash: `h${FEEDER_DIRECTOR}`,
          name: 'D',
          scopes: [ROLES_SCOPE],
          clientId: 'c',
        }),
        readIdentity: async (id) => identities.get(id)!,
      },
      who(FEEDER_DIRECTOR),
      { corporationId: FEEDER, accessToken: tok(FEEDER_DIRECTOR) }
    );
    expect((await record())?.status).toBe('removed');
  });

  describe("the payee's link", () => {
    const force = (code: string, id = PAYEE) =>
      forceRemovalNow(syncDeps(), who(id), { code }, deps().corporationCeo);

    it('lets a long-standing payee end it now', async () => {
      const { code } = await start();
      await recordRemovalSent(deps(), who(ACCOUNTANT), target(ACCOUNTANT));
      expect(await getRemovalLink(deps(), who(PAYEE), { code })).toMatchObject({ available: true });
      expect((await force(code)).ended).toBe(true);
      const rec = await record();
      expect(rec?.status).toBe('removed');
      expect(rec?.coveragePeriods.at(-1)?.to).toBe(
        new Date(now - 24 * H).toISOString().slice(0, 10)
      );
    });

    it('answers a guarded payee exactly as it answers an expired link', async () => {
      // Payee changed 47h before the start: the guard blocks it.
      now = T0 + 200 * H;
      await changePayeeTo({ kind: 'character', id: PAYEE });
      now += 47 * H;
      const guarded = await start();
      await recordRemovalSent(deps(), who(ACCOUNTANT), target(ACCOUNTANT));
      const blocked = await getRemovalLink(deps(), who(PAYEE), { code: guarded.code });
      const blockedForce = await force(guarded.code);
      expect(blockedForce.ended).toBe(false);
      expect((await record())?.status).toBe('pending-removal');
      // Expire the same link: the response has the same shape and contents.
      now += 500 * H;
      const expired = await getRemovalLink(deps(), who(PAYEE), { code: guarded.code });
      expect(Object.keys(blocked).sort()).toEqual(Object.keys(expired).sort());
      expect(blocked).toEqual(expired);
      expect({ ...blockedForce }).toEqual(await force(guarded.code));
    });

    it('allows a payee changed 49 hours before the start', async () => {
      now = T0 + 200 * H;
      await changePayeeTo({ kind: 'character', id: PAYEE });
      now += 49 * H;
      const { code } = await start();
      await recordRemovalSent(deps(), who(ACCOUNTANT), target(ACCOUNTANT));
      expect((await force(code)).ended).toBe(true);
    });

    it('is blocked when the payee changed after the start', async () => {
      const { code } = await start();
      await recordRemovalSent(deps(), who(ACCOUNTANT), target(ACCOUNTANT));
      now += H;
      await setPayee({ kind: 'character', id: STRANGER });
      expect((await force(code, STRANGER)).ended).toBe(false);
      expect((await force(code)).ended).toBe(false);
    });

    it('lets only the CEO in when the payee is a corporation', async () => {
      await setPayee({ kind: 'corporation', id: PAYEE_CORP });
      now += 100 * H;
      const { code } = await start();
      await recordRemovalSent(deps(), who(ACCOUNTANT), target(ACCOUNTANT));
      expect((await force(code, STRANGER)).ended).toBe(false);
      expect((await force(code, PAYEE)).ended).toBe(false);
      expect((await force(code, PAYEE_CORP_CEO)).ended).toBe(true);
    });

    it('is the same neutral answer for a stranger and an unknown code', async () => {
      const { code } = await start();
      const stranger = await getRemovalLink(deps(), who(STRANGER), { code });
      expect(stranger).toMatchObject({ available: false });
      expect(await getRemovalLink(deps(), who(PAYEE), { code: 'nope' })).toMatchObject({
        available: false,
      });
    });
  });

  it('stamps payeeChangedAt on every payee change', async () => {
    const first = (await record())?.payeeChangedAt;
    expect(first).toBeDefined();
    now += H;
    await setPayee({ kind: 'character', id: PAYEE });
    expect((await record())?.payeeChangedAt).toBe(first);
    await setPayee({ kind: 'corporation', id: PAYEE_CORP });
    expect((await record())?.payeeChangedAt).toBe(now);
  });
});
