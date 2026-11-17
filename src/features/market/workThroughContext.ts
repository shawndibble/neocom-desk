/** Hands the work-through state to rows inside the panel's memoized table columns, and to the order modal, which would otherwise hold stale state. */
import { createContext, useContext } from 'react';
import type { WorkThrough } from './useWorkThrough';

export interface WorkThroughContextValue {
  workThrough: WorkThrough;
  canOpenInEve: (characterId: number) => boolean;
  /** More than one Character has orders in the queue: Open in EVE lands on each owner's own client. */
  manyOwners: boolean;
}

export const WorkThroughContext = createContext<WorkThroughContextValue | null>(null);

/**
 * The walk's one-tick price for the current order, which the modal copies when
 * its own verdict names none (an undercut order has no "raise to" price).
 * Null outside a walk, while reading, or with no rival to undercut.
 */
export function useWalkCopyPrice(walking: boolean): number | null {
  const context = useContext(WorkThroughContext);
  const price = walking ? (context?.workThrough.preview ?? null) : null;
  return price?.kind === 'price' ? price.price : null;
}
