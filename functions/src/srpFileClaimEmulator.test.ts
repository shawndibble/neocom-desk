// fileSrpClaim against the Firestore emulator (issue #4850, ADR 0026). Runs only under the
// emulator (`npm run test:emulator`); a plain `npm test` skips it.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseBookCall } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import type { Caller } from './corpTaxBookStore.js';
import { parseSrpSettingsPatch } from './srp.js';
import {
  parseFileClaimInput,
  type EsiKillmail,
  type SrpKillmailSource,
  type ZkillRecord,
} from './srpKillmail.js';
import { fileSrpClaim, saveSrpSettings, turnOnSrp, type SrpFileDeps } from './srpStore.js';

const CORP = 98000001;
const DAY = 86_400_000;
const T0 = Date.parse('2026-10-23T12:00:00Z');
const HASH = 'b'.repeat(40);
const HULL = 587; // Rifter
const GROUP = 25; // Frigate

const runnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runnable ? describe : describe.skip;

let db: Firestore;
let now = T0;
const affiliations = new Map<number, number>();
const killmails = new Map<number, EsiKillmail>();
let zkill: (id: number) => Promise<ZkillRecord>;
let jita: number | null;
let jitaCalls = 0;

const source: SrpKillmailSource = {
  zkill: (id) => zkill(id),
  killmail: async (id) => {
    const km = killmails.get(id);
    if (!km)
      throw new HttpsError('not-found', 'No such killmail', { reason: 'killmail-not-found' });
    return km;
  },
  shipGroupId: async () => GROUP,
  jitaValue: async () => {
    jitaCalls += 1;
    return jita;
  },
};

const deps = (): SrpFileDeps => ({
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
  readIdentity: async (): Promise<CorpIdentity> => ({
    corporationId: CORP,
    ceoId: 1,
    roles: ['Director'],
  }),
  lookupCorporation: async (characterId) => {
    const corp = affiliations.get(characterId);
    if (corp === undefined) throw new Error('no affiliation');
    return corp;
  },
  killmails: source,
});

const DIRECTOR = 2;
const PILOT = 5;
const OTHER_PILOT = 7;
const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const call = (id: number) => parseBookCall({ corporationId: CORP, accessToken: `tok-${id}` });
const input = (id: number, extra: Record<string, unknown> = {}) =>
  parseFileClaimInput({ killmail: `https://zkillboard.com/kill/${id}/`, ...extra });
const file = (id: number, extra: Record<string, unknown> = {}, pilot = PILOT) =>
  fileSrpClaim(deps(), who(pilot), call(pilot), input(id, extra));

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return String(((err as HttpsError).details as { reason?: string } | undefined)?.reason);
  }
  throw new Error('expected the call to fail');
}

const corp = () => db.collection('corps').doc(String(CORP));
const claim = async (id: number) =>
  (await corp().collection('srpClaims').doc(String(id)).get()).data();
const audit = async () => (await corp().collection('srpAudit').get()).docs.map((d) => d.data());

