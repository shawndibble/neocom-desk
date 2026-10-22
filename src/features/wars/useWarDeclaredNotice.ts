import { useLiveQuery } from 'dexie-react-hooks';
import { readFeed } from '@/features/notifications/feed';
import { useNow } from '@/lib/useNow';

/** The EVE notification types that say a war was declared on a pilot's corporation or alliance. */
export const WAR_DECLARED_TYPES: ReadonlySet<string> = new Set([
  'WarDeclared',
  'AllWarDeclaredMsg',
]);
/** How long a declaration notice keeps asking ESI for the war: past this, the sweep has long had it. */
export const WAR_NOTICE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Whether any Character was recently told, by an Alert, that a war was
 * declared. Dismissed or not: dismissing the Alert is not the war ending.
 */
export function useWarDeclaredNotice(): boolean {
  const now = useNow();
  const entries = useLiveQuery(() => readFeed(), [], []);
  return entries.some(
    (entry) =>
      entry.eveType !== undefined &&
      WAR_DECLARED_TYPES.has(entry.eveType) &&
      now - entry.firedAt < WAR_NOTICE_WINDOW_MS
  );
}
