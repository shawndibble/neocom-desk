import { useMemo } from 'react';
import { tabsProjection, type TabsProjection } from '@/engine/corpTaxBook/readModels';
import { useBook } from './useBook';

/** What the Overview and Miners tabs print: the whole-book view's figures. */
export function useTabsProjection(): TabsProjection {
  const { view } = useBook();
  return useMemo(() => tabsProjection(view), [view]);
}
