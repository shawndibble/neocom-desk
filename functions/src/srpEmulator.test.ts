// SRP callables against the Firestore emulator (issue #4848, ADR 0026). Runs
// only under `npm run test:rules` at the repo root (which starts the emulator
// and sets FIRESTORE_EMULATOR_HOST); a plain `npm test` skips it.
import type { Caller } from './actorAuth.js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseBookCall } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import { parseSrpSettingsPatch } from './srp.js';
import {
  getSrpStatus,
  reclaimSrp,
  saveSrpSettings,
  turnOffSrp,
  turnOnSrp,
  verifySrpOfficer,
  type SrpDeps,
} from './srpStore.js';

const CORP = 98000001;
const T0 = Date.parse('2026-10-23T12:00:00Z');

const runnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runnable ? describe : describe.skip;

let db: Firestore;
let now = T0;
let identityCalls = 0;
const identities = new Map<number, CorpIdentity>();
const affiliations = new Map<number, number>();

const deps = (): SrpDeps => ({
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
    identityCalls += 1;
    const identity = identities.get(characterId);
    if (!identity) throw new Error('no identity');
    return identity;
  },
  lookupCorporation: async (characterId) => {
    const corp = affiliations.get(characterId);
    if (corp === undefined) throw new Error('no affiliation');
    return corp;
  },
});

const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const call = (id: number) => parseBookCall({ corporationId: CORP, accessToken: `tok-${id}` });

const CEO = 1;
const DIRECTOR = 2;
const ACCOUNTANT = 3;
const JUNIOR = 4;
const PILOT = 5;
const OUTSIDER = 6;

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
const settings = async () => (await corp().collection('srp').doc('settings').get()).data();
const officerDoc = (id: number) => corp().collection('srpOfficers').doc(`char:${id}`).get();
const audit = async () => (await corp().collection('srpAudit').get()).docs.map((d) => d.data());

if (runnable) {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-neocom-rules' });
  db = getFirestore();
}

