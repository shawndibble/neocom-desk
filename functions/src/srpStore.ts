import { randomBytes } from 'node:crypto';
import { type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { cacheOfficer, readOfficerCache, revokeOfficer } from './officerCache.js';
import { satisfies, type BookCall, type Need, type OfficerAccess } from './corpTaxBook.js';
import type { CorporationLookup } from './corpTaxBookEsi.js';
import { type BookDeps } from './corpTaxBookStore.js';
import {
  appraisalItems,
  matchedHullRule,
  pricingInput,
  withinWindow,
  type ClaimValues,
  type EsiKillmail,
  type FileClaimInput,
  type KillmailRef,
  type SrpKillmailSource,
  type ZkillRecord,
} from './srpKillmail.js';
import { checkDoctrine, hullRuleOf } from './srpDoctrineCheck.js';
import { readDoctrines } from './srpDoctrineRead.js';
import {
  priceSrpClaim,
  type SrpBasis,
  type SrpPricingResult,
  type SrpSuggestion,
} from './srpPricing.js';
import {
  CORPS_COLLECTION,
  SRP_AUDIT,
  SRP_CLAIMS,
  SRP_OFFICERS,
  SRP_SCHEMA_VERSION,
  SRP_SETTINGS_COLLECTION,
  SRP_SETTINGS_DOC,
  defaultSrpSettings,
  type DoctrineCheckRecord,
  type HullRule,
  type SrpSettings,
  type SrpSettingsPatch,
} from './srpTypes.js';
import { takeFetchSlot } from './srpThrottle.js';
import { requireLiveRoles, verifyCallerToken, fail, type Caller } from './actorAuth.js';
import { HOUR_MS } from './timeConstants.js';

export const SRP_OFFICER_TTL_MS = HOUR_MS;

export interface SrpDeps extends Pick<BookDeps, 'db' | 'now' | 'verifyToken' | 'readIdentity'> {
  lookupCorporation: CorporationLookup;
}

const corpRef = (db: Firestore, corporationId: number) =>
  db.collection(CORPS_COLLECTION).doc(String(corporationId));
export const srpSettingsRef = (db: Firestore, corporationId: number) =>
  corpRef(db, corporationId).collection(SRP_SETTINGS_COLLECTION).doc(SRP_SETTINGS_DOC);
const officersOf = (db: Firestore, corporationId: number) =>
  corpRef(db, corporationId).collection(SRP_OFFICERS);
export const claimRef = (db: Firestore, corporationId: number, killmailId: number) =>
  corpRef(db, corporationId).collection(SRP_CLAIMS).doc(String(killmailId));

const rand = () => randomBytes(6).toString('base64url');

export interface SrpMember {
  characterId: number;
  characterName: string;
  corporationId: number;
}

export async function authorizeMember(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall
): Promise<SrpMember> {
  const { claims } = await verifyCallerToken(deps, caller, call.accessToken);
  const corporationId = await deps.lookupCorporation(claims.characterId);
  if (corporationId !== call.corporationId) {
    fail('permission-denied', 'Not a member of this corporation', 'wrong-corp');
  }
  return { characterId: claims.characterId, characterName: claims.name, corporationId };
}

export async function authorizeSrpOfficer(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  need: Extract<Need, 'edit' | 'director' | 'ceo'>,
  options: { live: boolean } = { live: true }
): Promise<OfficerAccess> {
  const actor = await verifyCallerToken(deps, caller, call.accessToken);
  const now = deps.now();
  const officerRef = officersOf(deps.db, call.corporationId).doc(caller.uid);
  const { held, usable } = await readOfficerCache(officerRef, caller, call.corporationId, now);

  let access: OfficerAccess;
  if (!options.live && usable) {
    access = usable;
  } else {
    const { identity, roles } = await requireLiveRoles(deps, actor, {
      corporationId: call.corporationId,
      need: 'canEdit',
      denied: { message: 'No SRP officer role in this corporation', reason: 'not-an-officer' },
      onDenied: () => revokeOfficer(officerRef, held),
    });
    access = {
      ...roles,
      characterId: actor.characterId,
      characterName: actor.claims.name,
      ownerHash: caller.ownerHash,
      corporationId: call.corporationId,
      roles: identity.roles,
      checkedAt: now,
      expiresAt: now + SRP_OFFICER_TTL_MS,
    };
    if ((await srpSettingsRef(deps.db, call.corporationId).get()).exists) {
      await cacheOfficer(officerRef, access);
    }
  }
  if (!satisfies(access, need)) {
    throw new HttpsError('permission-denied', `This needs the ${need} role`, {
      reason: 'role-required',
      need,
    });
  }
  return access;
}

export function appendSrpAudit(
  tx: Transaction,
  deps: SrpDeps,
  corporationId: number,
  access: Pick<OfficerAccess, 'characterId' | 'characterName'>,
  action: string,
  detail: Record<string, unknown>
): void {
  const at = deps.now();
  tx.create(
    corpRef(deps.db, corporationId)
      .collection(SRP_AUDIT)
      .doc(`${String(at).padStart(15, '0')}~${rand()}`),
    { at, by: access.characterId, byName: access.characterName, action, detail }
  );
}

export interface VerifySrpOfficerResult {
  corporationId: number;
  isCeo: boolean;
  isDirector: boolean;
  canManage: boolean;
  srpEnabled: boolean;
  settingsExist: boolean;
  expiresAt: number;
}

export async function verifySrpOfficer(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall
): Promise<VerifySrpOfficerResult> {
  const access = await authorizeSrpOfficer(deps, caller, call, 'edit', { live: false });
  const snap = await srpSettingsRef(deps.db, call.corporationId).get();
  const settings = snap.data();
  return {
    corporationId: call.corporationId,
    isCeo: access.isCeo,
    isDirector: access.isDirector,
    canManage: access.canEdit,
    srpEnabled: settings?.enabled === true,
    settingsExist: snap.exists,
    expiresAt: access.expiresAt,
  };
}

export interface SrpStatus {
  corporationId: number;
  enabled: boolean;
  settings?: Pick<
    SrpSettings,
    'killmailPct' | 'appraisalPct' | 'hullRules' | 'windowDays' | 'requireFleetOrFc'
  >;
}

export async function getSrpStatus(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall
): Promise<SrpStatus> {
  await authorizeMember(deps, caller, call);
  const data = (await srpSettingsRef(deps.db, call.corporationId).get()).data() as
    SrpSettings | undefined;
  if (!data || data.enabled !== true) return { corporationId: call.corporationId, enabled: false };
  return {
    corporationId: call.corporationId,
    enabled: true,
    settings: {
      killmailPct: data.killmailPct,
      appraisalPct: data.appraisalPct,
      hullRules: data.hullRules,
      windowDays: data.windowDays,
      requireFleetOrFc: data.requireFleetOrFc,
    },
  };
}

export async function turnOnSrp(deps: SrpDeps, caller: Caller, call: BookCall) {
  const access = await authorizeSrpOfficer(deps, caller, call, 'director');
  const now = deps.now();
  const ref = srpSettingsRef(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.get('enabled') === true) {
      fail('already-exists', 'This corporation already has SRP on', 'srp-on');
    }
    if (current.exists) {
      tx.update(ref, { enabled: true, updatedAt: now, updatedBy: access.characterId });
    } else {
      const settings: SrpSettings = {
        ...defaultSrpSettings(),
        corporationId: call.corporationId,
        enabled: true,
        createdBy: access.characterId,
        createdAt: now,
        ownerCharacterId: access.characterId,
        updatedAt: now,
        updatedBy: access.characterId,
        schemaVersion: SRP_SCHEMA_VERSION,
      };
      tx.create(ref, settings);
    }
    tx.set(officersOf(deps.db, call.corporationId).doc(caller.uid), access);
    appendSrpAudit(tx, deps, call.corporationId, access, 'turnOn', { reenabled: current.exists });
  });
  return { corporationId: call.corporationId };
}

