import { fail, type Caller } from './actorAuth.js';
import { randomBytes } from 'node:crypto';
import type { BookCall } from './corpTaxBook.js';
import { doctrinesCollection } from './srpDoctrineRead.js';
import { matchedHullRule, shipFitItems, type KillmailRef } from './srpKillmail.js';
import type { SrpPricingResult } from './srpPricing.js';
import {
  appendSrpAudit,
  authorizeMember,
  authorizeSrpOfficer,
  doctrineCheckOf,
  fetchOwnLoss,
  priceLoss,
  softJita,
  srpSettingsRef,
  type SrpFileDeps,
  type SrpDeps,
} from './srpStore.js';
import {
  MAX_DOCTRINES,
  type DoctrineFit,
  type DoctrinePreview,
  type MemberDoctrineFit,
  type PayoutQuote,
  type HullRule,
  type SaveDoctrineInput,
  type SrpSettings,
} from './srpTypes.js';

export async function saveSrpDoctrine(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  input: SaveDoctrineInput
): Promise<{ id: string }> {
  const access = await authorizeSrpOfficer(deps, caller, call, 'director');
  const coll = doctrinesCollection(deps.db, call.corporationId);
  const id = input.id ?? randomBytes(9).toString('base64url');
  const ref = coll.doc(id);
  await deps.db.runTransaction(async (tx) => {
    const existing = (await tx.get(ref)).data() as DoctrineFit | undefined;
    if (input.id !== undefined && !existing) {
      fail('not-found', 'No such Doctrine Fit', 'doctrine-not-found');
    }
    if (existing && existing.snapshot.hullTypeId !== input.snapshot.hullTypeId) {
      const settings = (await tx.get(srpSettingsRef(deps.db, call.corporationId))).data() as
        SrpSettings | undefined;
      if (settings?.hullRules.some((r) => r.doctrineIds?.includes(id))) {
        fail(
          'failed-precondition',
          'A Hull Rule lists this Doctrine Fit; remove it there first',
          'doctrine-hull-listed'
        );
      }
    }
    if (!existing) {
      const held = await tx.get(coll.select().limit(MAX_DOCTRINES));
      if (held.size >= MAX_DOCTRINES) {
        fail(
          'resource-exhausted',
          `A corporation keeps at most ${MAX_DOCTRINES} Doctrine Fits`,
          'too-many-doctrines'
        );
      }
    }
    const fit: DoctrineFit = {
      id,
      name: input.name,
      snapshot: input.snapshot,
      createdBy: existing?.createdBy ?? access.characterId,
      createdAt: existing?.createdAt ?? deps.now(),
      ...(input.shareCode !== undefined ? { shareCode: input.shareCode } : {}),
    };
    tx.set(ref, fit);
    appendSrpAudit(
      tx,
      deps,
      call.corporationId,
      access,
      existing ? 'updateDoctrine' : 'addDoctrine',
      {
        doctrineId: id,
        name: input.name,
        hullTypeId: input.snapshot.hullTypeId,
        modules: input.snapshot.modules.length,
        rigs: input.snapshot.rigs.length,
      }
    );
  });
  return { id };
}

export async function deleteSrpDoctrine(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall,
  input: { id: string }
): Promise<{ id: string }> {
  const access = await authorizeSrpOfficer(deps, caller, call, 'director');
  const ref = doctrinesCollection(deps.db, call.corporationId).doc(input.id);
  const settingsRef = srpSettingsRef(deps.db, call.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const existing = (await tx.get(ref)).data() as DoctrineFit | undefined;
    if (!existing) fail('not-found', 'No such Doctrine Fit', 'doctrine-not-found');
    const settings = (await tx.get(settingsRef)).data() as SrpSettings | undefined;
    const rules = settings?.hullRules ?? [];
    const listed = rules.filter((r) => r.doctrineIds?.includes(input.id));
    if (settings && listed.length > 0) {
      const hullRules = rules.map((r): HullRule => {
        if (!r.doctrineIds?.includes(input.id)) return r;
        const { doctrineIds, ...rest } = r;
        const left = doctrineIds.filter((d) => d !== input.id);
        return (left.length > 0 ? { ...rest, doctrineIds: left } : rest) as HullRule;
      });
      tx.update(settingsRef, { hullRules, updatedAt: deps.now(), updatedBy: access.characterId });
    }
    tx.delete(ref);
    appendSrpAudit(tx, deps, call.corporationId, access, 'deleteDoctrine', {
      doctrineId: input.id,
      name: existing.name,
      rulesUpdated: listed.length,
    });
  });
  return { id: input.id };
}

export async function listSrpDoctrineFits(
  deps: SrpDeps,
  caller: Caller,
  call: BookCall
): Promise<{ fits: MemberDoctrineFit[] }> {
  await authorizeMember(deps, caller, call);
  const settings = (await srpSettingsRef(deps.db, call.corporationId).get()).data() as
    SrpSettings | undefined;
  if (!settings || settings.enabled !== true) return { fits: [] };
  const docs = await doctrinesCollection(deps.db, call.corporationId).limit(MAX_DOCTRINES).get();
  return {
    fits: docs.docs.map((d) => {
      const { id, name, snapshot, shareCode } = d.data() as DoctrineFit;
      return shareCode ? { id, name, snapshot, shareCode } : { id, name, snapshot };
    }),
  };
}

export async function previewSrpDoctrineCheck(
  deps: SrpFileDeps,
  caller: Caller,
  call: BookCall,
  ref: KillmailRef
): Promise<DoctrinePreview> {
  const settingsRead = srpSettingsRef(deps.db, call.corporationId).get();
  settingsRead.catch(() => undefined);
  const member = await authorizeMember(deps, caller, call);
  const settings = (await settingsRead).data() as SrpSettings | undefined;
  if (!settings || settings.enabled !== true) {
    fail('failed-precondition', 'SRP is not on for this corporation', 'srp-off');
  }
  const { zkill, km } = await fetchOwnLoss(deps, member, ref);
  const hullTypeId = km.victim.shipTypeId;
  const { hull, fit } = shipFitItems(km.victim);
  const [check, { classId, result }, hullValue, fitValue] = await Promise.all([
    doctrineCheckOf(deps.db, settings, call.corporationId, km.victim),
    priceLoss(deps.killmails, settings, km.victim, zkill.totalValue),
    softJita(deps.killmails, hull),
    softJita(deps.killmails, fit),
  ]);
  const rule = matchedHullRule(settings.hullRules, hullTypeId, classId);
  return {
    killmailId: km.killmailId,
    hullTypeId,
    check,
    killedAt: km.killedAt,
    solarSystemId: km.solarSystemId,
    quote: quoteOf(result),
    hullRule: rule ? { scope: rule.scope, id: rule.id, kind: rule.kind } : null,
    values: { killmailValue: zkill.totalValue, hullValue, fitValue },
  };
}

function quoteOf(result: SrpPricingResult): PayoutQuote {
  switch (result.kind) {
    case 'amount':
      return { kind: 'amount', isk: result.isk, basis: result.basis };
    case 'officer':
      return {
        kind: 'officer',
        reason: result.reason,
        ...(result.suggested ? { suggested: result.suggested } : {}),
      };
    case 'refused':
      return { kind: 'not-covered' };
  }
}
