import type { CorpCapabilities } from '@/engine/corpRoles';
import type { ScopeGroup } from '@/esi/registry';
import { NOTIFICATION_EVENTS, missingEventPermission, type NotificationEventId } from './events';

const EVENT_BY_ID = new Map(NOTIFICATION_EVENTS.map((event) => [event.id, event]));

export interface EventApplicability {
  hasScope: boolean;
  capabilityMissing: boolean;
  rowEnabled: boolean;
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
