import { parseEveNotificationPayload } from '@/engine/eveNotificationPayload';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import { loadStructureName } from '@/features/character/structures';
import { resolveNames } from '@/features/character/names';
import { EVE_NOTIFICATION_RENDERED_TYPES, type EveNotificationNames } from './eveNotificationText';
import { entityIdsToResolve, withinBudget } from './eveNotificationNamePlan';

const RENDERED_TYPES = new Set(EVE_NOTIFICATION_RENDERED_TYPES);

const inFlight = new Map<number, Promise<EveNotificationNames>>();

const MEMO_LIMIT = 200;

async function resolveUncached(fire: EveNotificationFire): Promise<EveNotificationNames> {
  const payload = parseEveNotificationPayload(fire.text);
  const names: EveNotificationNames = {};

  if (payload.structureName === undefined && payload.structureId !== undefined) {
    const structure = await withinBudget(
      loadStructureName(fire.characterId, payload.structureId),
      null
    );
    if (structure !== null) names.structure = structure;
  }

  const entityIds = entityIdsToResolve(fire.type, payload);
  if (entityIds.length > 0) {
    const resolved = await withinBudget(resolveNames(entityIds), new Map<number, string>());
    if (resolved.size > 0) names.entities = resolved;
  }

  return names;
}

export function resolveEveNotificationNames(
  fire: EveNotificationFire
): Promise<EveNotificationNames> {
  if (!RENDERED_TYPES.has(fire.type)) return Promise.resolve({});

  const memoized = inFlight.get(fire.notificationId);
  if (memoized !== undefined) return memoized;

  const pending = resolveUncached(fire).catch(() => ({}) as EveNotificationNames);
  if (inFlight.size >= MEMO_LIMIT) inFlight.clear();
  inFlight.set(fire.notificationId, pending);
  return pending;
}
