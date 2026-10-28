/**
 * "Seen N times" flags behind the one-time hints (row menu tip and hint, the
 * Go to nudge). Device-local, like `useRecentNav`: a hint is about this
 * screen, not the pilot. One map of hint id to count, so a hint that shows
 * a few times and a hint that shows once share a mechanism.
 *
 * At most one *hint* (a nudge a pilot must dismiss or act on) per session:
 * `claimSessionHint`. A footer tip inside an open menu is not a hint in that
 * sense and does not claim the session.
 */
import { useSyncExternalStore } from 'react';
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

let sessionHint: string | null = null;
let sessionHintDismissed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** True when `owner` may show a hint this session: nobody else has, or `owner` already holds it. */
export function claimSessionHint(owner: string): boolean {
  if (sessionHint !== null && sessionHint !== owner) return false;
  if (sessionHint === null) {
    sessionHint = owner;
    notify();
  }
  return true;
}

/** The session's hint has been answered; it stays spent, so no other hint takes its place. */
export function dismissSessionHint(): void {
  sessionHintDismissed = true;
  notify();
}

/** Whether `owner` holds the session's hint and it is still on screen. */
export function useSessionHintShown(owner: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => sessionHint === owner && !sessionHintDismissed
  );
}

/** Test seam: a new session. */
export function resetSessionHints(): void {
  sessionHint = null;
  sessionHintDismissed = false;
  notify();
}
