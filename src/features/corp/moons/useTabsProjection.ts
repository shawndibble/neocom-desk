import { useMemo } from 'react';
import { tabsProjection, type TabsProjection } from '@/engine/corpTaxBook/readModels';
import { READ_MODELS_SCHEMA } from '../../../../functions/src/corpTaxBookVersionKeys';
import { useBook } from './useBook';

/**
 * What the Overview and Miners tabs print (ADR 0032): the read models' figures, falling back to
 * the whole-book view's while the docs are missing.
 */
export function useTabsProjection(): TabsProjection {
  const { view, data } = useBook();
  return useMemo(
    () => tabsProjection(view, data.readModels, READ_MODELS_SCHEMA),
    [view, data.readModels]
  );
}
