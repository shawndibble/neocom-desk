// SRP Doctrine Fits against the Firestore emulator (issue #4857, ADR 0026). Runs only under the
// emulator (`npm run test:emulator`); a plain `npm test` skips it.
import type { Caller } from './actorAuth.js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clearEmulator, emulatorDb, emulatorSuite } from './testSupport/emulator.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseBookCall } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import { parseSrpSettingsPatch } from './srp.js';
import { parseDeleteDoctrine, parseSaveDoctrine } from './srpDoctrineInput.js';
import { deleteSrpDoctrine, previewSrpDoctrineCheck, saveSrpDoctrine } from './srpDoctrineStore.js';
import {
  parseFileClaimInput,
  type EsiKillmail,
  type SrpKillmailSource,
  type ZkillRecord,
} from './srpKillmail.js';
import { FETCH_LIMIT, FETCH_WINDOW_MS } from './srpThrottle.js';
import { fileSrpClaim, saveSrpSettings, turnOnSrp, type SrpFileDeps } from './srpStore.js';

const CORP = 98000001;
const DAY = 86_400_000;
const T0 = Date.parse('2026-10-23T12:00:00Z');
const HASH = 'b'.repeat(40);
const HULL = 587; // Rifter
const HIGH = 405; // SDE slot map: a high-slot module
const MED = 380; // a medium-slot module

const db = emulatorDb;
let now = T0;
const identities = new Map<number, CorpIdentity>();
const affiliations = new Map<number, number>();
const killmails = new Map<number, EsiKillmail>();

const source: SrpKillmailSource = {
  zkill: async (): Promise<ZkillRecord> => ({ hash: HASH, totalValue: 20_000_000 }),
  killmail: async (id) => {
    const km = killmails.get(id);
    if (!km)
      throw new HttpsError('not-found', 'No such killmail', { reason: 'killmail-not-found' });
    return km;
  },
  shipGroupId: async () => 25,
  jitaValue: async () => null,
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
  readIdentity: async (characterId) => {
    const identity = identities.get(characterId);
    if (!identity) throw new Error('no identity');
    return identity;
  },
  lookupCorporation: async (characterId) => {
    const corp = affiliations.get(characterId);
    if (corp === undefined) throw new Error('no affiliation');
    return corp;
  },
  killmails: source,
});

const CEO = 1;
const DIRECTOR = 2;
const ACCOUNTANT = 3;
const PILOT = 5;
const OTHER_PILOT = 7;
const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const call = (id: number) => parseBookCall({ corporationId: CORP, accessToken: `tok-${id}` });

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
const doctrines = async () =>
  (await corp().collection('srpDoctrines').get()).docs.map((d) => d.data());
const settings = async () => (await corp().collection('srp').doc('settings').get()).data();
const claim = async (id: number) =>
  (await corp().collection('srpClaims').doc(String(id)).get()).data();
const audit = async (action: string) =>
  (await corp().collection('srpAudit').get()).docs
    .map((d) => d.data())
    .filter((a) => a.action === action);

const save = (data: Record<string, unknown>, as = DIRECTOR) =>
  saveSrpDoctrine(deps(), who(as), call(as), parseSaveDoctrine(data));
const fit = (over: Record<string, unknown> = {}, hullTypeId = HULL) => ({
  name: 'Fleet Rifter',
  snapshot: { hullTypeId, modules: [HIGH, MED], rigs: [] },
  ...over,
});
const setRules = (patch: Record<string, unknown>, as = DIRECTOR) =>
  saveSrpSettings(deps(), who(as), call(as), parseSrpSettingsPatch(patch));
const rule = (doctrineIds: string[], id = HULL) => ({
  hullRules: [{ scope: 'hull', id, kind: 'pay-percent', doctrineIds }],
});

function loss(id: number, items: EsiKillmail['victim']['items'], pilot = PILOT, hull = HULL) {
  killmails.set(id, {
    killmailId: id,
    killedAt: T0 - 2 * DAY,
    solarSystemId: 30000142,
    victim: { characterId: pilot, corporationId: CORP, shipTypeId: hull, items },
  });
}
const slotted = (type: number, flag: number) => ({
  item_type_id: type,
  flag,
  quantity_destroyed: 1,
  quantity_dropped: 0,
});
const MATCHING = [
  slotted(HIGH, 27),
  slotted(MED, 19),
  { item_type_id: 34, flag: 5, quantity_destroyed: 9 },
];

const file = (id: number, pilot = PILOT) =>
  fileSrpClaim(
    deps(),
    who(pilot),
    call(pilot),
    parseFileClaimInput({ killmail: `https://zkillboard.com/kill/${id}/` })
  );
const preview = (id: number, pilot = PILOT) =>
  previewSrpDoctrineCheck(
    deps(),
    who(pilot),
    call(pilot),
    parseFileClaimInput({ killmail: `https://zkillboard.com/kill/${id}/` }).ref
  );

