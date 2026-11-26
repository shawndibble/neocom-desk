import { createContext, useContext } from 'react';
import type { WorkThrough } from './useWorkThrough';

export interface WorkThroughContextValue {
  workThrough: WorkThrough;
  canOpenInEve: (characterId: number) => boolean;
  manyOwners: boolean;
}

export const WorkThroughContext = createContext<WorkThroughContextValue | null>(null);

export function useWalkCopyPrice(walking: boolean): number | null {
  const context = useContext(WorkThroughContext);
  const price = walking ? (context?.workThrough.preview ?? null) : null;
  return price?.kind === 'price' ? price.price : null;
}
