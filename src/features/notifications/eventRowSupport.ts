/** What the event rows share: the per-Character access read, the Scheduled Push mark, and the context every row is handed. */
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@/esi/registry';
import type { CorpCapabilities } from '@/engine/corpRoles';
import { eventApplicability } from './eventApplicability';
import { eventEntry } from './eventEntries';
import type { NotificationEventId } from './events';
import type { NotificationPreferencesValue } from './preferences';
import type { CharacterAvailability, CharacterRef } from './CharacterChipGrid';

export const EMPTY_SCOPES: ReadonlySet<string> = new Set();

/**
 * Events whose whole row is delivered by Scheduled Push, i.e. the ones that
 * carry the badge. Read from each Event Entry's `projection.everyOccurrence`,
 * not merely "projects at all": `eveNotification` projects one sub-case only,
 * and a badge there would claim the other types reach you with the app closed.
 */
export function isPushBadged(eventId: NotificationEventId): boolean {
  return eventEntry(eventId).projection?.everyOccurrence === true;
}

export interface EventRowContext {
  characters: readonly CharacterRef[];
  scopesByCharacterId: ReadonlyMap<number, ReadonlySet<string>>;
  capabilitiesByCharacterId: ReadonlyMap<number, CorpCapabilities>;
  prefsValue: NotificationPreferencesValue;
  browserBlocked: boolean;
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
