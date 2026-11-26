import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@/esi/registry';
import type { CorpCapabilities } from '@/engine/corpRoles';
import type { ScopeGroup } from '@/esi/registry';
import { eventApplicability } from './eventApplicability';
import { eventEntry } from './eventEntries';
import type { NotificationEventId } from './events';
import { isMailServerEvent, isNearbyServerEvent, isServerPushedEvent } from './serverEvents';
import type { NotificationPreferencesValue } from './preferences';
import type { ChannelOffMap } from './channelOff';
import type { CharacterAvailability, CharacterRef } from './CharacterChipGrid';

export const EMPTY_SCOPES: ReadonlySet<string> = new Set();

export function pushBadgeKind(
  eventId: NotificationEventId
): 'scheduled' | 'server' | 'nearby' | 'mail' | null {
  if (eventEntry(eventId).projection?.everyOccurrence === true) return 'scheduled';
  if (isNearbyServerEvent(eventId)) return 'nearby';
  if (isMailServerEvent(eventId)) return 'mail';
  return isServerPushedEvent(eventId) ? 'server' : null;
}

export interface EventRowContext {
  characters: readonly CharacterRef[];
  scopesByCharacterId: ReadonlyMap<number, ReadonlySet<string>>;
  capabilitiesByCharacterId: ReadonlyMap<number, CorpCapabilities>;
  prefsValue: NotificationPreferencesValue;
  channelOff: ChannelOffMap;
  visibleCharacterIds: ReadonlySet<number> | null;
  forceExpanded: boolean;
  isDesktop: boolean;
}

export function useEventAvailability(
  eventId: NotificationEventId,
  context: Pick<EventRowContext, 'scopesByCharacterId' | 'capabilitiesByCharacterId'>
) {
  const { t } = useTranslation();
  return (characterId: number): CharacterAvailability => {
    const state = eventApplicability(
      eventId,
      context.scopesByCharacterId.get(characterId) ?? EMPTY_SCOPES,
      context.capabilitiesByCharacterId.get(characterId)
    );
    return {
      enabled: state.rowEnabled,
      reason: !state.hasScope ? 'scope' : state.capabilityMissing ? 'capability' : null,
      permissionLabel:
        state.missingPermission === null
          ? undefined
          : t(PERMISSIONS[state.missingPermission].labelKey),
    };
  };
}

export function missingPermissionSummary(
  eventIds: readonly NotificationEventId[],
  context: Pick<EventRowContext, 'characters' | 'scopesByCharacterId'>
): { permission: ScopeGroup; count: number } | null {
  let permission: ScopeGroup | null = null;
  const missing = new Set<number>();
  for (const eventId of eventIds) {
    for (const character of context.characters) {
      const state = eventApplicability(
        eventId,
        context.scopesByCharacterId.get(character.characterId) ?? EMPTY_SCOPES,
        undefined
      );
      if (state.missingPermission === null) continue;
      permission ??= state.missingPermission;
      missing.add(character.characterId);
    }
  }
  return permission === null ? null : { permission, count: missing.size };
}