export async function turnOffSrp(deps: SrpDeps, caller: Caller, call: BookCall) {
  const access = await authorizeSrpOfficer(deps, caller, call, 'director');
  const ref = srpSettingsRef(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.get('enabled') !== true) fail('failed-precondition', 'SRP is not on', 'srp-off');
    tx.update(ref, { enabled: false, updatedAt: deps.now(), updatedBy: access.characterId });
    appendSrpAudit(tx, deps, call.corporationId, access, 'turnOff', {});
  });
  return { corporationId: call.corporationId };
}

async function requireRuleDoctrines(
  deps: SrpDeps,
  corporationId: number,
  rules: readonly HullRule[],
  tx: Transaction
): Promise<void> {
  const ids = rules.flatMap((r) => r.doctrineIds ?? []);
  if (ids.length === 0) return;
  const found = await readDoctrines(deps.db, corporationId, ids, tx);
  for (const rule of rules) {
    for (const id of rule.doctrineIds ?? []) {
      const fit = found.get(id);
      if (!fit)
        fail('failed-precondition', 'That Doctrine Fit no longer exists', 'unknown-doctrine');
      if (fit.snapshot.hullTypeId !== rule.id) {
        fail(
          'invalid-argument',
          'A Doctrine Fit must be for the hull its rule is for',
          'doctrine-hull-mismatch'
        );
      }
    }
  }
}