emulatorSuite('SRP doctrine-fit (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    identities.clear();
    affiliations.clear();
    killmails.clear();
    identities.set(CEO, { corporationId: CORP, ceoId: CEO, roles: [] });
    identities.set(DIRECTOR, { corporationId: CORP, ceoId: CEO, roles: ['Director'] });
    identities.set(ACCOUNTANT, { corporationId: CORP, ceoId: CEO, roles: ['Accountant'] });
    identities.set(PILOT, { corporationId: CORP, ceoId: CEO, roles: [] });
    for (const id of [CEO, DIRECTOR, ACCOUNTANT, PILOT, OTHER_PILOT]) affiliations.set(id, CORP);
    await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
    await setRules({ killmailPct: 80 });
  });

  describe('saving and deleting a Doctrine Fit', () => {
    it('needs a Director (the CEO too), re-checked live', async () => {
      expect(await reason(save(fit(), ACCOUNTANT))).toBe('role-required');
      expect(await reason(save(fit(), PILOT))).toBe('not-an-officer');
      await save(fit(), CEO);
      identities.set(DIRECTOR, { corporationId: CORP, ceoId: CEO, roles: [] }); // demoted
      expect(await reason(save(fit()))).toBe('not-an-officer');
      expect(await doctrines()).toHaveLength(1);
    });

    it('stores the snapshot, audits it, and replaces by id keeping the creator', async () => {
      const { id } = await save(
        fit({ snapshot: { hullTypeId: HULL, modules: [MED, HIGH], rigs: [] } })
      );
      expect(await doctrines()).toEqual([
        {
          id,
          name: 'Fleet Rifter',
          snapshot: {
            hullTypeId: HULL,
            name: 'Fleet Rifter',
            modules: [HIGH, MED].sort((a, b) => a - b),
            rigs: [],
          },
          createdBy: DIRECTOR,
          createdAt: T0,
        },
      ]);
      now = T0 + 1000;
      await save({ ...fit({ name: 'Renamed' }), id }, CEO);
      const [after] = await doctrines();
      expect(after).toMatchObject({ id, name: 'Renamed', createdBy: DIRECTOR, createdAt: T0 });
      expect((await audit('addDoctrine'))[0]).toMatchObject({
        by: DIRECTOR,
        detail: { doctrineId: id, hullTypeId: HULL, modules: 2, rigs: 0 },
      });
      expect(await audit('updateDoctrine')).toHaveLength(1);
    });

    it('refuses an unknown id and a 101st fit', async () => {
      expect(await reason(save({ ...fit(), id: 'nope' }))).toBe('doctrine-not-found');
      for (let i = 0; i < 100; i++) await save(fit({ name: `Fit ${i}` }));
      expect(await reason(save(fit()))).toBe('too-many-doctrines');
      const [first] = await doctrines();
      await save({ ...fit({ name: 'still ok' }), id: first.id }); // replacing is not adding
      expect(await doctrines()).toHaveLength(100);
    });

    it('deletes, drops the id from Hull Rules, and audits', async () => {
      const a = (await save(fit())).id;
      const b = (await save(fit({ name: 'Second' }))).id;
      await setRules({
        hullRules: [
          { scope: 'hull', id: HULL, kind: 'pay-percent', doctrineIds: [a, b] },
          { scope: 'class', id: 25, kind: 'not-covered' },
        ],
      });
      expect(
        await reason(deleteSrpDoctrine(deps(), who(ACCOUNTANT), call(ACCOUNTANT), { id: a }))
      ).toBe('role-required');
      await deleteSrpDoctrine(
        deps(),
        who(DIRECTOR),
        call(DIRECTOR),
        parseDeleteDoctrine({ id: a })
      );
      expect((await doctrines()).map((d) => d.id)).toEqual([b]);
      expect((await settings())?.hullRules[0].doctrineIds).toEqual([b]);
      await deleteSrpDoctrine(deps(), who(DIRECTOR), call(DIRECTOR), { id: b });
      expect((await settings())?.hullRules).toEqual([
        { scope: 'hull', id: HULL, kind: 'pay-percent' },
        { scope: 'class', id: 25, kind: 'not-covered' },
      ]);
      expect(await audit('deleteDoctrine')).toHaveLength(2);
      expect(
        await reason(deleteSrpDoctrine(deps(), who(DIRECTOR), call(DIRECTOR), { id: b }))
      ).toBe('doctrine-not-found');
    });
  });

  describe('Hull Rule doctrineIds', () => {
    it('accepts existing fits of the rule hull and keeps old rules working', async () => {
      const { id } = await save(fit());
      await setRules(rule([id]));
      expect((await settings())?.hullRules).toEqual([
        { scope: 'hull', id: HULL, kind: 'pay-percent', doctrineIds: [id] },
      ]);
      await setRules({ hullRules: [{ scope: 'hull', id: HULL, kind: 'pay-percent' }] });
      loss(1001, MATCHING);
      expect((await file(1001)).doctrineCheck).toEqual({ status: 'not-checked' });
    });

    it('refuses an unknown fit and a fit of another hull', async () => {
      expect(await reason(setRules(rule(['ghost'])))).toBe('unknown-doctrine');
      const { id } = await save(fit({}, 999));
      expect(await reason(setRules(rule([id])))).toBe('doctrine-hull-mismatch');
      expect((await settings())?.hullRules).toEqual([]);
    });

    it('refuses moving a listed fit to another hull, but allows it once unlisted', async () => {
      const { id } = await save(fit());
      await setRules(rule([id]));
      expect(await reason(save({ ...fit({}, 999), id }))).toBe('doctrine-hull-listed');
      await setRules({ hullRules: [{ scope: 'hull', id: HULL, kind: 'pay-percent' }] });
      await save({ ...fit({}, 999), id });
      expect((await doctrines())[0].snapshot.hullTypeId).toBe(999);
    });
  });

  describe('killmail fetch throttle', () => {
    it('refuses a pilot past the limit, spares others, and recovers after the window', async () => {
      loss(1001, MATCHING);
      for (let i = 0; i < FETCH_LIMIT; i++) await preview(1001);
      expect(await reason(preview(1001))).toBe('rate-limited');
      expect(await reason(file(1001))).toBe('rate-limited'); // filing shares the budget
      loss(1002, MATCHING, OTHER_PILOT);
      await preview(1002, OTHER_PILOT);
      now += FETCH_WINDOW_MS;
      await preview(1001);
    });
  });

  describe('filing', () => {
    it('stores a matched check with the fit name; stays pending', async () => {
      const { id } = await save(fit());
      await setRules(rule([id]));
      loss(1001, MATCHING);
      const filed = await file(1001);
      expect(filed.doctrineCheck).toEqual({
        status: 'matched',
        doctrineId: id,
        doctrineName: 'Fleet Rifter',
      });
      expect(await claim(1001)).toMatchObject({
        state: 'pending',
        doctrineCheck: { status: 'matched', doctrineId: id, doctrineName: 'Fleet Rifter' },
      });
      expect((await audit('fileClaim'))[0]).toMatchObject({
        detail: { doctrineStatus: 'matched' },
      });
    });

    it('flags off-doctrine with a diff, never rejects, and the snapshot survives edit and delete', async () => {
      const { id } = await save(fit());
      await setRules(rule([id]));
      loss(1001, [slotted(HIGH, 27)]);
      const filed = await file(1001);
      expect(filed.doctrineCheck).toEqual({
        status: 'off-doctrine',
        doctrineId: id,
        doctrineName: 'Fleet Rifter',
        diff: { missingModules: [MED], extraModules: [], missingRigs: [], extraRigs: [] },
      });
      expect(await claim(1001)).toMatchObject({ state: 'pending', amount: 16_000_000 });
      await save({ ...fit({ name: 'Edited' }), id });
      await deleteSrpDoctrine(deps(), who(DIRECTOR), call(DIRECTOR), { id });
      expect((await claim(1001))?.doctrineCheck).toMatchObject({
        status: 'off-doctrine',
        doctrineName: 'Fleet Rifter',
      });
    });

    it('does not check a hull whose rule lists no fit', async () => {
      loss(1001, []);
      expect((await file(1001)).doctrineCheck).toEqual({ status: 'not-checked' });
      expect((await claim(1001))?.doctrineCheck).toEqual({ status: 'not-checked' });
    });
  });

  describe('previewing', () => {
    it('returns the check a filing would store and writes nothing', async () => {
      const { id } = await save(fit());
      await setRules(rule([id]));
      loss(1001, [slotted(HIGH, 27)]);
      const before = (await corp().collection('srpAudit').get()).size;
      expect(await preview(1001)).toMatchObject({
        killmailId: 1001,
        killedAt: T0 - 2 * DAY,
        solarSystemId: 30000142,
        values: { killmailValue: 20_000_000, hullValue: null, fitValue: null },
        hullTypeId: HULL,
        check: {
          status: 'off-doctrine',
          doctrineId: id,
          doctrineName: 'Fleet Rifter',
          diff: { missingModules: [MED], extraModules: [], missingRigs: [], extraRigs: [] },
        },
      });
      expect(await claim(1001)).toBeUndefined();
      expect((await corp().collection('srpAudit').get()).size).toBe(before);
      expect((await file(1001)).doctrineCheck.status).toBe('off-doctrine');
    });

    it('is for the pilot’s own loss in this corp, with SRP on', async () => {
      loss(1001, [], OTHER_PILOT);
      expect(await reason(preview(1001))).toBe('not-your-loss');
      loss(1002, []);
      await db
        .collection('corps')
        .doc(String(CORP))
        .collection('srp')
        .doc('settings')
        .update({ enabled: false });
      expect(await reason(preview(1002))).toBe('srp-off');
    });
  });
});
