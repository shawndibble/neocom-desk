/**
 * The parts of EVE Notification name resolution that touch no store and no
 * network, so the service worker can share them with the app
 * (`eveNotificationNames.ts`, `pushNames.ts`) without pulling in Dexie or the
 * ESI client.
 */
import type { parseEveNotificationPayload } from '@/engine/eveNotificationPayload';
import { orbitalAggressorId } from './eveNotificationRender';

/**
 * Entity ids this type's body would name, if any. Deliberately conservative:
 * a lookup is a live ESI call per fired notification, so a type that renders
 * without one asks for nothing. `StructureUnderAttack` is the interesting
 * case — CCP already writes `corpName`/`allianceName` into the payload, so the
 * pilot id is only worth resolving when neither is there.
 */
export function entityIdsToResolve(
  type: string,
  payload: ReturnType<typeof parseEveNotificationPayload>
): number[] {
  switch (type) {
    case 'CorpAppNewMsg':
      return payload.charId === undefined ? [] : [payload.charId];
    case 'WarDeclared':
    case 'AllWarDeclaredMsg':
      return payload.declaredById === undefined ? [] : [payload.declaredById];
    case 'StructureUnderAttack':
      if (payload.corpName !== undefined || payload.allianceName !== undefined) return [];
      return payload.charId === undefined ? [] : [payload.charId];
    case 'CorpKicked':
      return payload.corpId === undefined ? [] : [payload.corpId];
    case 'OrbitalAttacked': {
      // Same precedence as the renderer, reused directly: pilot, then corp,
      // then alliance — whichever one it would actually show.
      const id = orbitalAggressorId(payload);
      return id === undefined ? [] : [id];
    }
    default:
      return [];
  }
}

/**
 * How long the whole resolution may take before the notification goes out
 * without it. Issue #300: "Name resolution must not block the notification."
 * Catching a *rejection* is not enough for that — an ESI call that simply
 * hangs would hold the alert back indefinitely, and a structure alert that
 * arrives late is the failure this whole domain exists to prevent. The lookups
 * keep running after the race; whatever they cache lands in time for the next
 * fire.
 */
export const RESOLUTION_BUDGET_MS = 3_000;

/** Resolves to `fallback` if `work` has not settled within the budget. Never rejects. */
export async function withinBudget<T>(
  work: Promise<T>,
  fallback: T,
  budgetMs: number = RESOLUTION_BUDGET_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), budgetMs);
  });
  try {
    return await Promise.race([work.catch(() => fallback), expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