export async function saveSrpSettings(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  patch: SrpSettingsPatch
) {
  const access = await authorizeSrpOfficer(deps, caller, call, 'director');
  const ref = srpSettingsRef(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) fail('not-found', 'This corporation has no SRP yet', 'no-srp');
    if (patch.hullRules) await requireRuleDoctrines(deps, call.corporationId, patch.hullRules, tx);
    tx.update(ref, { ...patch, updatedAt: deps.now(), updatedBy: access.characterId });
    appendSrpAudit(tx, deps, call.corporationId, access, 'saveSettings', {
      fields: Object.keys(patch),
      ...(patch.hullRules ? { hullRuleCount: patch.hullRules.length } : {}),
    });
  });
  return { corporationId: call.corporationId };
}

export async function reclaimSrp(deps: SrpDeps, caller: Caller, call: BookCall) {
  const access = await authorizeSrpOfficer(deps, caller, call, 'ceo');
  const ref = srpSettingsRef(deps.db, call.corporationId);
  const revoked = await deps.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) fail('not-found', 'This corporation has no SRP yet', 'no-srp');
    const officers = await tx.get(officersOf(deps.db, call.corporationId));
    let count = 0;
    for (const doc of officers.docs) {
      if (doc.id === caller.uid) continue;
      tx.delete(doc.ref);
      count += 1;
    }
    tx.update(ref, {
      enabled: true,
      ownerCharacterId: access.characterId,
      updatedAt: deps.now(),
      updatedBy: access.characterId,
    });
    tx.set(officersOf(deps.db, call.corporationId).doc(caller.uid), access);
    appendSrpAudit(tx, deps, call.corporationId, access, 'reclaim', { officersRevoked: count });
    return count;
  });
  return { officersRevoked: revoked };
}

export interface SrpFileDeps extends SrpDeps {
  killmails: SrpKillmailSource;
}

export interface FiledSrpClaim {
  killmailId: number;
  state: 'pending';
  amount: number | null;
  basis: SrpBasis | null;
  doctrineCheck: DoctrineCheckRecord;
}

const isValue = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 1;

