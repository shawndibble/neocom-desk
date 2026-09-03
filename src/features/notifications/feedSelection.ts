/**
 * Pure selection over the Notification Feed: what the Overview shows for the
 * active Character, and how many alerts each *other* Character is sitting on.
 *
 * The visibility filter runs at render time rather than at write time so that
 * flipping an event off in Settings takes the matching rows off the Overview
 * immediately, instead of only suppressing future fires. That also means
 * flipping it back on restores them — a toggle is a view preference here, not
 * a destructive edit. Dismissing is the destructive one.
 */
import { isEventEnabledFor } from './eventSelection';
import { characterEventPrefs, type NotificationPreferencesValue } from './preferences';
import type { NotificationEventId } from './events';
import type { NotificationFeedRecord as NotificationFeedEntry } from '@/db';

export interface OtherCharacterAlerts {
  characterId: number;
  name: string;
  count: number;
}

/**
 * Gated on the **feed** channel specifically: an event can be set to raise a
 * browser notification while staying out of this list, and the reverse.
 *
 * `eventId` is a plain string on the stored record (`src/db` holds no
 * dependency on this feature), and an entry written by an older build may
 * name an event the catalog no longer has. `isEventEnabledFor` defaults absent
 * ids to enabled, so such a row stays visible and dismissible rather than
 * becoming unreachable clutter.
 */
function isEntryVisible(
  entry: NotificationFeedEntry,
  prefs: NotificationPreferencesValue
): boolean {
  const forCharacter = characterEventPrefs(prefs, entry.characterId);
  return isEventEnabledFor(forCharacter, entry.eventId as NotificationEventId, 'feed');
}

export function visibleFeedEntries(
  entries: readonly NotificationFeedEntry[],
  prefs: NotificationPreferencesValue
): NotificationFeedEntry[] {
  return entries.filter((entry) => isEntryVisible(entry, prefs));
}

export function entriesForCharacter(
  entries: readonly NotificationFeedEntry[],
  characterId: number | null
): NotificationFeedEntry[] {
  if (characterId === null) return [];
  return entries.filter((entry) => entry.characterId === characterId);
}

/**
 * Every other Character holding alerts, most first. Ties break by name so the
 * row keeps a stable order across polls instead of reshuffling whenever two
 * Characters happen to be level. A Character the device no longer knows (a
 * removed login whose entries outlived it) is skipped — there is nothing to
 * switch to.
 */
export function otherCharacterAlerts(
  entries: readonly NotificationFeedEntry[],
  activeCharacterId: number | null,
  nameById: ReadonlyMap<number, string>
): OtherCharacterAlerts[] {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    if (entry.characterId === activeCharacterId) continue;
    if (!nameById.has(entry.characterId)) continue;
    counts.set(entry.characterId, (counts.get(entry.characterId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([characterId, count]) => ({
      characterId,
      name: nameById.get(characterId) as string,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
