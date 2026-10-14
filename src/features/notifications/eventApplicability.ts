/**
 * Whether a Notification Event applies to a Character right now — the one
 * scope/capability read the Settings rows and the cross-Character summary
 * share, so they cannot disagree about which Characters a row covers.
 */
import type { CorpCapabilities } from '@/engine/corpRoles';
import type { ScopeGroup } from '@/esi/registry';
import { NOTIFICATION_EVENTS, missingEventPermission, type NotificationEventId } from './events';

const EVENT_BY_ID = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event]));

export interface EventApplicability {
  hasScope: boolean;
  capabilityMissing: boolean;
  rowEnabled: boolean;
  /** The ungranted Permission behind a missing scope (issue #1525); `null` for a Core Grant scope. */
  missingPermission: ScopeGroup | null;
}

export function eventApplicability(
  eventId: NotificationEventId,
  grantedScopes: ReadonlySet<string>,
  characterCapabilities: CorpCapabilities | undefined
): EventApplicability {
  const def = EVENT_BY_ID.get(eventId);
  if (!def) throw new Error(`Unknown Notification Event id: ${eventId}`);
  const hasScope = def.scope === undefined || grantedScopes.has(def.scope);
  // A capability not yet resolved reads as held — never a false lock while
  // the roles read is still in flight.
  const capabilityMissing = !(
    def.corpCapability === undefined ||
    (characterCapabilities?.[def.corpCapability] ?? true)
  );
  return {
    hasScope,
    capabilityMissing,
    rowEnabled: hasScope && !capabilityMissing,
    missingPermission: missingEventPermission(eventId, grantedScopes),
  };
}

const NO_SCOPES: ReadonlySet<string> = new Set();

/** The Characters (in the order given) an event's row can actually write to. */
export function applicableCharacterIds(
  eventId: NotificationEventId,
  characterIds: readonly number[],
  scopesByCharacterId: ReadonlyMap<number, ReadonlySet<string>>,
  capabilitiesByCharacterId: ReadonlyMap<number, CorpCapabilities>
): number[] {
  return characterIds.filter(
    (id) =>
      eventApplicability(
        eventId,
        scopesByCharacterId.get(id) ?? NO_SCOPES,
        capabilitiesByCharacterId.get(id)
      ).rowEnabled
  );
}
