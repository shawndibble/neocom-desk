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
 * **Nothing here is allowed to fail loudly, and nothing here is allowed to be
 * slow.** Each lookup is caught on its own, each is raced against
 * `RESOLUTION_BUDGET_MS`, and `resolveEveNotificationNames` never rejects. A
 * structure outside the character's ACL is a *normal* outcome
 * (`features/character/structures.ts`: ESI answers 403 for anything you are
 * not on the ACL for), ESI can be down, and the device can be offline — none
 * of which is a reason to delay or drop a notification. Failing fast matters
 * as much as failing quietly: the ticket's rule is "name resolution must not
 * block the notification", and an ESI call that hangs would break that rule
 * just as thoroughly as one that throws. The renderer falls back to an id or a
 * neutral phrase for anything absent here, so a partial result is always
 * useful and an empty one is never fatal.
 */
import { parseEveNotificationPayload } from '@/engine/eveNotificationPayload';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import { loadStructureName } from '@/features/character/structures';
import { resolveNames } from '@/features/character/names';
import { EVE_NOTIFICATION_RENDERED_TYPES, type EveNotificationNames } from './eveNotificationText';
import { entityIdsToResolve, withinBudget } from './eveNotificationNamePlan';

const RENDERED_TYPES = new Set(EVE_NOTIFICATION_RENDERED_TYPES);

/**
 * In-flight and recent resolutions, keyed by notification id. `renderNotification`
 * is rendered twice per fire — once for the browser notification and once for
 * the Notification Feed entry — and `resolveNames` asks ESI live before it
 * consults its cache, so without this the two renders would cost two
 * `POST /universe/names` round-trips for the same ids.
 */
const inFlight = new Map<number, Promise<EveNotificationNames>>();

/** Small enough that a burst of fires cannot grow it without bound; larger than any one poll's fires. */
const MEMO_LIMIT = 200;

async function resolveUncached(fire: EveNotificationFire): Promise<EveNotificationNames> {
  const payload = parseEveNotificationPayload(fire.text);
  const names: EveNotificationNames = {};

  // Only when the payload does not already carry the name: the moonmining
  // types ship `structureName` inline, and paying for a lookup to learn what
  // is already in hand would be a fetch per fired notification for nothing.
  if (payload.structureName === undefined && payload.structureId !== undefined) {
    // 403 (not on the ACL), offline, or an ESI failure — the renderer says
    // `structure #<id>` instead, which is still an actionable notification.
    const structure = await withinBudget(
      loadStructureName(fire.characterId, payload.structureId),
      null
    );
    if (structure !== null) names.structure = structure;
  }

  const entityIds = entityIdsToResolve(fire.type, payload);
  if (entityIds.length > 0) {
    // `resolveNames` swallows its own ESI failures, but it reads the Dexie name
    // cache afterwards and that can throw on a blocked or upgrading database.
    const resolved = await withinBudget(resolveNames(entityIds), new Map<number, string>());
    if (resolved.size > 0) names.entities = resolved;
  }

  return names;
}

/**
 * Names for one fire, best-effort. Returns `{}` for every type that renders
 * generically — the ~85 types outside #300's set cost no ESI traffic at all —
 * and never rejects.
 */
export function resolveEveNotificationNames(
  fire: EveNotificationFire
): Promise<EveNotificationNames> {
  if (!RENDERED_TYPES.has(fire.type)) return Promise.resolve({});

  const memoized = inFlight.get(fire.notificationId);
  if (memoized !== undefined) return memoized;

  // `resolveUncached` is `async`, so a synchronous throw inside it surfaces as
  // a rejection; this is the one place that has to turn it back into `{}`.
  const pending = resolveUncached(fire).catch(() => ({}) as EveNotificationNames);
  if (inFlight.size >= MEMO_LIMIT) inFlight.clear();
  inFlight.set(fire.notificationId, pending);
  return pending;
}
