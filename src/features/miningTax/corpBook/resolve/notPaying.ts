import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { db } from '@/db';

/**
 * "Not paying — hide this" (resolving in the app): the member's own, on this device. Nothing is
 * sent and nothing is settled; the book still bills it, and the row says so. Keyed by problem
 * (`notPayingKey`), so a new problem of the same kind still shows.
 */
const KEY = 'miningTaxNotPaying';

/** A day of one book, for one Character. */
export const dayKey = (corporationId: number, characterId: number, date: string) =>
  `day:${corporationId}:${characterId}:${date}`;

/** A book's uncredited donations, by when they were sent: a new one is a new problem. */
export const uncreditedKey = (corporationId: number, sentAt: readonly string[]) =>
  `uncredited:${corporationId}:${[...sentAt].sort().join(',')}`;

export async function readNotPaying(): Promise<Set<string>> {
  try {
    const raw = (await db.settings.get(KEY))?.value;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

async function write(change: (held: Set<string>) => void): Promise<Set<string>> {
  const held = await readNotPaying();
  change(held);
  await db.settings.put({ key: KEY, value: [...held] });
  return held;
}

export const hideNotPaying = (key: string) => write((held) => void held.add(key));
export const showNotPaying = (key: string) => write((held) => void held.delete(key));

// One snapshot for every reader on the page (the Resolve dialog, the quiet line, each row's
// pill), so hiding a day updates them all at once.
let snapshot: ReadonlySet<string> = new Set();
let loaded = false;
const listeners = new Set<() => void>();
const publish = (next: ReadonlySet<string>) => {
  snapshot = next;
  for (const l of listeners) l();
};
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    void readNotPaying().then(publish);
  }
  return () => void listeners.delete(listener);
}

/** The hidden set, and the two ways to change it; a failed write leaves the page as it was. */
export function useNotPaying() {
  const hidden = useSyncExternalStore(subscribe, () => snapshot);
  const hide = useCallback(
    (key: string) =>
      hideNotPaying(key)
        .then(publish)
        .catch(() => undefined),
    []
  );
  const show = useCallback(
    (key: string) =>
      showNotPaying(key)
        .then(publish)
        .catch(() => undefined),
    []
  );
  return useMemo(() => ({ hidden, hide, show }), [hidden, hide, show]);
}