async function softZkill(source: SrpKillmailSource, killmailId: number): Promise<ZkillRecord> {
  try {
    const z = await source.zkill(killmailId);
    return { hash: z.hash, totalValue: isValue(z.totalValue) ? z.totalValue : null };
  } catch {
    return { hash: null, totalValue: null };
  }
}

export async function softJita(
  source: SrpKillmailSource,
  items: ReadonlyMap<number, number>
): Promise<number | null> {
  try {
    const value = await source.jitaValue(items);
    return isValue(value) ? value : null;
  } catch {
    return null;
  }
}

function refileDecision(existing: Record<string, unknown> | undefined): 'new' | 'refile' {
  if (!existing) return 'new';
  const refiles = typeof existing.refileCount === 'number' ? existing.refileCount : 0;
  if (existing.state === 'rejected' && refiles < 1) return 'refile';
  fail('already-exists', 'This killmail already has an SRP claim', 'already-claimed');
}

export async function fetchOwnLoss(
  deps: SrpFileDeps,
  member: SrpMember,
  ref: KillmailRef
): Promise<{ zkill: ZkillRecord; hash: string; km: EsiKillmail }> {
  await takeFetchSlot(deps, member.corporationId, member.characterId);
  const zkillRead = softZkill(deps.killmails, ref.killmailId);
  const kmRead = ref.hash ? deps.killmails.killmail(ref.killmailId, ref.hash) : null;
  kmRead?.catch(() => undefined);
  const zkill = await zkillRead;
  const hash = ref.hash ?? zkill.hash;
  if (!hash) {
    fail(
      'unavailable',
      'Could not look up that killmail; paste its ESI link or try again shortly',
      'hash-unavailable'
    );
  }
  const km = await (kmRead ?? deps.killmails.killmail(ref.killmailId, hash));
  if (km.victim.characterId !== member.characterId) {
    fail('permission-denied', 'You can only file your own losses', 'not-your-loss');
  }
  if (km.victim.corporationId !== member.corporationId) {
    fail(
      'permission-denied',
      'You were not in this corporation for that loss',
      'loss-in-other-corp'
    );
  }
  return { zkill, hash, km };
}

export async function doctrineCheckOf(
  db: Firestore,
  settings: Pick<SrpSettings, 'hullRules'>,
  corporationId: number,
  victim: EsiKillmail['victim']
): Promise<DoctrineCheckRecord> {
  const rule = hullRuleOf(settings.hullRules, victim.shipTypeId);
  const doctrines = await readDoctrines(db, corporationId, rule?.doctrineIds ?? []);
  return checkDoctrine(victim, rule, doctrines);
}

export async function priceLoss(
  source: SrpKillmailSource,
  settings: Pick<SrpSettings, 'killmailPct' | 'appraisalPct' | 'hullRules'>,
  victim: EsiKillmail['victim'],
  killmailValue: number | null
): Promise<{ classId: number; values: ClaimValues; result: SrpPricingResult }> {
  const hullTypeId = victim.shipTypeId;
  const classId = await source.shipGroupId(hullTypeId);
  const priced = pricingInput(settings, hullTypeId, classId, {
    killmailValue: null,
    appraisalValue: null,
  });
  const values: ClaimValues = { killmailValue, appraisalValue: null };
  if (priceSrpClaim(priced).kind === 'refused') {
    return { classId, values, result: { kind: 'refused', reason: 'not-covered' } };
  }
  const price = () => priceSrpClaim({ ...priced, ...values });
  let result = price();
  const settled = result.kind === 'amount' || (result.kind === 'officer' && result.suggested);
  if (!settled && (priced.appraisalPercent ?? 0) >= 1) {
    values.appraisalValue = await softJita(source, appraisalItems(victim));
    result = price();
  }
  return { classId, values, result };
}

