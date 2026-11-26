import { DAY_MS } from '@/lib/age';
import { useLiveQuery } from 'dexie-react-hooks';
import { readFeed } from '@/features/notifications/feed';
import { useNow } from '@/lib/useNow';

export const WAR_DECLARED_TYPES: ReadonlySet<string> = new Set([
  'WarDeclared',
  'AllWarDeclaredMsg',
]);
export const WAR_NOTICE_WINDOW_MS = 3 * DAY_MS;

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
