// SRP Doctrine Fits (#4857, ADR 0026): the admin-SDK half. A Director saves or deletes a corp's
// Doctrine Fit snapshot (re-checked live, CEO included, like Hull Rules); each change appends to
// the immutable audit log in the same transaction. Any member may preview the fit check of their
// own loss; that writes nothing. Parsing: srpDoctrineInput.ts; the match: srpDoctrineCheck.ts.

import { randomBytes } from 'node:crypto';
import type { BookCall } from './corpTaxBook.js';
import { fail, type Caller } from './corpTaxBookStore.js';
import { doctrinesCollection } from './srpDoctrineRead.js';
import type { KillmailRef } from './srpKillmail.js';
import {
  appendSrpAudit,
  authorizeMember,
  authorizeSrpOfficer,
  doctrineCheckOf,
  fetchOwnLoss,
  srpSettingsRef,
  type SrpFileDeps,
  type SrpDeps,
} from './srpStore.js';
import {
  MAX_DOCTRINES,
  type DoctrineFit,
  type DoctrinePreview,
  type HullRule,
  type SaveDoctrineInput,
  type SrpSettings,
} from './srpTypes.js';

/** Creates or replaces a Doctrine Fit. Returns its id. */
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
    if (!existing) {
      // ids only: the cap needs a count, not the fits
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

/** Deletes a Doctrine Fit and drops it from every Hull Rule that listed it; filed claims keep their result. */
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

/**
 * What a filing of this killmail would store as its doctrine check, with nothing written. Same
 * member and own-loss checks as filing, so it is no way to read another pilot's fit.
 */
export async function previewSrpDoctrineCheck(
  deps: SrpFileDeps,
  caller: Caller,
  call: BookCall,
  ref: KillmailRef
): Promise<DoctrinePreview> {
  const member = await authorizeMember(deps, caller, call);
  const settings = (await srpSettingsRef(deps.db, call.corporationId).get()).data() as
    SrpSettings | undefined;
  if (!settings || settings.enabled !== true) {
    fail('failed-precondition', 'SRP is not on for this corporation', 'srp-off');
  }
  const { km } = await fetchOwnLoss(deps, member, ref);
  const check = await doctrineCheckOf(deps.db, settings, call.corporationId, km.victim);
  return { killmailId: km.killmailId, hullTypeId: km.victim.shipTypeId, check };
}
