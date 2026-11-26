import { create } from 'zustand';
import { onEsiActivity, type ActivityEvent } from '@/esi/activityLog';

export const MAX_ACTIVITY_ENTRIES = 100;

export interface ActivityLogEntry extends ActivityEvent {
  id: number;
}

interface ActivityLogState {
  entries: ActivityLogEntry[];
  record: (event: ActivityEvent) => void;
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

export function subscribeToEsiActivity(): () => void {
  return onEsiActivity((event) => {
    useActivityLog.getState().record(event);
  });
}
