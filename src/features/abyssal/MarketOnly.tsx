import type { ReactNode } from 'react';
import { useIsAbyssalType } from './mutaplasmidData';

/**
 * `children` unless `typeId` is an Abyssal type, which has no order book.
 * Shown while the lookup loads, so an ordinary item's menu entries never pop
 * in under the cursor. Mount it inside menu content: it loads the lookup.
 */
export function MarketOnly({ typeId, children }: { typeId: number; children: ReactNode }) {
  return useIsAbyssalType(typeId) === true ? null : children;
}
