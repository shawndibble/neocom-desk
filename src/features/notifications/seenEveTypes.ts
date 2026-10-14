/**
 * ESI notification types the server has seen for each Character (issue #3755,
 * ADR 0020): `registerDevice` returns them and this device keeps the union, so
 * Settings -> Notifications can offer a toggle for a type next time it opens.
 * Device-local on purpose (`createLocalSetting`): the server is the source of
 * truth and re-sends the list on every upload.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

/** characterId (as a string) -> seen ESI types, sorted. */
export type SeenEveTypes = Record<string, string[]>;

export function parseSeenEveTypes(raw: unknown): SeenEveTypes | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return Object.fromEntries(
    Object.entries(raw).map(([characterId, types]) => [
      characterId,
      Array.isArray(types) ? types.filter((t): t is string => typeof t === 'string') : [],
    ])
  );
}

/**
 * Unions the server's list into what is stored, never removing a type — a
 * toggle that was offered must not vanish. Returns `current` itself when
 * nothing is new, so the caller can skip a write.
 */
export function mergeSeenEveTypes(
  current: SeenEveTypes,
  incoming: Readonly<Record<string, readonly string[]>>
): SeenEveTypes {
  let next = current;
  for (const [characterId, types] of Object.entries(incoming)) {
    const have = current[characterId] ?? [];
    const merged = [...new Set([...have, ...types])].sort();
    if (merged.length === have.length) continue;
    next = { ...next, [characterId]: merged };
  }
  return next;
}

export const useSeenEveTypesStore = createLocalSetting<SeenEveTypes>({
  key: 'notifications.seenEveTypes',
  defaultValue: {},
  parse: parseSeenEveTypes,
});

/** Merges a registration response's `seenTypes` into the store. */
export async function recordSeenEveTypes(
  incoming: Readonly<Record<string, readonly string[]>> | undefined
): Promise<void> {
  if (!incoming) return;
  const store = useSeenEveTypesStore.getState();
  await store.hydrate();
  const current = useSeenEveTypesStore.getState().value;
  const next = mergeSeenEveTypes(current, incoming);
  if (next !== current) await useSeenEveTypesStore.getState().setValue(next);
}
