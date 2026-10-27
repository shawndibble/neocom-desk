/**
 * Session-only, bounded record of recent ESI activity, so a user (or a
 * support conversation) can see what the app fetched and how it went
 * (issue #32). Mirrors `stores/authFailure.ts`: `esi` publishes a signal,
 * this store is the one subscriber, wired once from the shell so `esi` keeps
 * no dependency on `src/stores` (docs/ARCHITECTURE.md §2).
 *
 * Deliberately NOT persisted to Dexie or synced — device-local in the
 * strongest sense: it doesn't outlive the tab. `entries` carries exactly the
 * fields `esi/activityLog.ts`'s `ActivityEvent` carries (endpointId,
 * characterId, timestamp, outcome) plus a local `id` for React keys; no id,
 * token, or response body has anywhere to enter it.
 */
import { create } from 'zustand';
import { onEsiActivity, type ActivityEvent } from '@/esi/activityLog';

/** Recent activity only — older entries are dropped, not archived. */
export const MAX_ACTIVITY_ENTRIES = 100;

export interface ActivityLogEntry extends ActivityEvent {
  /** Local, monotonically increasing — stable React key even if two events share a timestamp. */
  id: number;
}

interface ActivityLogState {
  /** Most recent first. */
  entries: ActivityLogEntry[];
  record: (event: ActivityEvent) => void;
  /** User-initiated clear (Settings). Session-only store, so there is nothing to purge elsewhere. */
  clear: () => void;
}

let nextId = 1;

export const useActivityLog = create<ActivityLogState>((set) => ({
  entries: [],
  record: (event) => {
    set((state) => ({
      entries: [{ ...event, id: nextId++ }, ...state.entries].slice(0, MAX_ACTIVITY_ENTRIES),
    }));
  },
  clear: () => set({ entries: [] }),
}));

/** Subscribe the store to `esi`'s activity signal; returns an unsubscribe. */
export function subscribeToEsiActivity(): () => void {
  return onEsiActivity((event) => {
    useActivityLog.getState().record(event);
  });
}
