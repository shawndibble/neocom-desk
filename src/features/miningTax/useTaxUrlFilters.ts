import { useCallback } from 'react';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { useRememberedCharacterFilter } from '@/features/character/characterFilterPicks';
import type { CharacterFilterValue } from '@/features/character/characterFilterValue';
import { useRememberedUrlParams } from '@/lib/useUrlState';
import { payeeFilterParam, type PayeeFilter } from './payeeFilter';

// Keys scoped `tax.*`: Mining's other tab (`OverviewTab`) has its own
// `character`/sort params on the same route, and `usePageTab` carries the
// query string across a tab switch — unscoped keys would leak Tax's filter
// and sort into Overview and back.
const TAX_URL_PARAMS = {
  'tax.character': characterFilterParam('all'),
  'tax.payee': payeeFilterParam(),
};

export const TAX_DEFAULT_SORT = { columnId: 'date', direction: 'desc' as const };

/** The Tax tab's Character and Payee filters, both held in the URL. */
export function useTaxUrlFilters() {
  // Remembered per device once changed; a first visit stays on All characters.
  const rememberedCharacterFilter = useRememberedCharacterFilter<typeof TAX_URL_PARAMS>(
    'miningTax',
    'tax.character',
    'all'
  );
  const [{ 'tax.character': characterFilter, 'tax.payee': payeeFilter }, setTaxUrlParams] =
    useRememberedUrlParams(TAX_URL_PARAMS, rememberedCharacterFilter);
  const setCharacterFilter = useCallback(
    (next: CharacterFilterValue) => setTaxUrlParams({ 'tax.character': next }),
    [setTaxUrlParams]
  );
  const setPayeeFilter = useCallback(
    (next: PayeeFilter) => setTaxUrlParams({ 'tax.payee': next }),
    [setTaxUrlParams]
  );
  return { characterFilter, payeeFilter, setCharacterFilter, setPayeeFilter };
}
