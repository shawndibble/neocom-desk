/**
 * D13: the backend callables the fake EVE token cannot pass (it is verified with CCP on the real
 * server), answered in the browser and applied to the Firestore emulator. Anything not listed falls
 * through to the Functions emulator. Also the Firebase mint, per signed-in character.
 */
import type { Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CORP_ID, OFFICER_ID } from './D13-hfind';
import { DOCTRINES, KILLMAILS, MATCH_DRAKE, SRP_SETTINGS } from './D13-srpData';
import { vettingAnswer } from './D13-vetting';

const require = createRequire(fileURLToPath(new URL('../../../../../functions/package.json', import.meta.url)));
const { getFirestore } = require('firebase-admin/firestore');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const OWNER_HASH: Record<number, string> = { 90_000_001: 'WORLD-ARDEN', 90_000_011: 'WORLD-MIRA', 90_000_012: 'WORLD-TOBIN' };

export async function installMint(page: Page): Promise<void> {
  await page.route('**/mintFirebaseToken', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const access = (route.request().postDataJSON() as { data?: { accessToken?: string } }).data?.accessToken ?? '';
    const payload = JSON.parse(Buffer.from(access.split('.')[1] ?? 'e30', 'base64url').toString('utf8')) as { sub?: string };
    const id = Number(/(\d+)$/.exec(payload.sub ?? '')?.[1] ?? 90_000_001);
    const ownerHash = OWNER_HASH[id] ?? 'WORLD-ARDEN';
    const uid = `char:${id}`;
    const now = Math.floor(Date.now() / 1000);
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      iss: 'firebase-auth-emulator@example.com', sub: 'firebase-auth-emulator@example.com',
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat: now, exp: now + 3600, uid, claims: { ownerHash },
    })}.`;
    await route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { token, uid, ownerHash } }) });
  });
}

const claimRef = (id: number) => getFirestore().collection('corps').doc(String(CORP_ID)).collection('srpClaims').doc(String(id));
const auditAdd = (action: string, killmailId: number, hullTypeId: number, amount: number | null, extra: Record<string, unknown> = {}) => {
  const at = Date.now();
  return getFirestore().collection('corps').doc(String(CORP_ID)).collection('srpAudit').doc(`${String(at).padStart(15, '0')}~${Math.random().toString(36).slice(2, 10)}`).set({
    at, by: OFFICER_ID, byName: 'Arden Kessil', action, detail: { killmailId, hullTypeId, amount, ...extra },
  });
};

async function transition(killmailId: number, to: 'approved' | 'paid' | 'rejected', extra: Record<string, unknown> = {}) {
  const snap = await claimRef(killmailId).get();
  const c = snap.data() as Record<string, unknown>;
  const now = Date.now();
  const patch: Record<string, unknown> =
    to === 'approved'
      ? { state: 'approved', decidedAt: now, decidedBy: OFFICER_ID, decidedByName: 'Arden Kessil' }
      : to === 'paid'
        ? { state: 'paid', paidAt: now, paidBy: OFFICER_ID, paidByName: 'Arden Kessil', closedAt: now }
        : { state: 'rejected', decidedAt: now, decidedBy: OFFICER_ID, decidedByName: 'Arden Kessil', closedAt: now, ...extra };
  await claimRef(killmailId).update(patch);
  await auditAdd(to === 'approved' ? 'approveClaim' : to === 'paid' ? 'markClaimPaid' : 'rejectClaim', killmailId, c.hullTypeId as number, (c.amount as number | null) ?? null, to === 'rejected' ? { reason: extra.rejectionReason } : {});
  return { ok: true as const, killmailId, state: to, characterId: c.characterId as number, characterName: c.characterName as string, amount: (c.amount as number | null) ?? null };
}

const killmailIdOf = (link: string) => Number(/(?:kill\/|killmails\/)(\d+)/.exec(link)?.[1]);

async function corpAnswer(action: string, data: Record<string, any>): Promise<unknown | undefined> {
  const verdictExpires = Date.now() + 86_400_000;
  switch (action) {
    case 'verifyCorpOfficerCallable':
      return { corporationId: CORP_ID, isCeo: false, isDirector: true, isStationManager: true, canView: true, canEdit: true, bookActive: true, expiresAt: verdictExpires };
    case 'verifySrpOfficerCallable':
      return { corporationId: CORP_ID, isCeo: false, isDirector: true, canManage: true, srpEnabled: true, settingsExist: true, expiresAt: verdictExpires };
    case 'getSrpStatusCallable':
      return { corporationId: CORP_ID, enabled: true, settings: SRP_SETTINGS };
    case 'listSrpDoctrineFitsCallable':
      return { fits: DOCTRINES.map((d) => ({ id: d.id, name: d.name, snapshot: d.snapshot, createdBy: OFFICER_ID, createdAt: Date.now() - 20 * 86_400_000 })) };
    case 'getSrpClaimValuesCallable':
      return { hullValue: 41_200_000, fitValue: 36_800_000, doctrineValue: 37_900_000, doctrineName: 'Drake - Shield HML' };
    case 'previewSrpDoctrineCheckCallable': {
      const km = KILLMAILS.find((k) => k.id === killmailIdOf(String(data.killmail)))!;
      return {
        killmailId: km.id, hullTypeId: km.hull, check: MATCH_DRAKE, killedAt: Date.now() - km.ageHours * 3_600_000, solarSystemId: km.system,
        quote: { kind: 'amount', isk: 26_000_000, basis: { step: 'killmail-percent', percent: 60 } },
        hullRule: { scope: 'hull', id: 24698, kind: 'pay-percent' },
        values: { killmailValue: 43_300_000, hullValue: 41_200_000, fitValue: 36_800_000 },
      };
    }
    case 'fileSrpClaimCallable': {
      const km = KILLMAILS.find((k) => k.id === killmailIdOf(String(data.killmail)))!;
      const now = Date.now();
      const doc = {
        killmailId: km.id, killmailHash: km.hash, corporationId: CORP_ID, characterId: km.pilotId, characterName: 'Mira Voskane',
        uid: `char:${km.pilotId}`, ownerHash: OWNER_HASH[km.pilotId], hullTypeId: km.hull, solarSystemId: km.system,
        killedAt: now - km.ageHours * 3_600_000, filedAt: now, state: 'pending', amount: 26_000_000,
        basis: { step: 'killmail-percent', percent: 60 }, suggested: null, fleetOrFc: data.fleetOrFc ?? null, note: data.note ?? null,
        refileCount: 0, doctrineCheck: MATCH_DRAKE,
      };
      await claimRef(km.id).set(doc);
      await getFirestore().collection('corps').doc(String(CORP_ID)).collection('srpAudit').doc(`${String(now).padStart(15, '0')}~mira`).set({
        at: now, by: km.pilotId, byName: 'Mira Voskane', action: 'fileClaim', detail: { killmailId: km.id, hullTypeId: km.hull, amount: 26_000_000 },
      });
      return { killmailId: km.id, state: 'pending', amount: 26_000_000, basis: doc.basis, check: MATCH_DRAKE };
    }
    case 'approveSrpClaimCallable':
      return transition(data.killmailId, 'approved');
    case 'approveSrpClaimsCallable':
      return { results: await Promise.all((data.claims as { killmailId: number }[]).map((c) => transition(c.killmailId, 'approved'))) };
    case 'rejectSrpClaimCallable':
      return transition(data.killmailId, 'rejected', { rejectionReason: data.reason });
    case 'markSrpClaimPaidCallable':
      return transition(data.killmailId, 'paid');
    case 'markSrpClaimsPaidCallable':
      return { results: await Promise.all((data.claims as { killmailId: number }[]).map((c) => transition(c.killmailId, 'paid'))) };
    default:
      return undefined;
  }
}

export async function installCallables(page: Page): Promise<void> {
  await installMint(page);
  await page.route('**/corpTaxBookCall', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fallback();
    const body = (request.postDataJSON() as { data?: { action?: string; data?: Record<string, unknown> } } | null)?.data;
    if (!body?.action) return route.fallback();
    const answer = await corpAnswer(body.action, body.data ?? {}).catch((e) => {
      console.log('CALLABLE ERROR', body.action, String(e));
      return undefined;
    });
    if (answer === undefined) return route.fallback();
    await route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: answer }) });
  });
  await page.route('**/vettingCall', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fallback();
    const body = (request.postDataJSON() as { data?: { action?: string; data?: Record<string, unknown> } } | null)?.data;
    const answer = body?.action === undefined ? undefined : vettingAnswer(body.action, body.data ?? {});
    if (answer === undefined) return route.fallback();
    await route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: answer }) });
  });
  // Killmails: the ESI reads behind the member's lost ships and the officer's fit view.
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/(latest|dev|v\d+)\//, '/');
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'x-pages': '1' }, body: JSON.stringify(b) });
    const m = /^\/killmails\/(\d+)\/([0-9a-f]+)$/.exec(path);
    if (m) {
      const km = KILLMAILS.find((k) => k.id === Number(m[1]));
      if (km)
        return json({
          killmail_id: km.id, killmail_time: new Date(Date.now() - km.ageHours * 3_600_000 - 2 * 3_600_000).toISOString(), solar_system_id: km.system,
          victim: { character_id: km.pilotId, corporation_id: CORP_ID, alliance_id: 99_000_001, ship_type_id: km.hull, damage_taken: 5_400, items: km.items },
          attackers: [{ final_blow: true, ship_type_id: 11_184 }, { final_blow: false, ship_type_id: 11_200 }],
        });
    }
    if (path === '/characters/90000011/killmails/recent') return json(KILLMAILS.filter((k) => k.pilotId === 90_000_011).map((k) => ({ killmail_id: k.id, killmail_hash: k.hash })));
    if (/^\/characters\/\d+\/killmails\/recent$/.test(path)) return json([]);
    return route.fallback();
  });
}

/** Files Mira's loss as the member flow would, for takes that start after it. */
export async function fileMiraClaim(): Promise<void> {
  await corpAnswer('fileSrpClaimCallable', { killmail: 'https://esi.evetech.net/latest/killmails/131000101/x/', fleetOrFc: 'Petra Lindqvist' });
}
