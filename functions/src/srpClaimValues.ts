// SRP claim values: the lost ship's Jita value (no cargo) beside the nearest Doctrine Fit's, for the
// officer reading a claim. The pilot's own preview carries the ship's values (srpDoctrineStore.ts).

import { fail, type Caller } from './actorAuth.js';
import type { BookCall } from './corpTaxBook.js';
import { readDoctrines } from './srpDoctrineRead.js';
import { fittedFromKillmail } from './srpDoctrineCheck.js';
import {
  doctrineItems,
  shipFitItems,
  type EsiKillmail,
  type SrpKillmailSource,
} from './srpKillmail.js';
import { authorizeSrpOfficer, claimRef, softJita, type SrpFileDeps } from './srpStore.js';
import type { DoctrineFit, SrpClaimValues } from './srpTypes.js';

/**
 * Appraises the victim's hull and its fitted modules and rigs (the same parts a Doctrine Fit lists,
 * so the comparison is like for like: no charges or drones), and the doctrine's list, if any.
 */
export async function claimValuesOf(
  source: SrpKillmailSource,
  victim: EsiKillmail['victim'],
  doctrine: DoctrineFit | undefined
): Promise<SrpClaimValues> {
  const { hull } = shipFitItems(victim);
  const fitted = fittedFromKillmail(victim);
  const fit = new Map<number, number>();
  for (const id of [...fitted.modules, ...fitted.rigs]) fit.set(id, (fit.get(id) ?? 0) + 1);
  const [hullValue, fitValue, doctrineValue] = await Promise.all([
    softJita(source, hull),
    softJita(source, fit),
    doctrine ? softJita(source, doctrineItems(doctrine.snapshot)) : Promise.resolve(null),
  ]);
  return {
    hullValue,
    fitValue,
    doctrineValue,
    ...(doctrine ? { doctrineName: doctrine.name } : {}),
  };
}

/** An officer reads one claim's ship and doctrine values; nothing is written. */
export async function getSrpClaimValues(
  deps: SrpFileDeps,
  caller: Caller,
  call: BookCall,
  input: { killmailId: number }
): Promise<SrpClaimValues> {
  await authorizeSrpOfficer(deps, caller, call, 'edit');
  const claim = (await claimRef(deps.db, call.corporationId, input.killmailId).get()).data() as
    | {
        killmailHash?: unknown;
        doctrineCheck?: { doctrineId?: string };
      }
    | undefined;
  if (!claim || typeof claim.killmailHash !== 'string') {
    fail('not-found', 'No such SRP claim', 'claim-not-found');
  }
  const km = await deps.killmails.killmail(input.killmailId, claim.killmailHash);
  const doctrineId = claim.doctrineCheck?.doctrineId;
  const doctrines = await readDoctrines(
    deps.db,
    call.corporationId,
    doctrineId === undefined ? [] : [doctrineId]
  );
  return claimValuesOf(
    deps.killmails,
    km.victim,
    doctrineId === undefined ? undefined : doctrines.get(doctrineId)
  );
}

/** `{ killmailId }` of the request; the claim id is the killmail id. */
export function parseClaimValuesInput(data: unknown): { killmailId: number } {
  const id = (data as { killmailId?: unknown } | null)?.killmailId;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
    fail('invalid-argument', 'killmailId must be a killmail id', 'bad-killmail-id');
  }
  return { killmailId: id };
}
