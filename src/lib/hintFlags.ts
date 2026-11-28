import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
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

const slots = new Map<string, { owner: string; dismissed: boolean; exclusive: boolean }>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const slotOf = (owner: string) => owner.split(':')[0];
const otherExclusiveShown = (owner: string) =>
  [...slots.values()].some((slot) => slot.exclusive && !slot.dismissed && slot.owner !== owner);

export function claimSessionHint(owner: string, exclusive = false): boolean {
  const slot = slots.get(slotOf(owner));
  if (slot !== undefined && slot.owner !== owner) return false;
  if (slot === undefined) {
    if (exclusive && otherExclusiveShown(owner)) return false;
    slots.set(slotOf(owner), { owner, dismissed: false, exclusive });
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
  return useSyncExternalStore(subscribe, () => {
    const slot = slots.get(slotOf(owner));
    return slot?.owner === owner && !slot.dismissed;
  });
}

export function useOneTimeHint(
  id: string,
  active = true
): [shown: boolean, dismiss: () => void, anchor: (element: HTMLElement | null) => void] {
  const owner = `${id}:${useId()}`;
  const anchorRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [anchorHidden, setAnchorHidden] = useState(false);
  const anchor = useCallback(
    (element: HTMLElement | null) => {
      anchorRef.current = element;
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (element === null || hintSeenCount(useHintCounts.getState().value, id) > 0) return;
      observerRef.current = new ResizeObserver(() =>
        setAnchorHidden(element.checkVisibility?.() === false)
      );
      observerRef.current.observe(element);
    },
    [id]
  );
  const hydrated = useHintCounts((state) => state.hydrated);
  const shown = useSessionHintShown(owner);
  const waiting = useSyncExternalStore(subscribe, () => otherExclusiveShown(owner));
  useEffect(() => {
    if (!active || !hydrated || waiting || anchorHidden) return;
    if (anchorRef.current?.checkVisibility?.() === false) return;
    if (hintSeenCount(useHintCounts.getState().value, id) > 0) return;
    if (claimSessionHint(owner, true)) return () => releaseSessionHint(owner);
  }, [active, hydrated, id, owner, waiting, anchorHidden]);
  const dismiss = () => {
    recordHintSeen(id);
    dismissSessionHint(owner);
  };
  return [shown, dismiss, anchor];
}

export function resetSessionHints(): void {
  slots.clear();
  notify();
}