/** The emulator's own wipe: BulkWriter-based recursiveDelete trips its rate limiter here. */
async function clearEmulator(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(
    `http://${host}/emulator/v1/projects/demo-neocom-rules/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

suite('SRP callables (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    identityCalls = 0;
    identities.clear();
    affiliations.clear();
    identities.set(CEO, { corporationId: CORP, ceoId: CEO, roles: [] });
    identities.set(DIRECTOR, { corporationId: CORP, ceoId: CEO, roles: ['Director'] });
    identities.set(ACCOUNTANT, { corporationId: CORP, ceoId: CEO, roles: ['Accountant'] });
    identities.set(JUNIOR, { corporationId: CORP, ceoId: CEO, roles: ['Junior_Accountant'] });
    identities.set(PILOT, { corporationId: CORP, ceoId: CEO, roles: [] });
    identities.set(OUTSIDER, { corporationId: 98000999, ceoId: null, roles: ['Director'] });
    for (const id of [CEO, DIRECTOR, ACCOUNTANT, JUNIOR, PILOT]) affiliations.set(id, CORP);
    affiliations.set(OUTSIDER, 98000999);
  });

  describe('turning SRP on and off', () => {
    it('needs a Director and creates the defaults, an officer record and an audit entry', async () => {
      expect(await reason(turnOnSrp(deps(), who(ACCOUNTANT), call(ACCOUNTANT)))).toBe(
        'role-required'
      );
      expect(await reason(turnOnSrp(deps(), who(PILOT), call(PILOT)))).toBe('not-an-officer');
      expect(await settings()).toBeUndefined();

      await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      expect(await settings()).toMatchObject({
        corporationId: CORP,
        enabled: true,
        killmailPct: null,
        appraisalPct: null,
        hullRules: [],
        windowDays: 30,
        requireFleetOrFc: false,
        createdBy: DIRECTOR,
        ownerCharacterId: DIRECTOR,
        schemaVersion: 1,
      });
      expect((await officerDoc(DIRECTOR)).data()).toMatchObject({
        canEdit: true,
        isDirector: true,
      });
      expect((await audit()).map((a) => a.action)).toEqual(['turnOn']);
      expect(await reason(turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR)))).toBe('srp-on');
    });

    it('lets the CEO (no listed role) turn it on', async () => {
      await turnOnSrp(deps(), who(CEO), call(CEO));
      expect((await settings())?.enabled).toBe(true);
    });

    it('turns off keeping the rules, and turning on again keeps them', async () => {
      await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      await saveSrpSettings(
        deps(),
        who(DIRECTOR),
        call(DIRECTOR),
        parseSrpSettingsPatch({ killmailPct: 70 })
      );
      expect(await reason(turnOffSrp(deps(), who(ACCOUNTANT), call(ACCOUNTANT)))).toBe(
        'role-required'
      );
      await turnOffSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      expect(await settings()).toMatchObject({ enabled: false, killmailPct: 70 });
      expect(await reason(turnOffSrp(deps(), who(DIRECTOR), call(DIRECTOR)))).toBe('srp-off');
      await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      expect(await settings()).toMatchObject({
        enabled: true,
        killmailPct: 70,
        createdBy: DIRECTOR,
      });
      expect((await audit()).map((a) => a.action).sort()).toEqual([
        'saveSettings',
        'turnOff',
        'turnOn',
        'turnOn',
      ]);
    });
  });

  describe('saving settings', () => {
    it('needs SRP on first, then a Director, and stores the patch', async () => {
      const patch = parseSrpSettingsPatch({
        killmailPct: 80,
        appraisalPct: 60,
        windowDays: 14,
        requireFleetOrFc: true,
        hullRules: [
          { scope: 'hull', id: 587, kind: 'pay-fixed', iskAmount: 5_000_000 },
          { scope: 'class', id: 25, kind: 'not-covered' },
        ],
      });
      expect(await reason(saveSrpSettings(deps(), who(DIRECTOR), call(DIRECTOR), patch))).toBe(
        'no-srp'
      );
      await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      expect(await reason(saveSrpSettings(deps(), who(ACCOUNTANT), call(ACCOUNTANT), patch))).toBe(
        'role-required'
      );
      await saveSrpSettings(deps(), who(DIRECTOR), call(DIRECTOR), patch);
      expect(await settings()).toMatchObject({ ...patch, enabled: true, updatedBy: DIRECTOR });
      // A later patch changes only its own fields.
      await saveSrpSettings(
        deps(),
        who(DIRECTOR),
        call(DIRECTOR),
        parseSrpSettingsPatch({ killmailPct: null })
      );
      expect(await settings()).toMatchObject({
        killmailPct: null,
        appraisalPct: 60,
        windowDays: 14,
      });
      expect((await audit()).filter((a) => a.action === 'saveSettings')).toHaveLength(2);
    });

    it('refuses a demoted Director on the very next call', async () => {
      await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      identities.set(DIRECTOR, { corporationId: CORP, ceoId: CEO, roles: ['Accountant'] });
      expect(
        await reason(
          saveSrpSettings(
            deps(),
            who(DIRECTOR),
            call(DIRECTOR),
            parseSrpSettingsPatch({ windowDays: 7 })
          )
        )
      ).toBe('role-required');
      expect((await settings())?.windowDays).toBe(30);
    });
  });

  describe('verifying an officer before SRP was ever turned on', () => {
    it('says no settings exist, so the client does not read the doc the rules refuse', async () => {
      const verdict = await verifySrpOfficer(deps(), who(DIRECTOR), call(DIRECTOR));
      expect(verdict).toMatchObject({ srpEnabled: false, settingsExist: false });
    });
  });

  describe('verifying an officer', () => {
    beforeEach(async () => {
      await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
    });

    it('records Director and Accountant access for 1h and stores no token', async () => {
      const verdict = await verifySrpOfficer(deps(), who(ACCOUNTANT), call(ACCOUNTANT));
      expect(verdict).toMatchObject({
        canManage: true,
        isDirector: false,
        srpEnabled: true,
        settingsExist: true,
      });
      const record = (await officerDoc(ACCOUNTANT)).data();
      expect(record).toMatchObject({ canEdit: true, checkedAt: T0, expiresAt: T0 + 3_600_000 });
      expect(JSON.stringify(record)).not.toContain('tok-');
    });

    it('refuses a Junior_Accountant, a plain pilot and another corporation', async () => {
      expect(await reason(verifySrpOfficer(deps(), who(JUNIOR), call(JUNIOR)))).toBe(
        'not-an-officer'
      );
      expect(await reason(verifySrpOfficer(deps(), who(PILOT), call(PILOT)))).toBe(
        'not-an-officer'
      );
      expect(await reason(verifySrpOfficer(deps(), who(OUTSIDER), call(OUTSIDER)))).toBe(
        'wrong-corp'
      );
      expect((await officerDoc(JUNIOR)).exists).toBe(false);
    });

    it('revokes the record when a renewal finds the officer demoted or gone', async () => {
      await verifySrpOfficer(deps(), who(ACCOUNTANT), call(ACCOUNTANT));
      now = T0 + 11 * 60_000;
      identities.set(ACCOUNTANT, { corporationId: CORP, ceoId: CEO, roles: [] });
      expect(await reason(verifySrpOfficer(deps(), who(ACCOUNTANT), call(ACCOUNTANT)))).toBe(
        'not-an-officer'
      );
      expect((await officerDoc(ACCOUNTANT)).exists).toBe(false);

      await verifySrpOfficer(deps(), who(DIRECTOR), call(DIRECTOR));
      now = T0 + 22 * 60_000;
      identities.set(DIRECTOR, { corporationId: 98000999, ceoId: null, roles: ['Director'] });
      expect(await reason(verifySrpOfficer(deps(), who(DIRECTOR), call(DIRECTOR)))).toBe(
        'wrong-corp'
      );
      expect((await officerDoc(DIRECTOR)).exists).toBe(false);
    });

    it('rejects a token for another Character, or none at all', async () => {
      expect(
        await reason(
          verifySrpOfficer(
            deps(),
            who(JUNIOR),
            parseBookCall({ corporationId: CORP, accessToken: `tok-${ACCOUNTANT}` })
          )
        )
      ).toBe('token-mismatch');
      expect(
        await reason(
          verifySrpOfficer(deps(), who(ACCOUNTANT), parseBookCall({ corporationId: CORP }))
        )
      ).toBe('token-required');
    });

    it('reuses a check younger than 10 minutes and re-reads ESI after', async () => {
      await verifySrpOfficer(deps(), who(ACCOUNTANT), call(ACCOUNTANT));
      identityCalls = 0;
      now = T0 + 9 * 60_000;
      await verifySrpOfficer(deps(), who(ACCOUNTANT), call(ACCOUNTANT));
      expect(identityCalls).toBe(0);
      now = T0 + 11 * 60_000;
      await verifySrpOfficer(deps(), who(ACCOUNTANT), call(ACCOUNTANT));
      expect(identityCalls).toBe(1);
    });
  });

  describe('member status', () => {
    it('lets any member in, role or not, and shows the rules only while SRP is on', async () => {
      expect(await getSrpStatus(deps(), who(PILOT), call(PILOT))).toEqual({
        corporationId: CORP,
        enabled: false,
      });
      await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      await saveSrpSettings(
        deps(),
        who(DIRECTOR),
        call(DIRECTOR),
        parseSrpSettingsPatch({ killmailPct: 75, requireFleetOrFc: true })
      );
      expect(await getSrpStatus(deps(), who(PILOT), call(PILOT))).toEqual({
        corporationId: CORP,
        enabled: true,
        settings: {
          killmailPct: 75,
          appraisalPct: null,
          hullRules: [],
          windowDays: 30,
          requireFleetOrFc: true,
        },
      });
      expect(identityCalls).toBe(2); // only the Director's two live checks, never the pilot's roles
      await turnOffSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      expect((await getSrpStatus(deps(), who(PILOT), call(PILOT))).enabled).toBe(false);
    });

    it('refuses a Character of another corporation and a token for someone else', async () => {
      await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      expect(await reason(getSrpStatus(deps(), who(OUTSIDER), call(OUTSIDER)))).toBe('wrong-corp');
      expect(
        await reason(
          getSrpStatus(
            deps(),
            who(PILOT),
            parseBookCall({ corporationId: CORP, accessToken: `tok-${DIRECTOR}` })
          )
        )
      ).toBe('token-mismatch');
    });
  });

  describe('reclaiming', () => {
    it('is the CEO’s alone, re-enables SRP, and makes every other officer re-verify', async () => {
      await turnOnSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      await verifySrpOfficer(deps(), who(ACCOUNTANT), call(ACCOUNTANT));
      await turnOffSrp(deps(), who(DIRECTOR), call(DIRECTOR));
      expect(await reason(reclaimSrp(deps(), who(DIRECTOR), call(DIRECTOR)))).toBe('role-required');

      const result = await reclaimSrp(deps(), who(CEO), call(CEO));
      expect(result.officersRevoked).toBe(2);
      expect(await settings()).toMatchObject({ enabled: true, ownerCharacterId: CEO });
      expect((await officerDoc(ACCOUNTANT)).exists).toBe(false);
      expect((await officerDoc(DIRECTOR)).exists).toBe(false);
      expect((await officerDoc(CEO)).exists).toBe(true);
      expect((await audit()).some((a) => a.action === 'reclaim')).toBe(true);
    });

    it('needs SRP to exist', async () => {
      expect(await reason(reclaimSrp(deps(), who(CEO), call(CEO)))).toBe('no-srp');
    });
  });
});
