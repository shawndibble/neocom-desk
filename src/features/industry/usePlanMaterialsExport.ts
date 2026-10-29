import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BuildPlanRecord } from '@/db';
import { useTableExport } from '@/components/ui/useTableExport';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';
import { materialsCsvColumns } from './materialsCsv';
import type { MaterialTableRow } from './subBuildPlan';
import type { usePlanMaterials } from './usePlanMaterials';

/** The Materials table's rows as shown, for its export button and row menus. */
export function usePlanMaterialsExport(
  plan: BuildPlanRecord,
  catalog: BlueprintCatalog,
  visibleMaterials: readonly MaterialTableRow[],
  pricesReady: boolean,
  materialAdvice: ReturnType<typeof usePlanMaterials>['materialAdvice']
) {
  const { t } = useTranslation();
  const materialsCsv = useMemo(
    () =>
      materialsCsvColumns(
        t,
        (typeID) => nameForType(catalog, typeID),
        plan.materialSourcing,
        pricesReady,
        materialAdvice
      ),
    [t, catalog, plan.materialSourcing, pricesReady, materialAdvice]
  );
  return useTableExport({
    surface: 'build-materials',
    rows: visibleMaterials,
    columns: materialsCsv,
    // Materials renders one table per section (To buy, Building, …), so no
    // single mounted table holds every row — export the plan's own list.
    source: 'rows',
  });
}
