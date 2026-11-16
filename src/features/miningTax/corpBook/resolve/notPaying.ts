import { useCallback, useMemo } from 'react';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { useHydratedStore } from '@/lib/useHydratedStore';

/**
 * "Not paying — hide this" (resolving in the app): the member's own, on this device. Nothing is
 * sent and nothing is settled; the book still bills it, and the row says so. Keyed by problem,
 * so a new problem of the same kind still shows.
 */
const keys = (raw: unknown): string[] | null =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : null;

/** The hidden keys, stored as the array they have always been. Exported for tests to reset. */
export const useNotPayingSetting = createLocalSetting<string[]>({
  key: 'miningTaxNotPaying',
  defaultValue: [],
  parse: keys,
});

/** A day of one book, for one Character. */
export const notPayingDayKey = (corporationId: number, characterId: number, date: string) =>
  `day:${corporationId}:${characterId}:${date}`;

/** A book's uncredited donations, by when they were sent: a new one is a new problem. */
export const uncreditedKey = (corporationId: number, sentAt: readonly string[]) =>
  `uncredited:${corporationId}:${[...sentAt].sort().join(',')}`;

/** A Statement of one book: the problem is the whole Statement, not a day. */
export const statementKey = (corporationId: number, statementId: string) =>
  `statement:${corporationId}:${statementId}`;

/** What a hide key is about, for the one quiet line that lists them. */
export type NotPayingKey =
  | { kind: 'day'; corporationId: number; date: string }
  | { kind: 'uncredited' | 'statement'; corporationId: number };

/** Reads a key back; undefined for one this build never wrote. */
export function parseNotPayingKey(key: string): NotPayingKey | undefined {
  const [kind, corp, ...rest] = key.split(':');
  const corporationId = Number(corp);
  if (!Number.isInteger(corporationId)) return undefined;
  if (kind === 'day' && rest.length === 2) return { kind, corporationId, date: rest[1] };
  if (kind === 'uncredited' || kind === 'statement') return { kind, corporationId };
  return undefined;
}

/** The hidden set, and the two ways to change it; one snapshot for every reader on the page. */
export function useNotPaying() {
  useHydratedStore(useNotPayingSetting);
  const list = useNotPayingSetting((s) => s.value);
  const hidden = useMemo<ReadonlySet<string>>(() => new Set(list), [list]);
  const change = (update: (held: Set<string>) => void) => {
    const held = new Set(useNotPayingSetting.getState().value);
    update(held);
    return useNotPayingSetting
      .getState()
      .setValue([...held])
      .catch(() => undefined);
  };
  const hide = useCallback((key: string) => change((held) => void held.add(key)), []);
  const show = useCallback((key: string) => change((held) => void held.delete(key)), []);
  return useMemo(() => ({ hidden, hide, show }), [hidden, hide, show]);
}
