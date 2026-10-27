import { useMemo } from 'react';
import { tabsProjection, type TabsProjection } from '@/engine/corpTaxBook/readModels';
import { READ_MODELS_SCHEMA } from '../../../../functions/src/corpTaxBookVersionKeys';
import { CORP_BOOK_READ_MODELS } from '../taxBook/readModelSwitch';
import { useBook } from './useBook';

/**
 * What the Overview and Miners tabs print (ADR 0032): the whole-book view's figures, or, with
 * `CORP_BOOK_READ_MODELS` on, the read models' (falling back to the view when they are missing).
 */
export function useTabsProjection(): TabsProjection {
  const { view, data } = useBook();
  return useMemo(
    () => tabsProjection(CORP_BOOK_READ_MODELS, view, data.readModels, READ_MODELS_SCHEMA),
    [view, data.readModels]
  );
}
