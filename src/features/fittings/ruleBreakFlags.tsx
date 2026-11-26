import { createContext, useContext } from 'react';
import { moduleKey } from '@/engine/fittings/skillGaps';
import type { FittingModule } from '@/engine/fittings/types';

const NONE: ReadonlySet<string> = new Set();

export const RuleBreakFlags = createContext<ReadonlySet<string>>(NONE);

export function useBreaksRule(module: Pick<FittingModule, 'slot' | 'slotIndex'> | undefined) {
  const keys = useContext(RuleBreakFlags);
  return module !== undefined && keys.has(moduleKey(module));
}
