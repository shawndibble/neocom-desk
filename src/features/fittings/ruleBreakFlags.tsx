/**
 * Which fitted modules break a fitting rule (issue #5181), shared with the Ring
 * tiles and List rows through context so the flag needs no prop through every
 * pane, sheet and dialog.
 */
import { createContext, useContext } from 'react';
import { moduleKey } from '@/engine/fittings/skillGaps';
import type { FittingModule } from '@/engine/fittings/types';

const NONE: ReadonlySet<string> = new Set();

export const RuleBreakFlags = createContext<ReadonlySet<string>>(NONE);

/** Whether this module is one a rule break points at. */
export function useBreaksRule(module: Pick<FittingModule, 'slot' | 'slotIndex'> | undefined) {
  const keys = useContext(RuleBreakFlags);
  return module !== undefined && keys.has(moduleKey(module));
}
