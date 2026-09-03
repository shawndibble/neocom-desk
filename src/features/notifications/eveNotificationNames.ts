/**
 * Resolves the names an EVE Notification body wants (issue #300) — the
 * structure under attack, the corporation that declared war, the pilot who
 * applied — through the lookups the app already owns, and hands them to
 * `eveNotificationText.ts` as plain data.
 *
 * **Why this is a separate module from the renderer.** Rendering stays
 * synchronous and free of Dexie/ESI imports so it can be exercised against a
 * payload alone; everything that touches the network lives here. That split is
 * also what keeps #274's original renderer tests running with no mocking at
 * all.
 *
 * **Nothing here is allowed to fail loudly.** Each lookup is caught on its
 * own and contributes nothing on failure, and `resolveEveNotificationNames`
 * never rejects. A structure outside the character's ACL is a *normal* outcome
 * (`features/character/structures.ts`: ESI answers 403 for anything you are
 * not on the ACL for), ESI can be down, and the device can be offline — none
 * of which is a reason to delay or drop a notification. The renderer falls
 * back to an id or a neutral phrase for anything absent here, so a partial
 * result is always useful and an empty one is never fatal.
 */
import { parseEveNotificationPayload } from '@/engine/eveNotificationPayload';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import { loadStructureName } from '@/features/character/structures';
import { resolveNames } from '@/features/character/names';
import { EVE_NOTIFICATION_RENDERED_TYPES, type EveNotificationNames } from './eveNotificationText';

const RENDERED_TYPES = new Set(EVE_NOTIFICATION_RENDERED_TYPES);

/**
 * Entity ids this type's body would name, if any. Deliberately conservative:
 * a lookup is a live ESI call per fired notification, so a type that renders
 * without one asks for nothing. `StructureUnderAttack` is the interesting
 * case — CCP already writes `corpName`/`allianceName` into the payload, so the
 * pilot id is only worth resolving when neither is there.
 */
function entityIdsToResolve(
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
    default:
      return [];
  }
}

/**
 * Names for one fire, best-effort. Returns `{}` for every type that renders
 * generically — the ~85 types outside #300's set cost no ESI traffic at all.
 */
export async function resolveEveNotificationNames(
  fire: EveNotificationFire
): Promise<EveNotificationNames> {
  if (!RENDERED_TYPES.has(fire.type)) return {};

  let payload: ReturnType<typeof parseEveNotificationPayload>;
  try {
    payload = parseEveNotificationPayload(fire.text);
  } catch {
    return {};
  }

  const names: EveNotificationNames = {};

  // Only when the payload does not already carry the name: the moonmining
  // types ship `structureName` inline, and paying for a lookup to learn what
  // is already in hand would be a fetch per fired notification for nothing.
  if (payload.structureName === undefined && payload.structureId !== undefined) {
    try {
      const structure = await loadStructureName(fire.characterId, payload.structureId);
      if (structure !== null) names.structure = structure;
    } catch {
      // 403 (not on the ACL), offline, or an ESI failure — the renderer says
      // `structure #<id>` instead, which is still an actionable notification.
    }
  }

  const entityIds = entityIdsToResolve(fire.type, payload);
  if (entityIds.length > 0) {
    try {
      const resolved = await resolveNames(entityIds);
      if (resolved.size > 0) names.entities = resolved;
    } catch {
      // `resolveNames` already swallows its own ESI failures, but it reads the
      // Dexie name cache afterwards and that can throw on a blocked or
      // upgrading database.
    }
  }

  return names;
}
