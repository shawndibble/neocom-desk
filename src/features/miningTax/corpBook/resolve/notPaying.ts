import { useCallback, useMemo } from 'react';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { useHydratedStore } from '@/lib/useHydratedStore';

const keys = (raw: unknown): string[] | null =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : null;

export const useNotPayingSetting = createLocalSetting<string[]>({
  key: 'miningTaxNotPaying',
  defaultValue: [],
  parse: keys,
});

export const notPayingDayKey = (corporationId: number, characterId: number, date: string) =>
  `day:${corporationId}:${characterId}:${date}`;

export const uncreditedKey = (corporationId: number, sentAt: readonly string[]) =>
  `uncredited:${corporationId}:${[...sentAt].sort().join(',')}`;

export const noticeKey = (corporationId: number, noticeId: string) =>
  `statement:${corporationId}:${noticeId}`;

export const keptDayKey = (corporationId: number, characterId: number, date: string, at: string) =>
  `kept:${corporationId}:${characterId}:${date}:${at}`;

export const keptNoticeKey = (corporationId: number, noticeId: string, at: string) =>
  `keptStatement:${corporationId}:${noticeId}:${at}`;

export type NotPayingKey =
  | { kind: 'day'; corporationId: number; date: string }
  | { kind: 'uncredited' | 'notice'; corporationId: number };

export function parseNotPayingKey(key: string): NotPayingKey | undefined {
  const [kind, corp, ...rest] = key.split(':');
  const corporationId = Number(corp);
  if (!Number.isInteger(corporationId)) return undefined;
  if (kind === 'day' && rest.length === 2) return { kind, corporationId, date: rest[1] };
  if (kind === 'kept' && rest.length >= 3) return { kind: 'day', corporationId, date: rest[1] };
  if (kind === 'keptStatement' || kind === 'statement') return { kind: 'notice', corporationId };
  if (kind === 'uncredited') return { kind, corporationId };
  return undefined;
}

function changeNotPaying(update: (held: Set<string>) => void) {
  const held = new Set(useNotPayingSetting.getState().value);
  update(held);
  return useNotPayingSetting
    .getState()
    .setValue([...held])
    .catch(() => undefined);
}

export function useNotPaying() {
  useHydratedStore(useNotPayingSetting);
  const list = useNotPayingSetting((s) => s.value);
  const hidden = useMemo<ReadonlySet<string>>(() => new Set(list), [list]);
  const hide = useCallback((key: string) => changeNotPaying((held) => void held.add(key)), []);
  const show = useCallback((key: string) => changeNotPaying((held) => void held.delete(key)), []);
  return useMemo(() => ({ hidden, hide, show }), [hidden, hide, show]);
}
