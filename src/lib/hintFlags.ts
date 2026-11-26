import { useEffect, useId, useSyncExternalStore } from 'react';
import { createLocalSetting } from './useLocalSetting';

export type HintCounts = Readonly<Record<string, number>>;

export function parseHintCounts(raw: unknown): HintCounts | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const counts: Record<string, number> = {};
  for (const [id, count] of Object.entries(raw)) {
    if (typeof count === 'number' && Number.isInteger(count) && count > 0) counts[id] = count;
  }
  return counts;
}

export const useHintCounts = createLocalSetting<HintCounts>({
  key: 'hintCounts',
  defaultValue: {},
  parse: parseHintCounts,
});

export function hintSeenCount(counts: HintCounts, id: string): number {
  return counts[id] ?? 0;
}

export function recordHintSeen(id: string): void {
  const { value, setValue } = useHintCounts.getState();
  void setValue({ ...value, [id]: hintSeenCount(value, id) + 1 });
}

const slots = new Map<string, { owner: string; dismissed: boolean }>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const slotOf = (owner: string) => owner.split(':')[0];

export function claimSessionHint(owner: string): boolean {
  const slot = slots.get(slotOf(owner));
  if (slot !== undefined && slot.owner !== owner) return false;
  if (slot === undefined) {
    slots.set(slotOf(owner), { owner, dismissed: false });
    notify();
  }
  return true;
}

export function dismissSessionHint(owner: string): void {
  const slot = slots.get(slotOf(owner));
  if (slot?.owner !== owner) return;
  slot.dismissed = true;
  notify();
}

export function releaseSessionHint(owner: string): void {
  const slot = slots.get(slotOf(owner));
  if (slot?.owner !== owner || slot.dismissed) return;
  slots.delete(slotOf(owner));
  notify();
}

export function useSessionHintShown(owner: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => {
      const slot = slots.get(slotOf(owner));
      return slot?.owner === owner && !slot.dismissed;
    }
  );
}

export function useOneTimeHint(id: string, active = true): [shown: boolean, dismiss: () => void] {
  const owner = `${id}:${useId()}`;
  const hydrated = useHintCounts((state) => state.hydrated);
  const shown = useSessionHintShown(owner);
  useEffect(() => {
    if (!active || !hydrated) return;
    if (hintSeenCount(useHintCounts.getState().value, id) > 0) return;
    if (claimSessionHint(owner)) return () => releaseSessionHint(owner);
  }, [active, hydrated, id, owner]);
  const dismiss = () => {
    recordHintSeen(id);
    dismissSessionHint(owner);
  };
  return [shown, dismiss];
}

export function resetSessionHints(): void {
  slots.clear();
  notify();
}
