/**
 * "Seen N times" flags behind the one-time hints (row menu tip and hint, the
 * Go to nudge). Device-local, like `useRecentNav`: a hint is about this
 * screen, not the pilot. One map of hint id to count, so a hint that shows
 * a few times and a hint that shows once share a mechanism.
 *
 * At most one *hint* of each type (a nudge a pilot must dismiss or act on) per
 * session: `claimSessionHint`. Different types can each show. A footer tip
 * inside an open menu is not a hint in that sense and claims nothing.
 */
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

/** Counts one more sighting of `id`. */
export function recordHintSeen(id: string): void {
  const { value, setValue } = useHintCounts.getState();
  void setValue({ ...value, [id]: hintSeenCount(value, id) + 1 });
}

/**
 * One slot per hint *type*: each kind of hint (row menu, column picker, Go to)
 * may show once in a session, but a kind never shows twice at once. An owner
 * is `<hintId>` or `<hintId>:<instance>`; the part before the first `:` names
 * the slot.
 */
const slots = new Map<string, { owner: string; dismissed: boolean }>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const slotOf = (owner: string) => owner.split(':')[0];

/** True when `owner` may show its hint this session: no other instance of its type has, or `owner` already holds it. */
export function claimSessionHint(owner: string): boolean {
  const slot = slots.get(slotOf(owner));
  if (slot !== undefined && slot.owner !== owner) return false;
  if (slot === undefined) {
    slots.set(slotOf(owner), { owner, dismissed: false });
    notify();
  }
  return true;
}

/** `owner` answered its hint; its type stays spent for the session, so no other instance takes its place. */
export function dismissSessionHint(owner: string): void {
  const slot = slots.get(slotOf(owner));
  if (slot?.owner !== owner) return;
  slot.dismissed = true;
  notify();
}

/** `owner` went away without showing its hint to anyone: its type's slot is free again. */
export function releaseSessionHint(owner: string): void {
  const slot = slots.get(slotOf(owner));
  if (slot?.owner !== owner || slot.dismissed) return;
  slots.delete(slotOf(owner));
  notify();
}

/** Whether `owner` holds its type's slot and the hint is still on screen. */
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

/**
 * A hint that shows once ever, on the first component to mount it. `active` gates the claim
 * (false while the hint has nothing to point at). Counted when answered, not
 * when claimed: a hint that never reached the screen is not spent.
 */
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

/** Test seam: a new session. */
export function resetSessionHints(): void {
  slots.clear();
  notify();
}
