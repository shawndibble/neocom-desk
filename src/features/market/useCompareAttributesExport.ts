import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTableExport, type UseTableExport } from '@/components/ui/useTableExport';
import {
  buildCompareMatrix,
  type CompareAttributeGroup,
  type CompareAttributeRow,
} from '@/engine/market/attributeCompareMatrix';
import { compareAttributesCsvColumns, flattenCompareGroups } from './compareAttributesCsv';
import type { CompareAttributesData } from './useCompareAttributes';
import type { CompareRow } from './useCompareRows';

/**
 * The matrix's categories, built from the drawer's price rows and dogma.
 * `data` may be absent (still loading) — no categories then.
 */
export function useCompareAttributeGroups(
  rows: readonly CompareRow[],
  data: CompareAttributesData | null
): CompareAttributeGroup[] {
  const { t } = useTranslation();
  return useMemo<CompareAttributeGroup[]>(() => {
    if (!data) return [];
    const matrixItems = rows.map((row) => ({
      typeId: row.typeId,
      dogmaAttributes: data.dogmaByTypeId.get(row.typeId),
      bestSell: row.summary?.bestSell,
    }));
    return buildCompareMatrix(
      matrixItems,
      data.dictionary,
      {
        worth: t('market.compare.worth'),
        estimatedPrice: t('market.compare.estimatedPrice'),
      },
      data.names
    );
  }, [rows, data, t]);
}

/**
 * One export for the whole matrix — every category's rows, in matrix order,
 * each carrying its category — for the drawer's title-bar menu. The drawer
 * owns the title bar, so it owns this hook and hands it to the matrix.
 */
export function useCompareAttributesExport(
  rows: readonly CompareRow[],
  data: CompareAttributesData | null
): UseTableExport<CompareAttributeRow> {
  const { t } = useTranslation();
  const groups = useCompareAttributeGroups(rows, data);
  const flat = useMemo(() => flattenCompareGroups(groups), [groups]);
  const columns = useMemo(
    () => compareAttributesCsvColumns(t, rows, flat.categoryOf),
    [t, rows, flat]
  );
  return useTableExport({
    surface: 'market-compare-attributes',
    rows: flat.rows,
    columns,
    source: 'rows',
  });
}
