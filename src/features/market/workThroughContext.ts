/** Hands the work-through state to rows inside the panel's memoized table columns, and to the order modal, which would otherwise hold stale state. */
import { createContext } from 'react';
import type { WorkThrough } from './useWorkThrough';

export interface WorkThroughContextValue {
  workThrough: WorkThrough;
  canOpenInEve: (characterId: number) => boolean;
  /** More than one Character has orders in the queue: Open in EVE lands on each owner's own client. */
  manyOwners: boolean;
}

export const WorkThroughContext = createContext<WorkThroughContextValue | null>(null);
