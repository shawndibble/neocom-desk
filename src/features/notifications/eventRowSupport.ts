/** What the event rows share: the per-Character access read, the Scheduled Push mark, and the context every row is handed. */
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

/**
 * Which "arrives with the app closed" badge an event's row carries, if any:
 * `scheduled` for an event whose every occurrence is a Scheduled Push (read
 * from the Event Entry's `projection.everyOccurrence`, not merely "projects at
 * all": `eveNotification` projects one sub-case only, and a badge there would
 * claim the other types reach you with the app closed); `server` for one the
 * backend pushes on its own (issue #5121, `serverEvents.ts`).
 */
export function pushBadgeKind(
  eventId: NotificationEventId
): 'scheduled' | 'server' | 'nearby' | 'mail' | null {
  if (eventEntry(eventId).projection?.everyOccurrence === true) return 'scheduled';
  // A nearby alert reaches a closed app only under a location-capable Alerts Grant (ADR 0028).
  if (isNearbyServerEvent(eventId)) return 'nearby';
  // New mail reaches a closed app only under a mail-capable Alerts Grant (ADR 0029).
  if (isMailServerEvent(eventId)) return 'mail';
  return isServerPushedEvent(eventId) ? 'server' : null;
}

export interface EventRowContext {
  characters: readonly CharacterRef[];
  scopesByCharacterId: ReadonlyMap<number, ReadonlySet<string>>;
  capabilitiesByCharacterId: ReadonlyMap<number, CorpCapabilities>;
  prefsValue: NotificationPreferencesValue;
  /** Which delivery channels are unusable right now, and why (`channelOff.ts`). */
  channelOff: ChannelOffMap;
  visibleCharacterIds: ReadonlySet<number> | null;
  forceExpanded: boolean;
  isDesktop: boolean;
}

/** Everything one event says about one Character's access to it. */
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

/**
 * The Permission some Characters have not granted for these events, and how
 * many Characters that is. A scope gap only: a corp role gap cannot be fixed by
 * granting anything, and the dimmed chip's tooltip already says so.
 */
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