export async function fileSrpClaim(
  deps: SrpFileDeps,
  caller: Caller,
  call: BookCall,
  input: FileClaimInput
): Promise<FiledSrpClaim> {
  const member = await authorizeMember(deps, caller, call);
  const corporationId = call.corporationId;
  const settings = (await srpSettingsRef(deps.db, corporationId).get()).data() as
    SrpSettings | undefined;
  if (!settings || settings.enabled !== true) {
    fail('failed-precondition', 'SRP is not on for this corporation', 'srp-off');
  }
  if (settings.requireFleetOrFc && input.fleetOrFc === null) {
    fail('invalid-argument', 'This corporation needs the Fleet or FC', 'fleet-or-fc-required');
  }
  const { killmailId } = input.ref;
  const ref = claimRef(deps.db, corporationId, killmailId);
  const { zkill, hash, km } = await fetchOwnLoss(deps, member, input.ref);
  const early = refileDecision((await ref.get()).data());
  if (early === 'refile' && input.note === null) {
    fail('invalid-argument', 'A re-filed claim needs a note', 'note-required');
  }
  const now = deps.now();
  if (!withinWindow(km.killedAt, now, settings.windowDays)) {
    fail(
      'failed-precondition',
      `That loss is outside the ${settings.windowDays}-day window`,
      'outside-window'
    );
  }

  const hullTypeId = km.victim.shipTypeId;
  const { classId, values, result } = await priceLoss(
    deps.killmails,
    settings,
    km.victim,
    zkill.totalValue
  );
  if (result.kind === 'refused') {
    fail('failed-precondition', 'This corporation does not cover that hull', 'not-covered');
  }
  const amount = result.kind === 'amount' ? result.isk : null;
  const basis: SrpBasis | null = result.kind === 'amount' ? result.basis : null;
  const suggested: SrpSuggestion | null =
    result.kind === 'officer' && result.suggested ? result.suggested : null;
  const rule = matchedHullRule(settings.hullRules, hullTypeId, classId);
  const doctrineCheck = await doctrineCheckOf(deps.db, settings, corporationId, km.victim);

  const base = {
    uid: caller.uid,
    ownerHash: caller.ownerHash,
    corporationId,
    killmailId,
    killmailHash: hash,
    characterId: member.characterId,
    characterName: member.characterName,
    hullTypeId,
    classId,
    solarSystemId: km.solarSystemId,
    killedAt: km.killedAt,
    filedAt: now,
    state: 'pending' as const,
    amount,
    basis,
    suggested,
    hullRule: rule ? { scope: rule.scope, id: rule.id, kind: rule.kind } : null,
    killmailValue: values.killmailValue,
    appraisalValue: values.appraisalValue,
    valueSource:
      values.killmailValue !== null
        ? 'zkillboard'
        : values.appraisalValue !== null
          ? 'appraisal'
          : 'none',
    doctrineCheck,
    fleetOrFc: input.fleetOrFc,
    note: input.note,
    schemaVersion: SRP_SCHEMA_VERSION,
  };
  await deps.db.runTransaction(async (tx) => {
    const existing = (await tx.get(ref)).data();
    const decision = refileDecision(existing);
    if (decision === 'refile' && input.note === null) {
      fail('invalid-argument', 'A re-filed claim needs a note', 'note-required');
    }
    if (decision === 'new') {
      tx.create(ref, { ...base, refileCount: 0 });
    } else {
      tx.set(ref, {
        ...base,
        refileCount: 1,
        previousRejectionReason:
          typeof existing?.rejectionReason === 'string' ? existing.rejectionReason : null,
      });
    }
    appendSrpAudit(
      tx,
      deps,
      corporationId,
      { characterId: member.characterId, characterName: member.characterName },
      decision === 'new' ? 'fileClaim' : 'refileClaim',
      {
        killmailId,
        hullTypeId,
        amount,
        basis: basis?.step ?? null,
        valueSource: base.valueSource,
        doctrineStatus: doctrineCheck.status,
      }
    );
  });
  return { killmailId, state: 'pending', amount, basis, doctrineCheck };
}