function loss(
  id: number,
  over: Partial<EsiKillmail> = {},
  victim: Partial<EsiKillmail['victim']> = {}
) {
  killmails.set(id, {
    killmailId: id,
    killedAt: T0 - 2 * DAY,
    solarSystemId: 30000142,
    victim: {
      characterId: PILOT,
      corporationId: CORP,
      shipTypeId: HULL,
      items: [{ item_type_id: 34, quantity_destroyed: 10 }],
      ...victim,
    },
    ...over,
  });
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

const setRules = (patch: Record<string, unknown>) =>
  saveSrpSettings(deps(), who(DIRECTOR), call(DIRECTOR), parseSrpSettingsPatch(patch));

suite('fileSrpClaim (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    jita = null;
    jitaCalls = 0;
    zkill = async (id) => ({ hash: HASH, totalValue: id === 1 ? 20_000_000 : 20_000_000 });
    affiliations.clear();
    killmails.clear();
    for (const id of [DIRECTOR, PILOT, OTHER_PILOT]) affiliations.set(id, CORP);
    await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
    await setRules({ killmailPct: 80 });
    loss(1001);
  });

  it('files a claim: id is the killmail, killmail-percent amount, audit entry, identity fields', async () => {
    expect(await file(1001)).toMatchObject({
      killmailId: 1001,
      state: 'pending',
      amount: 16_000_000,
    });
    expect(await claim(1001)).toMatchObject({
      uid: `char:${PILOT}`,
      ownerHash: `h${PILOT}`,
      corporationId: CORP,
      killmailId: 1001,
      killmailHash: HASH,
      characterId: PILOT,
      hullTypeId: HULL,
      classId: GROUP,
      solarSystemId: 30000142,
      killedAt: T0 - 2 * DAY,
      state: 'pending',
      amount: 16_000_000,
      basis: { step: 'killmail-percent', percent: 80 },
      hullRule: null,
      killmailValue: 20_000_000,
      valueSource: 'zkillboard',
      refileCount: 0,
    });
    const entries = (await audit()).filter((a) => a.action === 'fileClaim');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      by: PILOT,
      detail: { killmailId: 1001, amount: 16_000_000 },
    });
    expect(jitaCalls).toBe(0);
  });

  it('records the Hull Rule used', async () => {
    await setRules({
      hullRules: [{ scope: 'hull', id: HULL, kind: 'pay-fixed', iskAmount: 5_000_000 }],
    });
    await file(1001);
    expect(await claim(1001)).toMatchObject({
      amount: 5_000_000,
      basis: { step: 'hull-fixed' },
      hullRule: { scope: 'hull', id: HULL, kind: 'pay-fixed' },
    });
  });

  it('refuses when SRP is off or was never turned on', async () => {
    await db
      .collection('corps')
      .doc(String(CORP))
      .collection('srp')
      .doc('settings')
      .update({ enabled: false });
    expect(await reason(file(1001))).toBe('srp-off');
  });

  it('refuses a loss that is not the signed-in Character', async () => {
    loss(1002, {}, { characterId: OTHER_PILOT });
    expect(await reason(file(1002))).toBe('not-your-loss');
    expect(await claim(1002)).toBeUndefined();
  });

  it('refuses a loss under another corporation at the time', async () => {
    loss(1003, {}, { corporationId: 98000999 });
    expect(await reason(file(1003))).toBe('loss-in-other-corp');
  });

  it('refuses a caller who is not in the corp now', async () => {
    affiliations.set(PILOT, 98000999);
    expect(await reason(file(1001))).toBe('wrong-corp');
  });

  it('refuses a loss outside the claim window', async () => {
    loss(1004, { killedAt: T0 - 31 * DAY });
    expect(await reason(file(1004))).toBe('outside-window');
    await setRules({ windowDays: 60 });
    expect(await file(1004)).toMatchObject({ killmailId: 1004 });
  });

  it('refuses a second claim for the same killmail, even a Pending or Approved one', async () => {
    await file(1001);
    expect(await reason(file(1001))).toBe('already-claimed');
    await corp().collection('srpClaims').doc('1001').update({ state: 'approved' });
    expect(await reason(file(1001))).toBe('already-claimed');
  });

  it("does not reveal another pilot's claim: not-your-loss comes before already-claimed", async () => {
    await file(1001);
    expect(await reason(file(1001, {}, OTHER_PILOT))).toBe('not-your-loss');
    loss(1005, {}, { characterId: OTHER_PILOT });
    await file(1005, {}, OTHER_PILOT);
    expect(await reason(file(1005))).toBe('not-your-loss');
  });

  it('refuses a hull the corp does not cover', async () => {
    await setRules({ hullRules: [{ scope: 'class', id: GROUP, kind: 'not-covered' }] });
    expect(await reason(file(1001))).toBe('not-covered');
    expect(await claim(1001)).toBeUndefined();
  });

  it('allows one re-file after Rejected, needing a note, and not a second', async () => {
    await file(1001);
    await corp()
      .collection('srpClaims')
      .doc('1001')
      .update({ state: 'rejected', closedAt: T0, rejectionReason: 'wrong fleet' });
    expect(await reason(file(1001))).toBe('note-required');
    expect(await file(1001, { note: 'It was a corp op' })).toMatchObject({ state: 'pending' });
    expect(await claim(1001)).toMatchObject({
      state: 'pending',
      refileCount: 1,
      note: 'It was a corp op',
      previousRejectionReason: 'wrong fleet',
    });
    expect((await claim(1001))?.closedAt).toBeUndefined();
    expect((await audit()).filter((a) => a.action === 'refileClaim')).toHaveLength(1);
    await corp().collection('srpClaims').doc('1001').update({ state: 'rejected' });
    expect(await reason(file(1001, { note: 'again' }))).toBe('already-claimed');
  });

  it('falls back to the Jita Appraisal when zKillboard is down for an ESI link', async () => {
    await setRules({ appraisalPct: 50 });
    await setRules({ killmailPct: null });
    zkill = async () => ({ hash: null, totalValue: null });
    jita = 30_000_000;
    const esiLink = parseFileClaimInput({
      killmail: `https://esi.evetech.net/latest/killmails/1001/${HASH}/`,
    });
    expect(await fileSrpClaim(deps(), who(PILOT), call(PILOT), esiLink)).toMatchObject({
      amount: 15_000_000,
    });
    expect(await claim(1001)).toMatchObject({
      basis: { step: 'appraisal-percent', percent: 50 },
      killmailValue: null,
      appraisalValue: 30_000_000,
      valueSource: 'appraisal',
    });
  });

  it('falls back to the Jita Appraisal when zKillboard throws', async () => {
    await setRules({ appraisalPct: 50 });
    zkill = async () => {
      throw new Error('zkill down');
    };
    const esiLink = parseFileClaimInput({
      killmail: `https://esi.evetech.net/latest/killmails/1001/${HASH}/`,
    });
    jita = 30_000_000;
    expect(await fileSrpClaim(deps(), who(PILOT), call(PILOT), esiLink)).toMatchObject({
      amount: 15_000_000,
    });
  });

  it('leaves the amount for the officer when no value is known', async () => {
    zkill = async () => ({ hash: HASH, totalValue: null });
    expect(await file(1001)).toMatchObject({ amount: null });
    expect(await claim(1001)).toMatchObject({ amount: null, basis: null, valueSource: 'none' });
  });

  it('cannot find a zKillboard-link hash while zKillboard is down', async () => {
    zkill = async () => ({ hash: null, totalValue: null });
    expect(await reason(file(1001))).toBe('hash-unavailable');
    expect(await claim(1001)).toBeUndefined();
  });

  it('needs Fleet or FC when the corp requires it', async () => {
    await setRules({ requireFleetOrFc: true });
    expect(await reason(file(1001))).toBe('fleet-or-fc-required');
    await file(1001, { fleetOrFc: 'Alpha / FC Bob' });
    expect(await claim(1001)).toMatchObject({ fleetOrFc: 'Alpha / FC Bob' });
  });
});
