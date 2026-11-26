import { useCallback } from 'react';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { useRememberedCharacterFilter } from '@/features/character/characterFilterPicks';
import type { CharacterFilterValue } from '@/features/character/characterFilterValue';
import { useRememberedUrlParams } from '@/lib/useUrlState';
import { payeeFilterParam, type PayeeFilter } from './payeeFilter';

const TAX_URL_PARAMS = {
  'tax.character': characterFilterParam('all'),
  'tax.payee': payeeFilterParam(),
};

export const TAX_DEFAULT_SORT = { columnId: 'date', direction: 'desc' as const };

export function useTaxUrlFilters() {
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
