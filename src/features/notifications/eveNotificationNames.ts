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
import {
  EVE_NOTIFICATION_RENDERED_TYPES,
  orbitalAggressorId,
  type EveNotificationNames,
} from './eveNotificationText';

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
const RESOLUTION_BUDGET_MS = 3_000;

/** Resolves to `fallback` if `work` has not settled within the budget. Never rejects. */
async function withinBudget<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), RESOLUTION_BUDGET_MS);
  });
  try {
    return await Promise.race([work.catch(() => fallback), expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * In-flight and recent resolutions, keyed by notification id. `notificationText`
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
